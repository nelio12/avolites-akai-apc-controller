import { ALL_APC_CONTROLS, findControlByCc, findControlById, findControlByNote, getControlNote } from '@/lib/apc-layout'
import { buildLedCommand, selectionLedCommand } from '@/lib/apc-leds'
import { parseLedColor, resolvePadLed, titanIdFromMapping } from '@/lib/mapping'
import type { ApcModel, MidiInputEvent, PadMappingConfig, TriggerType } from '@/types'
import { midiService } from './MidiService'
import { titanApi } from './TitanApiService'

const FADER_THROTTLE_MS = 40

export class MappingEngine {
  private mappings = new Map<string, PadMappingConfig>()
  private model: ApcModel = 'apc-mini'
  private activeTitanIds = new Set<number>()
  private latched = new Set<string>()
  private lastFaderSent = new Map<string, number>()
  private pressedControls = new Set<string>()
  private mappingMode = false
  private selectedPadId: string | null = null
  private listening = false

  setModel(model: ApcModel): void {
    this.model = model
    this.refreshLeds()
  }

  setMappingMode(enabled: boolean): void {
    this.mappingMode = enabled
    if (!enabled) {
      this.listening = false
    }
    this.refreshLeds()
  }

  setSelectedPad(padId: string | null): void {
    this.selectedPadId = padId
    if (this.mappingMode) {
      this.refreshLeds()
    }
  }

  setListening(listening: boolean): void {
    this.listening = listening
    if (this.mappingMode) {
      this.refreshLeds()
    }
  }

  setMappings(mappings: Map<string, PadMappingConfig>): void {
    this.mappings = mappings
    this.refreshLeds()
  }

  setActiveTitanIds(ids: Iterable<number>): void {
    const next = new Set(ids)
    const changed =
      next.size !== this.activeTitanIds.size || [...next].some((id) => !this.activeTitanIds.has(id))
    this.activeTitanIds = next
    if (changed) {
      this.refreshLeds()
    }
  }

  getPressedControls(): Set<string> {
    return this.pressedControls
  }

  async handleMidi(event: MidiInputEvent): Promise<{ controlId?: string; error?: string }> {
    if (event.kind === 'cc') {
      const control = findControlByCc(event.controller)
      if (!control) {
        return {}
      }
      const mapping = this.mappings.get(control.id)
      if (!mapping || this.mappingMode) {
        return { controlId: control.id }
      }
      return this.handleFader(mapping, event.value)
    }

    const control = findControlByNote(event.note, this.model)
    if (!control) {
      return {}
    }

    if (event.pressed) {
      this.pressedControls.add(control.id)
    } else {
      this.pressedControls.delete(control.id)
    }

    if (this.mappingMode) {
      if (event.pressed) {
        this.selectedPadId = control.id
        this.refreshLeds()
      }
      return { controlId: control.id }
    }

    const mapping = this.mappings.get(control.id)
    if (!mapping) {
      return { controlId: control.id }
    }

    try {
      await this.handleTrigger(mapping, event.pressed)
      this.refreshControlLed(mapping)
      return { controlId: control.id }
    } catch (error) {
      return {
        controlId: control.id,
        error: error instanceof Error ? error.message : 'Error al ejecutar el mapeo.'
      }
    }
  }

  refreshLeds(): void {
    for (const control of ALL_APC_CONTROLS) {
      if (control.kind === 'fader') {
        continue
      }

      const note = getControlNote(control, this.model)
      if (note == null) {
        continue
      }

      const kind = control.kind === 'pad' ? 'pad' : 'round'

      if (this.mappingMode && this.selectedPadId === control.id) {
        midiService.sendLed(
          selectionLedCommand({
            model: this.model,
            note,
            kind,
            listening: this.listening
          })
        )
        continue
      }

      const mapping = this.mappings.get(control.id)
      if (!mapping) {
        midiService.sendLed({ note, channel: 0, velocity: 0 })
        continue
      }
      this.refreshControlLed(mapping)
    }
  }

  private refreshControlLed(mapping: PadMappingConfig): void {
    const control = findControlById(mapping.padId)
    if (!control || control.kind === 'fader') {
      return
    }
    const note = getControlNote(control, this.model)
    if (note == null) {
      return
    }

    const titanId = titanIdFromMapping(mapping)
    const titanActive = titanId != null && this.activeTitanIds.has(titanId)
    const locallyLatched = this.latched.has(mapping.padId)
    const pressed = this.pressedControls.has(mapping.padId)
    const active = titanActive || locallyLatched || (mapping.triggerType === 'flash' && pressed)
    const resolved = resolvePadLed(mapping, active)
    const kind = control.kind === 'pad' ? 'pad' : 'round'

    midiService.sendLed(
      buildLedCommand({
        model: this.model,
        note,
        kind,
        color: parseLedColor(resolved.color),
        behavior: resolved.behavior
      })
    )
  }

  private async handleTrigger(mapping: PadMappingConfig, pressed: boolean): Promise<void> {
    const trigger: TriggerType = mapping.triggerType
    const titanId = titanIdFromMapping(mapping)
    if (titanId == null) {
      throw new Error(`Playback Titan inválido: ${mapping.titanPlaybackId}`)
    }

    if (trigger === 'flash') {
      if (pressed) {
        await titanApi.flash(titanId).catch(async () => {
          await titanApi.fireAtLevel(titanId, 1, false)
        })
      } else {
        await titanApi.clearFlash(titanId).catch(async () => {
          await titanApi.kill(titanId)
        })
      }
      return
    }

    if (!pressed) {
      return
    }

    await titanApi.toggleLatch(titanId)
    if (this.latched.has(mapping.padId)) {
      this.latched.delete(mapping.padId)
    } else {
      this.latched.add(mapping.padId)
    }
  }

  private async handleFader(
    mapping: PadMappingConfig,
    value: number
  ): Promise<{ controlId: string; error?: string }> {
    const titanId = titanIdFromMapping(mapping)
    if (titanId == null) {
      return { controlId: mapping.padId, error: `Playback Titan inválido: ${mapping.titanPlaybackId}` }
    }

    const now = Date.now()
    const last = this.lastFaderSent.get(mapping.padId) ?? 0
    if (now - last < FADER_THROTTLE_MS) {
      return { controlId: mapping.padId }
    }
    this.lastFaderSent.set(mapping.padId, now)

    try {
      await titanApi.setLevel(titanId, value / 127)
      return { controlId: mapping.padId }
    } catch (error) {
      return {
        controlId: mapping.padId,
        error: error instanceof Error ? error.message : 'Error al enviar el fader.'
      }
    }
  }
}

export const mappingEngine = new MappingEngine()
