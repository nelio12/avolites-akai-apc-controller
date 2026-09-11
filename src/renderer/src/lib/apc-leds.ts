import type { ApcModel, LedColorName } from '@/types'

export type LedBehavior = 'off' | 'solid' | 'blink'

export interface LedCommand {
  note: number
  channel: number
  velocity: number
}

/** Original APC Mini (MK1): Note On ch 1, velocity 0/1/2/3/4/5/6. No RGB, no brillo. */
const ORIGINAL_PAD_COLORS: Record<LedColorName, { solid: number; blink: number }> = {
  green: { solid: 1, blink: 2 },
  red: { solid: 3, blink: 4 },
  yellow: { solid: 5, blink: 6 }
}

const MK2_PAD_COLORS: Record<LedColorName, number> = {
  green: 87,
  yellow: 74,
  red: 72
}

const COLOR_CSS: Record<LedColorName, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444'
}

export function ledCss(color: LedColorName, behavior: LedBehavior = 'solid', brightness = 100): string {
  if (behavior === 'off' || brightness <= 0) {
    return 'transparent'
  }
  const hex = COLOR_CSS[color]
  const factor = Math.min(1, Math.max(0.35, brightness / 100))
  return mixHex(hex, '#09090b', 1 - factor)
}

function mixHex(hex: string, into: string, amount: number): string {
  const a = hexToRgb(hex)
  const b = hexToRgb(into)
  const mix = (left: number, right: number): number => Math.round(left * (1 - amount) + right * amount)
  return `rgb(${mix(a[0], b[0])} ${mix(a[1], b[1])} ${mix(a[2], b[2])})`
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)]
}

export function mk2BrightnessChannel(percent: number): number {
  if (percent <= 10) {
    return 0
  }
  if (percent <= 25) {
    return 1
  }
  if (percent <= 50) {
    return 2
  }
  if (percent <= 75) {
    return 4
  }
  return 6
}

export function buildLedCommand(params: {
  model: ApcModel
  note: number
  kind: 'pad' | 'round'
  color: LedColorName
  behavior: LedBehavior
  brightness?: number
}): LedCommand {
  return buildLedMessages(params)[0]
}

export function buildLedMessages(params: {
  model: ApcModel
  note: number
  kind: 'pad' | 'round'
  color: LedColorName
  behavior: LedBehavior
  brightness?: number
}): LedCommand[] {
  const { model, note, kind, color, behavior } = params
  const brightness = params.brightness ?? 100

  if (behavior === 'off' || brightness <= 0) {
    return [{ note, channel: 0, velocity: 0 }]
  }

  if (kind !== 'pad') {
    return [{ note, channel: 0, velocity: behavior === 'blink' ? 2 : 1 }]
  }

  if (model === 'apc-mini-mk2') {
    const velocity = MK2_PAD_COLORS[color]
    const channel = behavior === 'blink' ? 12 : mk2BrightnessChannel(brightness)
    return [{ note, channel, velocity }]
  }

  const velocities = ORIGINAL_PAD_COLORS[color]
  return [{ note, channel: 0, velocity: behavior === 'blink' ? velocities.blink : velocities.solid }]
}

export function mk2RgbSysex(note: number, r: number, g: number, b: number): number[] {
  return [0xf0, 0x47, 0x7f, 0x4f, 0x24, 0x00, 0x08, 0x00, note & 0x7f, 0x00, r & 0x7f, g & 0x7f, b & 0x7f, 0x00, 0x00, 0xf7]
}

export function selectionLedCommand(params: {
  model: ApcModel
  note: number
  kind: 'pad' | 'round'
  listening: boolean
}): LedCommand {
  return buildLedCommand({
    model: params.model,
    note: params.note,
    kind: params.kind,
    color: params.listening ? 'red' : 'yellow',
    behavior: 'blink'
  })
}
