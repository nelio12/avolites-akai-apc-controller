import type { ApcModel, LedColorName } from '@/types'

export type LedBehavior = 'off' | 'solid' | 'blink'

export interface LedCommand {
  note: number
  channel: number
  velocity: number
}

const ORIGINAL_PAD_COLORS: Record<LedColorName, { solid: number; blink: number }> = {
  green: { solid: 1, blink: 2 },
  yellow: { solid: 5, blink: 6 },
  red: { solid: 3, blink: 4 },
  orange: { solid: 5, blink: 6 },
  blue: { solid: 1, blink: 2 },
  purple: { solid: 3, blink: 4 },
  white: { solid: 5, blink: 6 }
}

const MK2_PAD_COLORS: Record<LedColorName, number> = {
  green: 87,
  yellow: 74,
  red: 72,
  orange: 61,
  blue: 41,
  purple: 67,
  white: 3
}

const COLOR_CSS: Record<LedColorName, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
  orange: '#f97316',
  blue: '#38bdf8',
  purple: '#a855f7',
  white: '#f8fafc'
}

export function ledCss(color: LedColorName, behavior: LedBehavior = 'solid'): string {
  if (behavior === 'off') {
    return 'transparent'
  }
  return COLOR_CSS[color]
}

export function buildLedCommand(params: {
  model: ApcModel
  note: number
  kind: 'pad' | 'round'
  color: LedColorName
  behavior: LedBehavior
}): LedCommand {
  const { model, note, kind, color, behavior } = params

  if (behavior === 'off') {
    return { note, channel: 0, velocity: 0 }
  }

  if (model === 'apc-mini') {
    if (kind === 'pad') {
      const velocities = ORIGINAL_PAD_COLORS[color]
      return { note, channel: 0, velocity: behavior === 'blink' ? velocities.blink : velocities.solid }
    }

    return { note, channel: 0, velocity: behavior === 'blink' ? 2 : 1 }
  }

  if (kind === 'pad') {
    return {
      note,
      channel: behavior === 'blink' ? 13 : 6,
      velocity: MK2_PAD_COLORS[color]
    }
  }

  return { note, channel: 0, velocity: behavior === 'blink' ? 2 : 1 }
}

export function selectionLedCommand(params: {
  model: ApcModel
  note: number
  kind: 'pad' | 'round'
  listening: boolean
}): LedCommand {
  const { model, note, kind, listening } = params

  if (model === 'apc-mini') {
    return buildLedCommand({
      model,
      note,
      kind,
      color: listening ? 'red' : 'yellow',
      behavior: 'blink'
    })
  }

  return buildLedCommand({
    model,
    note,
    kind,
    color: listening ? 'blue' : 'white',
    behavior: 'blink'
  })
}
