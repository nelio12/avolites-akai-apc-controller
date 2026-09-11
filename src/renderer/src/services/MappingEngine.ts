import { ALL_APC_CONTROLS, findControlByCc, findControlById, findControlByNote, getControlNote } from '@/lib/apc-layout'
import { buildLedMessages } from '@/lib/apc-leds'
import { parseLedColor, resolvePadLed, titanIdFromMapping } from '@/lib/mapping'
import type { ApcControl, ApcModel, MidiInputEvent, PadMappingConfig, TriggerType } from '@/types'
import { midiService } from './MidiService'
import { titanApi } from './TitanApiService'

const FADER_THROTTLE_MS = 40

export class MappingEngine {
  private mappings = new Map<string, PadMappingConfig>()
  private model: ApcModel = 'apc-mini'
  private activeTitanIds = new Set<number>()
  private latched = new Set<string>()
  private lastFaderSent = new Map<string, number>()
  private pendingFader = new Map<string, { mapping: PadMappingConfig; value: number }>()
  private faderTimers = new Map<string, number>()
  private pressedControls = new Set<string>()
  private mappingMode = false
  private selectedPadId: string | null = null
  private listening = false
  private blinkOn = true
  private lastBlinkAt = 0
  private onFaderError: ((message: string | null) => void) | null = null

  setFaderErrorHandler(handler: ((message: string | null) => void) | null): void {
    this.onFaderError = handler
  }

  setModel(model: ApcModel): void {
    if (this.model === model) {
      return
    }
    this.model = model
    this.refreshLeds()
  }

  setMappingMode(enabled: boolean): void {
    this.mappingMode = enabled
    if (!enabled) {
      this.listening = false
    }
    this.restartSelectionBlink()
    this.refreshLeds()
  }

  setSelectedPad(padId: string | null): void {
    this.selectedPadId = padId
    if (this.mappingMode) {
      this.restartSelectionBlink()
      this.refreshLeds()
    }
  }

  setListening(listening: boolean): void {
    this.listening = listening
    if (this.mappingMode) {
      this.restartSelectionBlink()
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

  getLatchedControls(): string[] {
    return [...this.latched]
  }

  ingestMidi(event: MidiInputEvent): { controlId?: string; trigger?: { mapping: PadMappingConfig; pressed: boolean } } {
    if (event.kind === 'cc') {
      const control = findControlByCc(event.controller)
      if (!control) {
        return {}
      }
      const mapping = this.mappings.get(control.id)
      if (mapping) {
        this.queueFader(mapping, event.value)
      }
      return { controlId: control.id }
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
        this.restartSelectionBlink()
        this.refreshLeds()
      }
      return { controlId: control.id }
    }

    const mapping = this.mappings.get(control.id)
    if (!mapping) {
      return { controlId: control.id }
    }

    if (mapping.triggerType === 'latch' && event.pressed) {
      if (this.latched.has(mapping.padId)) {
        this.latched.delete(mapping.padId)
      } else {
        this.latched.add(mapping.padId)
      }
    }

    this.refreshControlLed(mapping)
    return { controlId: control.id, trigger: { mapping, pressed: event.pressed } }
  }

  async commitTrigger(mapping: PadMappingConfig, pressed: boolean): Promise<string | null> {
    try {
      await this.handleTrigger(mapping, pressed)
      this.refreshControlLed(mapping)
      return null
    } catch (error) {
      if (mapping.triggerType === 'latch' && pressed) {
        if (this.latched.has(mapping.padId)) {
          this.latched.delete(mapping.padId)
        } else {
          this.latched.add(mapping.padId)
        }
        this.refreshControlLed(mapping)
      }
      return error instanceof Error ? error.message : 'Error al ejecutar el mapeo.'
    }
  }

  handleClock(now: number): void {
    if (!this.mappingMode || this.selectedPadId == null) {
      return
    }
    if (!this.listening && this.mappings.has(this.selectedPadId)) {
      return
    }
    if (now - this.lastBlinkAt < 280) {
      return
    }
    this.lastBlinkAt = now
    this.blinkOn = !this.blinkOn
    const control = findControlById(this.selectedPadId)
    if (control && control.kind !== 'fader') {
      this.paintSelectionLed(control, this.blinkOn)
    }
  }

  async handleMidi(event: MidiInputEvent): Promise<{ controlId?: string; error?: string }> {
    const ingested = this.ingestMidi(event)
    if (!ingested.trigger) {
      return { controlId: ingested.controlId }
    }
    const error = await this.commitTrigger(ingested.trigger.mapping, ingested.trigger.pressed)
    return { controlId: ingested.controlId, error: error ?? undefined }
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

      if (this.mappingMode && this.selectedPadId === control.id && (this.listening || !this.mappings.has(control.id))) {
        this.paintSelectionLed(control, this.blinkOn)
        continue
      }

      const mapping = this.mappings.get(control.id)
      if (!mapping) {
        this.sendLedMessages([{ note, channel: 0, velocity: 0 }])
        continue
      }
      this.refreshControlLed(mapping)
    }
  }

