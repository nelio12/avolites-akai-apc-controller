import type { LedColorName, LedBehaviorMode, PadMappingConfig, TriggerType } from '@/types'
import { LED_COLORS } from '@/types'
import type { LedBehavior } from '@/lib/apc-leds'

type LegacyMapping = {
  controlId?: string
  padId?: string
  titanId?: number
  titanPlaybackId?: string
  titanLegend?: string
  titanPlaybackName?: string
  triggerType?: string
  color?: string
  activeColor?: string
  backgroundColor?: string
  backgroundBrightness?: number
  ledBehavior?: string
}

const LEGACY_LED_COLORS: Record<string, LedColorName> = {
  green: 'green',
  red: 'red',
  yellow: 'yellow',
  amber: 'yellow',
  orange: 'yellow',
  white: 'yellow',
  blue: 'green',
  purple: 'red'
}

export function parseLedColor(value: string | undefined): LedColorName {
  if (!value) {
    return 'green'
  }
  return LEGACY_LED_COLORS[value] ?? (LED_COLORS.includes(value as LedColorName) ? (value as LedColorName) : 'green')
}

export function parseTriggerType(value: string | undefined): TriggerType {
  return value === 'latch' ? 'latch' : 'flash'
}

export function parseLedBehaviorMode(value: string | undefined): LedBehaviorMode {
  if (value === 'inverted' || value === 'standard') {
    return value
  }
  return 'background'
}

export function titanIdFromMapping(mapping: PadMappingConfig): number | null {
  const parsed = Number(mapping.titanPlaybackId)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseBackgroundBrightness(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 25
  }
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function resolvePadLed(
  mapping: PadMappingConfig,
  isActive: boolean
): { color: LedColorName; behavior: LedBehavior; brightness: number } {
  const activeColor = parseLedColor(mapping.activeColor)
  const backgroundColor = parseLedColor(mapping.backgroundColor ?? mapping.activeColor)
  const backgroundBrightness = parseBackgroundBrightness(mapping.backgroundBrightness)

  switch (mapping.ledBehavior) {
    case 'inverted':
      return {
        color: activeColor,
        behavior: isActive ? 'off' : 'solid',
        brightness: 100
      }
    case 'background': {
      const idleColor =
        backgroundColor === activeColor ? (activeColor === 'yellow' ? 'green' : 'yellow') : backgroundColor
      return isActive
        ? { color: activeColor, behavior: 'solid', brightness: 100 }
        : { color: idleColor, behavior: 'solid', brightness: backgroundBrightness }
    }
    default:
      return {
        color: activeColor,
        behavior: isActive ? 'solid' : 'off',
        brightness: 100
      }
  }
}

export function createPadMapping(padId: string, playback: { titanId: number; legend: string }, existing?: PadMappingConfig): PadMappingConfig {
  return {
    padId,
    titanPlaybackId: String(playback.titanId),
    titanPlaybackName: playback.legend,
    triggerType: existing?.triggerType ?? 'flash',
    ledBehavior: existing?.ledBehavior ?? 'background',
    activeColor: existing?.activeColor ?? 'green',
    backgroundColor: existing?.backgroundColor ?? 'yellow',
    backgroundBrightness: existing?.backgroundBrightness ?? 100
  }
}

export function normalizePadMapping(raw: unknown): PadMappingConfig | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const item = raw as LegacyMapping
  const padId = item.padId ?? item.controlId
  const titanPlaybackId =
    item.titanPlaybackId ?? (typeof item.titanId === 'number' ? String(item.titanId) : undefined)
  const titanPlaybackName = item.titanPlaybackName ?? item.titanLegend

  if (!padId || !titanPlaybackId || !titanPlaybackName) {
    return null
  }

  const mapping: PadMappingConfig = {
    padId,
    titanPlaybackId,
    titanPlaybackName,
    triggerType: parseTriggerType(item.triggerType),
    ledBehavior: parseLedBehaviorMode(item.ledBehavior),
    activeColor: parseLedColor(item.activeColor ?? item.color),
    backgroundColor: parseLedColor(item.backgroundColor ?? 'yellow'),
    backgroundBrightness: parseBackgroundBrightness(
      typeof item.backgroundBrightness === 'number' ? item.backgroundBrightness : undefined
    )
  }

  return mapping
}

export function mappingsFromList(items: unknown[] | undefined): Map<string, PadMappingConfig> {
  const map = new Map<string, PadMappingConfig>()
  for (const item of items ?? []) {
    const mapping = normalizePadMapping(item)
    if (mapping) {
      map.set(mapping.padId, mapping)
    }
  }
  return map
}

export function cloneMappings(source: Map<string, PadMappingConfig>): Map<string, PadMappingConfig> {
  return new Map(source)
}
