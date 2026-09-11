export type TriggerType = 'flash' | 'latch'
export type LedBehaviorMode = 'standard' | 'inverted' | 'background'
export type LedColorName = 'green' | 'yellow' | 'red'
export type ApcModel = 'apc-mini' | 'apc-mini-mk2'
export type ControlKind = 'pad' | 'track' | 'scene' | 'shift' | 'fader'
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

export interface PadMappingConfig {
  padId: string
  titanPlaybackId: string
  titanPlaybackName: string
  triggerType: TriggerType
  ledBehavior: LedBehaviorMode
  activeColor: string
  backgroundColor?: string
  backgroundBrightness?: number
}

export interface TitanHandleLocation {
  group: string
  index: number
  page: number
}

export interface TitanPlayback {
  titanId: number
  userNumber?: number
  legend: string
  type: string
  active: boolean
  group: string
  page?: number
  index?: number
  locationLabel: string
}

export interface MappingProfileFile {
  version: 1 | 2
  name: string
  createdAt: string
  titan: {
    host: string
    port: number
  }
  mappings: PadMappingConfig[]
}

export interface MidiDeviceInfo {
  id: string
  name: string
  manufacturer: string
}

export interface MidiNoteEvent {
  kind: 'note'
  note: number
  velocity: number
  pressed: boolean
  timestamp: number
}

export interface MidiCcEvent {
  kind: 'cc'
  controller: number
  value: number
  timestamp: number
}

export type MidiInputEvent = MidiNoteEvent | MidiCcEvent

export interface ApcControl {
  id: string
  kind: ControlKind
  label: string
  row: number
  col: number
  noteOriginal?: number
  noteMk2?: number
  cc?: number
}

export const LED_COLORS: LedColorName[] = ['green', 'red', 'yellow']
export const BACKGROUND_BRIGHTNESS_LEVELS = [10, 25, 50, 75] as const

export const TRIGGER_TYPES: { value: TriggerType; label: string; description: string }[] = [
  { value: 'flash', label: 'Flash', description: 'Enciende al pulsar y apaga al soltar.' },
  { value: 'latch', label: 'Latch', description: 'Alterna activado/desactivado con cada pulsación.' }
]

export const LED_BEHAVIOR_MODES: { value: LedBehaviorMode; label: string; description: string }[] = [
  {
    value: 'standard',
    label: 'Standard',
    description: 'Apagado cuando el playback está inactivo. Color activo al disparar.'
  },
  {
    value: 'inverted',
    label: 'Inverted',
    description: 'Encendido en reposo. Se apaga cuando el playback está activo.'
  },
  {
    value: 'background',
    label: 'Background',
    description: 'Inactivo: color de fondo. Activo: color primario. El Mini original no regula brillo.'
  }
]