  private restartSelectionBlink(): void {
    this.blinkOn = true
    this.lastBlinkAt = Date.now()
  }

  private paintSelectionLed(control: ApcControl, on: boolean): void {
    const note = getControlNote(control, this.model)
    if (note == null) {
      return
    }

    if (!on) {
      this.sendLedMessages([{ note, channel: 0, velocity: 0 }])
      return
    }

    const kind = control.kind === 'pad' ? 'pad' : 'round'
    const color = this.listening ? 'red' : 'yellow'

    this.sendLedMessages(
      buildLedMessages({
        model: this.model,
        note,
        kind,
        color,
        behavior: 'solid'
      })
    )
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

    this.sendLedMessages(
      buildLedMessages({
        model: this.model,
        note,
        kind,
        color: parseLedColor(resolved.color),
        behavior: resolved.behavior,
        brightness: this.model === 'apc-mini-mk2' ? resolved.brightness : 100
      })
    )
  }

  private sendLedMessages(commands: { note: number; channel: number; velocity: number }[]): void {
    for (const command of commands) {
      midiService.sendLed(command)
    }
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
  }

  private queueFader(mapping: PadMappingConfig, value: number): void {
    this.pendingFader.set(mapping.padId, { mapping, value })
    if (this.faderTimers.has(mapping.padId)) {
      return
    }

    const elapsed = Date.now() - (this.lastFaderSent.get(mapping.padId) ?? 0)
    const wait = Math.max(0, FADER_THROTTLE_MS - elapsed)
    const timer = window.setTimeout(() => {
      this.faderTimers.delete(mapping.padId)
      const pending = this.pendingFader.get(mapping.padId)
      if (!pending) {
        return
      }
      this.pendingFader.delete(mapping.padId)
      void this.handleFader(pending.mapping, pending.value)
    }, wait)
    this.faderTimers.set(mapping.padId, timer)
  }

  private async handleFader(mapping: PadMappingConfig, value: number): Promise<void> {
    const titanId = titanIdFromMapping(mapping)
    if (titanId == null) {
      this.onFaderError?.(`Playback Titan inválido: ${mapping.titanPlaybackId}`)
      return
    }

    this.lastFaderSent.set(mapping.padId, Date.now())

    try {
      const level = value / 127
      if (level <= 0.001) {
        await titanApi.kill(titanId).catch(async () => {
          await titanApi.setLevel(titanId, 0)
        })
      } else {
        await titanApi.fireAtLevel(titanId, level, false)
      }
      this.onFaderError?.(null)
    } catch (error) {
      this.onFaderError?.(error instanceof Error ? error.message : 'Error al enviar el fader.')
    }
  }
}

export const mappingEngine = new MappingEngine()
