import { WebMidi, type Input, type Output, type NoteMessageEvent, type ControlChangeMessageEvent } from 'webmidi'
import { detectApcModel, namesLookRelated } from '@/lib/apc-layout'
import type { ApcModel, MidiDeviceInfo, MidiInputEvent } from '@/types'
import { mk2RgbSysex, type LedCommand } from '@/lib/apc-leds'

type StatusListener = (payload: MidiStatus) => void
type EventListener = (event: MidiInputEvent) => void

export interface MidiStatus {
  connected: boolean
  model: ApcModel | null
  inputName: string | null
  outputName: string | null
  error: string | null
  devices: MidiDeviceInfo[]
  generation: number
}

const PORT_SETTLE_MS = 2000
const DISCONNECT_GRACE_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export class MidiService {
  private input: Input | null = null
  private output: Output | null = null
  private model: ApcModel | null = null
  private boundInputName: string | null = null
  private enabled = false
  private listenersBound = false
  private connectPromise: Promise<boolean> | null = null
  private statusListeners = new Set<StatusListener>()
  private eventListeners = new Set<EventListener>()
  private lastError: string | null = null
  private modeInitialized = false
  private quietUntil = 0
  private disconnectTimer: number | null = null
  private settleTimer: number | null = null
  private ledCache = new Map<string, number>()
  private ledChannelByNote = new Map<number, number>()
  private generation = 0
  private ledsReady = false
  private identityModel: ApcModel | null = null
  private modelOverride: ApcModel | null = null
  private modeToken = 0
  private sysexBound = false

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

  async reconnect(): Promise<boolean> {
    this.modeInitialized = false
    this.quietUntil = 0
    this.ledsReady = false
    this.identityModel = null
    this.clearDisconnectTimer()
    this.clearSettleTimer()
    this.unbind()
    this.input = null
    this.output = null
    this.boundInputName = null
    this.ledCache.clear()
    this.ledChannelByNote.clear()
    return this.autoConnect()
  }

  private async runAutoConnect(): Promise<boolean> {
    if (this.hasLiveConnection()) {
      this.ensureOutput()
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

    if (this.hasLiveConnection() || this.isQuiet() || this.deviceStillPresent()) {
      this.rebindByName()
      this.emitStatus()
      return this.hasLiveConnection()
    }

    const names = this.listDevices()
      .map((device) => device.name)
      .join(', ')
    this.lastError = names
      ? `No se ha reconocido un APC Mini. Dispositivos: ${names}`
      : 'No se ha detectado un Akai APC Mini.'
    this.emitStatus()
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

    if (this.input?.id === input.id && this.hasLiveConnection()) {
      this.ensureOutput()
      this.emitStatus()
      return true
    }

    this.unbind()
    this.input = input
    this.boundInputName = input.name
    this.model = this.resolvedModel(input)
    this.ensureOutput()
    this.bindInput(input)
    this.lastError =
      this.ledOutputs().length > 0 ? null : 'APC conectado en entrada, pero no hay salida MIDI para LEDs.'

    if (!this.modeInitialized) {
      this.enterDeviceModeOnce()
    } else {
      this.bumpLeds()
    }

    this.emitStatus()
    return true
  }

  disconnect(): void {
    this.modeInitialized = false
    this.quietUntil = 0
    this.clearDisconnectTimer()
    this.clearSettleTimer()
    this.unbind()
    this.input = null
    this.output = null
    this.model = null
    this.boundInputName = null
    this.lastError = null
    this.ledCache.clear()
    this.ledChannelByNote.clear()
    this.ledsReady = false
    this.emitStatus()
  }

  getModel(): ApcModel | null {
    return this.model
  }

  forceLedProtocol(model: ApcModel): void {
    this.modelOverride = model
    this.model = model
    this.ledCache.clear()
    this.ledChannelByNote.clear()
    this.ledsReady = true
    this.generation += 1
    this.emitStatus()
  }

  isConnected(): boolean {
    return this.hasLiveConnection()
  }

  sendLed(command: LedCommand): void {
    if (!this.ledsReady) {
      return
    }

    const outputs = this.ledOutputs()
    if (outputs.length === 0) {
      return
    }

    const model = this.model ?? 'apc-mini'
    const next =
      model === 'apc-mini-mk2' ? command : { ...command, channel: 0 }

    const previousChannel = this.ledChannelByNote.get(next.note)
    const shouldOffPrevious =
      previousChannel != null &&
      previousChannel !== next.channel &&
      !(previousChannel === 0 && next.channel > 0)

    for (const output of outputs) {
      if (shouldOffPrevious && previousChannel != null) {
        this.writeNoteOn(output, { note: next.note, channel: previousChannel, velocity: 0 })
        this.ledCache.set(this.cacheKey(output, next.note, previousChannel), 0)
      }
      this.writeCached(output, next)
    }

    this.ledChannelByNote.set(next.note, next.channel)
  }

  sendRgb(note: number, r: number, g: number, b: number): void {
    if (!this.ledsReady) {
      return
    }
    const outputs = this.ledOutputs()
    if (outputs.length === 0) {
      return
    }
    const bytes = mk2RgbSysex(note, r, g, b)
    const key = `rgb:${note}`
    const packed = (r << 16) | (g << 8) | b
    if (this.ledCache.get(key) === packed) {
      return
    }
    for (const output of outputs) {
      this.sendBytes(output, bytes)
    }
    this.ledCache.set(key, packed)
  }

  private writeCached(output: Output, command: LedCommand): void {
    const key = this.cacheKey(output, command.note, command.channel)
    if (this.ledCache.get(key) === command.velocity) {
      return
    }
    this.writeNoteOn(output, command)
    this.ledCache.set(key, command.velocity)
  }

  private cacheKey(output: Output, note: number, channel: number): string {
    return `${output.id}:${note}:${channel}`
  }

  private writeNoteOn(output: Output, command: LedCommand): void {
    const status = 0x90 + (command.channel & 0x0f)
    const bytes = [status, command.note & 0x7f, command.velocity & 0x7f]
    if (this.sendRaw(output, bytes)) {
      return
    }

    try {
      const channel = ((command.channel & 0x0f) + 1) as 1
      if (command.velocity <= 0) {
        output.stopNote(command.note, { channels: channel })
      } else {
        output.playNote(command.note, {
          channels: channel,
          rawAttack: command.velocity
        })
      }
    } catch {
      this.ledCache.delete(this.cacheKey(output, command.note, command.channel))
    }
  }

  private sendRaw(output: Output, bytes: number[]): boolean {
    try {
      output.send(bytes)
      return true
    } catch {
      // Algunos hosts exigen Uint8Array.
    }

    try {
      output.send(Uint8Array.from(bytes))
      return true
    } catch {
      // Continuar con el puerto nativo.
    }

    try {
      const native = (output as unknown as { _midiOutput?: { send: (data: Uint8Array) => void } })._midiOutput
      native?.send(Uint8Array.from(bytes))
      return Boolean(native)
    } catch {
      return false
    }
  }

  private ledOutputs(): Output[] {
    if (!WebMidi.enabled) {
      return this.output ? [this.output] : []
    }
    this.ensureOutput()
    const apc = WebMidi.outputs.filter((item) => detectApcModel(item.name, item.manufacturer ?? ''))
    const unique = new Map<string, Output>()
    for (const output of apc) {
      unique.set(output.id, output)
    }
    if (this.output) {
      unique.set(this.output.id, this.output)
    }
    return [...unique.values()]
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

  private getOutput(): Output | null {
    if (this.output && WebMidi.outputs.some((item) => item.id === this.output?.id)) {
      return this.output
    }
    this.ensureOutput()
    return this.output
  }

  private ensureOutput(): void {
    if (this.output && WebMidi.outputs.some((item) => item.id === this.output?.id)) {
      return
    }
    this.output = this.input ? this.findMatchingOutput(this.input) : this.findApcOutput()
  }

  private enterDeviceModeOnce(): void {
    const outputs = this.ledOutputs()
    if (outputs.length === 0) {
      return
    }

    this.modeInitialized = true
    this.ledsReady = false
    this.quietUntil = Date.now() + PORT_SETTLE_MS
    this.ledCache.clear()
    this.ledChannelByNote.clear()

    for (const output of outputs) {
      this.sendModeInit(output)
    }
    window.setTimeout(() => {
      if (this.hasLiveConnection()) {
        this.bumpLeds()
      }
    }, 400)
    this.scheduleSettle()
  }

  private sendModeInit(output: Output): void {
    const model = this.resolvedModel(this.input)
    if (model === 'apc-mini-mk2') {
      this.sendBytes(output, [0xf0, 0x47, 0x7f, 0x4f, 0x60, 0x00, 0x04, 0x00, 0x01, 0x00, 0x00, 0xf7])
      this.sendBytes(output, [0xf0, 0x47, 0x7f, 0x4f, 0x62, 0x00, 0x01, 0x00, 0xf7])
      return
    }

    this.sendBytes(output, [0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7])
    this.sendBytes(output, [0xf0, 0x47, 0x7f, 0x28, 0x60, 0x00, 0x04, 0x41, 0x09, 0x01, 0x04, 0xf7])
  }

  private sendBytes(output: Output, bytes: number[]): void {
    if (this.sendRaw(output, bytes)) {
      return
    }

    if (bytes[0] !== 0xf0 || bytes[bytes.length - 1] !== 0xf7 || bytes.length < 3) {
      return
    }

    try {
      output.sendSysex(bytes[1], bytes.slice(2, -1))
    } catch {
      // Sin SysEx el firmware puede quedarse en Note Mode.
    }
  }

  private resolvedModel(input: Input | null): ApcModel {
    if (this.modelOverride) {
      return this.modelOverride
    }
    if (this.identityModel) {
      return this.identityModel
    }
    if (input) {
      return detectApcModel(input.name, input.manufacturer ?? '') ?? this.model ?? 'apc-mini'
    }
    return this.model ?? 'apc-mini'
  }

  private handleSysex = (event: { message?: { data?: Iterable<number> } }): void => {
    const data = Array.from(event.message?.data ?? [])
    const detected = modelFromSysex(data)
    if (!detected || this.identityModel === detected) {
      return
    }

    this.identityModel = detected
    if (this.modelOverride) {
      return
    }

    if (this.model !== detected) {
      this.model = detected
      const output = this.getOutput()
      if (output) {
        this.sendModeInit(output)
      }
      this.emitStatus()
    }
  }

  private bumpLeds(): void {
    this.ledsReady = true
    this.generation += 1
    this.ledCache.clear()
    this.ledChannelByNote.clear()
    this.emitStatus()
  }

  private scheduleSettle(): void {
    this.clearSettleTimer()
    const wait = Math.max(0, this.quietUntil - Date.now())
    this.settleTimer = window.setTimeout(() => {
      this.settleTimer = null
      this.rebindByName()
      if (!this.hasLiveConnection()) {
        this.scheduleDisconnectCheck()
        return
      }
      this.lastError = this.output ? null : this.lastError
      this.bumpLeds()
    }, wait + 50)
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
    this.clearDisconnectTimer()

    if (this.boundInputName || this.input) {
      const hadOutput = Boolean(this.output)
      this.rebindByName()
      if (this.hasLiveConnection()) {
        if (!hadOutput && this.output) {
          this.lastError = null
          if (!this.modeInitialized) {
            void this.enterDeviceModeOnce()
          } else {
            this.bumpLeds()
          }
        }
        return
      }
      this.scheduleDisconnectCheck()
      return
    }

    void this.autoConnect()
  }

  private handlePortDisconnected = (): void => {
    if (this.isQuiet()) {
      this.rebindByName()
      return
    }

    if (this.hasLiveConnection()) {
      this.ensureOutput()
      return
    }

    if (this.deviceStillPresent()) {
      this.rebindByName()
      return
    }

    this.scheduleDisconnectCheck()
  }

  private scheduleDisconnectCheck(): void {
    this.clearDisconnectTimer()
    this.disconnectTimer = window.setTimeout(() => {
      this.disconnectTimer = null
      this.rebindByName()
      if (this.hasLiveConnection()) {
        this.lastError = null
        this.emitStatus()
        return
      }
      this.unbind()
      this.input = null
      this.output = null
      this.model = null
      this.identityModel = null
      this.modeInitialized = false
      this.ledCache.clear()
      this.ledChannelByNote.clear()
      this.ledsReady = false
      this.lastError = 'El APC Mini se ha desconectado.'
      this.emitStatus()
      void this.autoConnect()
    }, DISCONNECT_GRACE_MS)
  }

  private rebindByName(): void {
    const input =
      (this.boundInputName
        ? WebMidi.inputs.find((item) => item.name === this.boundInputName)
        : undefined) ?? this.findApcInput()

    if (!input) {
      return
    }

    if (this.input?.id !== input.id) {
      this.unbind()
      this.input = input
      this.boundInputName = input.name
      this.model = this.resolvedModel(input)
      this.bindInput(input)
    }

    this.ensureOutput()
    if (this.output && this.lastError?.includes('salida MIDI')) {
      this.lastError = null
    }
  }

  private findApcInput(): Input | undefined {
    const ranked = WebMidi.inputs.filter((input) => detectApcModel(input.name, input.manufacturer ?? ''))
    return ranked[0] ?? WebMidi.inputs.find((input) => detectApcModel(input.name))
  }

  private findApcOutput(): Output | null {
    const ranked = WebMidi.outputs.filter((item) => detectApcModel(item.name, item.manufacturer ?? ''))
    return ranked[0] ?? null
  }

  private findMatchingOutput(input: Input): Output | null {
    const apcOutputs = WebMidi.outputs.filter((item) => detectApcModel(item.name, item.manufacturer ?? ''))
    const pool = apcOutputs.length > 0 ? apcOutputs : [...WebMidi.outputs]

    return (
      pool.find((item) => item.id === input.id) ??
      pool.find((item) => item.name === input.name) ??
      pool.find((item) => namesLookRelated(item.name, input.name)) ??
      apcOutputs[0] ??
      null
    )
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

  private bindInput(input: Input): void {
    input.addListener('noteon', this.handleNoteOn)
    input.addListener('noteoff', this.handleNoteOff)
    input.addListener('controlchange', this.handleCc)
    this.bindSysex()
  }

  private bindSysex(): void {
    if (this.sysexBound || !this.input) {
      return
    }
    try {
      this.input.addListener('sysex', this.handleSysex)
      this.sysexBound = true
    } catch {
      this.sysexBound = false
    }
  }

  private unbind(): void {
    this.input?.removeListener('noteon', this.handleNoteOn)
    this.input?.removeListener('noteoff', this.handleNoteOff)
    this.input?.removeListener('controlchange', this.handleCc)
    if (this.sysexBound) {
      try {
        this.input?.removeListener('sysex', this.handleSysex)
      } catch {
        // El puerto ya no admite SysEx.
      }
      this.sysexBound = false
    }
  }

  private hasLiveConnection(): boolean {
    return Boolean(this.input && WebMidi.inputs.some((item) => item.id === this.input?.id))
  }

  private deviceStillPresent(): boolean {
    if (this.hasLiveConnection()) {
      return true
    }
    return Boolean(this.boundInputName && WebMidi.inputs.some((item) => item.name === this.boundInputName))
  }

  private isQuiet(): boolean {
    return Date.now() < this.quietUntil
  }

  private clearDisconnectTimer(): void {
    if (this.disconnectTimer != null) {
      window.clearTimeout(this.disconnectTimer)
      this.disconnectTimer = null
    }
  }

  private clearSettleTimer(): void {
    if (this.settleTimer != null) {
      window.clearTimeout(this.settleTimer)
      this.settleTimer = null
    }
  }

  private currentStatus(): MidiStatus {
    return {
      connected: this.hasLiveConnection(),
      model: this.model,
      inputName: this.input?.name ?? this.boundInputName,
      outputName: this.ledOutputs().map((item) => item.name).join(' · ') || this.output?.name || null,
      error: this.lastError,
      devices: this.enabled || WebMidi.enabled ? this.listDevices() : [],
      generation: this.generation
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

function modelFromSysex(data: number[]): ApcModel | null {
  if (data[0] !== 0xf0) {
    return null
  }

  if (data[1] === 0x7e && data[3] === 0x06 && data[4] === 0x02) {
    if (data[5] === 0x47 && data[6] === 0x4f) {
      return 'apc-mini-mk2'
    }
    if (data[5] === 0x47 && data[6] === 0x28) {
      return 'apc-mini'
    }
  }

  return null
}

export const midiService = new MidiService()
