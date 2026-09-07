import { WebMidi, type Input, type Output, type NoteMessageEvent, type ControlChangeMessageEvent } from 'webmidi'
import { detectApcModel, namesLookRelated } from '@/lib/apc-layout'
import type { ApcModel, MidiCcEvent, MidiDeviceInfo, MidiInputEvent, MidiNoteEvent } from '@/types'
import type { LedCommand } from '@/lib/apc-leds'

type StatusListener = (payload: MidiStatus) => void
type EventListener = (event: MidiInputEvent) => void

export interface MidiStatus {
  connected: boolean
  model: ApcModel | null
  inputName: string | null
  outputName: string | null
  error: string | null
  devices: MidiDeviceInfo[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export class MidiService {
  private input: Input | null = null
  private output: Output | null = null
  private model: ApcModel | null = null
  private enabled = false
  private listenersBound = false
  private connectPromise: Promise<boolean> | null = null
  private statusListeners = new Set<StatusListener>()
  private eventListeners = new Set<EventListener>()
  private lastError: string | null = null

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    listener(this.currentStatus())
    return () => this.statusListeners.delete(listener)
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  async initialize(): Promise<void> {
    try {
      await this.enableWebMidi()
      this.bindPortListeners()
      await this.autoConnect()
    } catch (error) {
      this.lastError = this.describeError(error)
      this.emitStatus()
      throw new Error(this.lastError)
    }
  }

  async autoConnect(): Promise<boolean> {
    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = this.runAutoConnect()
    try {
      return await this.connectPromise
    } finally {
      this.connectPromise = null
    }
  }

  private async runAutoConnect(): Promise<boolean> {
    if (this.hasLiveConnection()) {
      this.lastError = null
      this.emitStatus()
      return true
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      const input = this.findApcInput()
      if (input) {
        return this.connect(input.id)
      }
      await sleep(200)
    }

    if (!this.hasLiveConnection()) {
      const names = this.listDevices()
        .map((device) => device.name)
        .join(', ')
      this.lastError = names
        ? `No se ha reconocido un APC Mini. Dispositivos: ${names}`
        : 'No se ha detectado un Akai APC Mini.'
      this.emitStatus()
    }
    return this.hasLiveConnection()
  }

  connect(deviceId: string): boolean {
    const input =
      WebMidi.inputs.find((item) => item.id === deviceId) ?? this.matchInput(deviceId)

    if (!input) {
      this.lastError = 'No se encontró la entrada MIDI seleccionada.'
      this.emitStatus()
      return false
    }

    const output = this.findMatchingOutput(input)
    this.unbind()
    this.input = input
    this.output = output
    this.model = detectApcModel(input.name, input.manufacturer ?? '') ?? 'apc-mini'
    this.lastError = output ? null : 'APC conectado en entrada, pero no hay salida MIDI para LEDs.'

    input.addListener('noteon', this.handleNoteOn)
    input.addListener('noteoff', this.handleNoteOff)
    input.addListener('controlchange', this.handleCc)
    this.emitStatus()
    return true
  }

  disconnect(): void {
    this.unbind()
    this.input = null
    this.output = null
    this.model = null
    this.lastError = null
    this.emitStatus()
  }

  getModel(): ApcModel | null {
    return this.model
  }

  isConnected(): boolean {
    return this.hasLiveConnection()
  }

  sendLed(command: LedCommand): void {
    if (!this.output) {
      return
    }

    try {
      this.output.send([0x90 + (command.channel & 0x0f), command.note & 0x7f, command.velocity & 0x7f])
    } catch (error) {
      this.lastError = this.describeError(error)
      this.emitStatus()
    }
  }

  listDevices(): MidiDeviceInfo[] {
    const byId = new Map<string, MidiDeviceInfo>()
    for (const input of WebMidi.inputs) {
      byId.set(input.id, {
        id: input.id,
        name: input.name,
        manufacturer: input.manufacturer ?? ''
      })
    }
    return [...byId.values()]
  }

  private async enableWebMidi(): Promise<void> {
    if (WebMidi.enabled) {
      this.enabled = true
      return
    }

    try {
      await WebMidi.enable({ sysex: true })
    } catch {
      await WebMidi.enable()
    }
    this.enabled = true
  }

  private bindPortListeners(): void {
    if (this.listenersBound) {
      return
    }

    WebMidi.addListener('connected', this.handlePortConnected)
    WebMidi.addListener('disconnected', this.handlePortDisconnected)
    this.listenersBound = true
  }

  private handlePortConnected = (): void => {
    if (this.hasLiveConnection()) {
      this.emitStatus()
      return
    }
    void this.autoConnect()
  }

  private handlePortDisconnected = (): void => {
    this.refreshConnectionState()
  }

  private findApcInput(): Input | undefined {
    const ranked = WebMidi.inputs.filter((input) => detectApcModel(input.name, input.manufacturer ?? ''))
    return ranked[0] ?? WebMidi.inputs.find((input) => detectApcModel(input.name))
  }

  private findMatchingOutput(input: Input): Output | null {
    const byId = WebMidi.outputs.find((item) => item.id === input.id)
    if (byId) {
      return byId
    }

    const byExactName = WebMidi.outputs.find((item) => item.name === input.name)
    if (byExactName) {
      return byExactName
    }

    const related = WebMidi.outputs.find((item) => namesLookRelated(item.name, input.name))
    if (related) {
      return related
    }

    const apcOutput = WebMidi.outputs.find((item) => detectApcModel(item.name, item.manufacturer ?? ''))
    return apcOutput ?? null
  }

  private handleNoteOn = (event: NoteMessageEvent): void => {
    const velocity = typeof event.rawValue === 'number' ? event.rawValue : event.note.rawAttack
    this.emitEvent({
      kind: 'note',
      note: event.note.number,
      velocity,
      pressed: velocity > 0,
      timestamp: event.timestamp
    })
  }

  private handleNoteOff = (event: NoteMessageEvent): void => {
    this.emitEvent({
      kind: 'note',
      note: event.note.number,
      velocity: 0,
      pressed: false,
      timestamp: event.timestamp
    })
  }

  private handleCc = (event: ControlChangeMessageEvent): void => {
    this.emitEvent({
      kind: 'cc',
      controller: event.controller.number,
      value: midiRawValue(event.rawValue, event.value),
      timestamp: event.timestamp
    })
  }

  private matchInput(deviceIdOrName: string): Input | undefined {
    const needle = deviceIdOrName.toLowerCase()
    return WebMidi.inputs.find(
      (item) => item.id === deviceIdOrName || item.name.toLowerCase() === needle || namesLookRelated(item.name, deviceIdOrName)
    )
  }

  private unbind(): void {
    this.input?.removeListener('noteon', this.handleNoteOn)
    this.input?.removeListener('noteoff', this.handleNoteOff)
    this.input?.removeListener('controlchange', this.handleCc)
  }

  private hasLiveConnection(): boolean {
    return Boolean(this.input && WebMidi.inputs.some((item) => item.id === this.input?.id))
  }

  private refreshConnectionState(): void {
    if (this.input && !WebMidi.inputs.some((item) => item.id === this.input?.id)) {
      this.unbind()
      this.input = null
      this.output = null
      this.model = null
      this.lastError = 'El APC Mini se ha desconectado.'
      this.emitStatus()
      void this.autoConnect()
      return
    }
    this.emitStatus()
  }

  private currentStatus(): MidiStatus {
    return {
      connected: this.hasLiveConnection(),
      model: this.model,
      inputName: this.input?.name ?? null,
      outputName: this.output?.name ?? null,
      error: this.lastError,
      devices: this.enabled || WebMidi.enabled ? this.listDevices() : []
    }
  }

  private emitStatus(): void {
    const status = this.currentStatus()
    for (const listener of this.statusListeners) {
      listener(status)
    }
  }

  private emitEvent(event: MidiInputEvent): void {
    for (const listener of this.eventListeners) {
      listener(event)
    }
  }

  private describeError(error: unknown): string {
    if (error instanceof Error && error.name === 'SecurityError') {
      return 'Electron ha denegado el permiso MIDI. Recarga la app y acéptalo.'
    }
    if (error instanceof Error) {
      return error.message
    }
    return 'Error MIDI desconocido.'
  }
}

function midiRawValue(rawValue: number | undefined, value: number | boolean | undefined): number {
  if (typeof rawValue === 'number') {
    return rawValue
  }
  if (typeof value === 'number') {
    return value <= 1 ? Math.round(value * 127) : value
  }
  return value ? 127 : 0
}

export const midiService = new MidiService()
