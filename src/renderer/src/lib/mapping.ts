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
  ledBehavior?: string
}

export function parseLedColor(value: string | undefined): LedColorName {
  if (value && LED_COLORS.includes(value as LedColorName)) {
    return value as LedColorName
  }
  return 'green'
}

export function parseTriggerType(value: string | undefined): TriggerType {
  return value === 'latch' ? 'latch' : 'flash'
}

export function parseLedBehaviorMode(value: string | undefined): LedBehaviorMode {
  if (value === 'inverted' || value === 'background') {
    return value
  }
  return 'standard'
}

export function titanIdFromMapping(mapping: PadMappingConfig): number | null {
  const parsed = Number(mapping.titanPlaybackId)
  return Number.isFinite(parsed) ? parsed : null
}

export function resolvePadLed(
  mapping: PadMappingConfig,
  isActive: boolean
): { color: LedColorName; behavior: LedBehavior } {
  const activeColor = parseLedColor(mapping.activeColor)
  const backgroundColor = parseLedColor(mapping.backgroundColor)

  switch (mapping.ledBehavior) {
    case 'inverted':
      return {
        color: activeColor,
        behavior: isActive ? 'off' : 'solid'
      }
    case 'background':
      return {
        color: isActive ? activeColor : backgroundColor,
        behavior: 'solid'
      }
    default:
      return {
        color: activeColor,
        behavior: isActive ? 'solid' : 'off'
      }
  }
}

export function createPadMapping(padId: string, playback: { titanId: number; legend: string }, existing?: PadMappingConfig): PadMappingConfig {
  return {
    padId,
    titanPlaybackId: String(playback.titanId),
    titanPlaybackName: playback.legend,
    triggerType: existing?.triggerType ?? 'flash',
    ledBehavior: existing?.ledBehavior ?? 'standard',
    activeColor: existing?.activeColor ?? 'green',
    backgroundColor: existing?.backgroundColor
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
    activeColor: parseLedColor(item.activeColor ?? item.color)
  }

  if (item.backgroundColor) {
    mapping.backgroundColor = parseLedColor(item.backgroundColor)
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
