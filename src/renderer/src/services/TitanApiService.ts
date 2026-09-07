import { safeNumber } from '@/lib/utils'
import type { TitanPlayback } from '@/types'

export class TitanApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TitanApiError'
  }
}

type RawHandle = {
  titanId?: unknown
  TitanId?: unknown
  userNumber?: unknown
  UserNumber?: unknown
  legend?: unknown
  Legend?: unknown
  type?: unknown
  Type?: unknown
  active?: unknown
  Active?: unknown
  handleLocation?: {
    group?: unknown
    index?: unknown
    page?: unknown
  }
  information?: Record<string, unknown>
}

const HANDLE_GROUPS = ['Playbacks', 'PlaybackWindow', 'Macros'] as const

export class TitanApiService {
  host = '127.0.0.1'
  port = 4430

  configure(host: string, port: number): void {
    this.host = host.trim()
    this.port = port
  }

  async ping(): Promise<{ softwareVersion: string; showName: string }> {
    const softwareVersion = await this.getProperty('System/SoftwareVersion')
    const showName = await this.getProperty('Show/ShowName')
    return {
      softwareVersion: softwareVersion || 'desconocida',
      showName: showName || 'Sin show'
    }
  }

  async listPlaybacks(): Promise<TitanPlayback[]> {
    const collected: TitanPlayback[] = []
    const seen = new Set<number>()

    for (const group of HANDLE_GROUPS) {
      try {
        const handles = await this.getHandles(group)
        for (const playback of handles) {
          if (seen.has(playback.titanId)) {
            continue
          }
          seen.add(playback.titanId)
          collected.push(playback)
        }
      } catch (error) {
        if (error instanceof TitanApiError && /unknown group/i.test(error.message)) {
          continue
        }
        throw error
      }
    }

    collected.sort((a, b) => a.legend.localeCompare(b.legend, 'es') || a.titanId - b.titanId)
    return collected
  }

  async fireAtLevel(titanId: number, level: number, alwaysRefire = false): Promise<void> {
    await this.script2('Playbacks/FirePlaybackAtLevel', {
      handle_titanId: titanId,
      level_level: clampLevel(level),
      alwaysRefire
    })
  }

  async kill(titanId: number): Promise<void> {
    await this.script('Playbacks/KillPlayback', { titanId })
  }

  async toggleLatch(titanId: number): Promise<void> {
    await this.script('Playbacks/ToggleLatchPlayback', { titanId })
  }

  async flash(titanId: number): Promise<void> {
    await this.script2('Playbacks/FlashPlayback', { handle_titanId: titanId })
  }

  async clearFlash(titanId: number): Promise<void> {
    await this.script2('Playbacks/ClearFlashPlayback', { handle_titanId: titanId })
  }

  async swop(titanId: number): Promise<void> {
    await this.script2('Playbacks/SwopPlayback', { handle_titanId: titanId })
  }

  async clearSwop(titanId: number): Promise<void> {
    await this.script2('Playbacks/ClearSwopPlayback', { handle_titanId: titanId })
  }

  async setLevel(titanId: number, level: number): Promise<void> {
    await this.script2('Playbacks/SetPlaybackLevel', {
      handle_titanId: titanId,
      level_level: clampLevel(level)
    })
  }

  async goCueList(titanId: number): Promise<void> {
    try {
      await this.script2('CueLists/NextStep', { handle_titanId: titanId })
    } catch {
      await this.script('CueLists/Play', { titanId })
    }
  }

  async killAll(): Promise<void> {
    await this.script('Playbacks/KillAllPlaybacks', {})
  }

  private async getProperty(path: string): Promise<string> {
    const result = await this.request(`/titan/get/${path}`)
    const parsed = parseMaybeJson(result.text)
    if (parsed == null) {
      return result.text.trim().replace(/^"|"$/g, '')
    }
    if (typeof parsed === 'string' || typeof parsed === 'number' || typeof parsed === 'boolean') {
      return String(parsed)
    }
    return JSON.stringify(parsed)
  }

  private async getHandles(group: string): Promise<TitanPlayback[]> {
    const result = await this.request(`/titan/handles/${encodeURIComponent(group)}?verbose=true`)
    const parsed = parseMaybeJson(result.text)
    if (!Array.isArray(parsed)) {
      throw new TitanApiError(`Respuesta inesperada de handles/${group}.`)
    }
    return parsed.map((item) => normalizeHandle(item as RawHandle, group)).filter((item): item is TitanPlayback => item !== null)
  }

  private async script(path: string, params: Record<string, string | number | boolean>): Promise<void> {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      query.set(key, String(value))
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : ''
    await this.request(`/titan/script/${path}${suffix}`)
  }

  private async script2(path: string, params: Record<string, string | number | boolean>): Promise<void> {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      query.set(key, String(value))
    }
    await this.request(`/titan/script/2/${path}?${query.toString()}`)
  }

  private async request(path: string): Promise<{ text: string }> {
    try {
      const result = await window.api.titan.request({
        host: this.host,
        port: this.port,
        path,
        method: 'GET',
        timeoutMs: 5000
      })

      if (!result.ok) {
        throw new TitanApiError(`Titan respondió HTTP ${result.status} en ${path}.`)
      }

      const maybeError = detectTitanError(result.text)
      if (maybeError) {
        throw new TitanApiError(maybeError)
      }

      return { text: result.text }
    } catch (error) {
      if (error instanceof TitanApiError) {
        throw error
      }
      const message = error instanceof Error ? error.message : 'Error de red con Titan.'
      throw new TitanApiError(message)
    }
  }
}

function clampLevel(level: number): number {
  return Math.min(1, Math.max(0, level))
}

function parseMaybeJson(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

function detectTitanError(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }
  if (trimmed.startsWith('<')) {
    return 'Titan devolvió HTML en lugar de JSON. Comprueba IP, puerto y versión de consola.'
  }
  if (/unknown group/i.test(trimmed)) {
    return trimmed
  }
  if (/error/i.test(trimmed) && !trimmed.startsWith('[') && !trimmed.startsWith('{')) {
    return trimmed
  }
  return null
}

function normalizeHandle(raw: RawHandle, fallbackGroup: string): TitanPlayback | null {
  const titanId = safeNumber(raw.titanId) ?? safeNumber(raw.TitanId)
  if (titanId == null) {
    return null
  }

  const legendValue = raw.legend ?? raw.Legend
  const legend =
    typeof legendValue === 'string' && legendValue.trim()
      ? legendValue.trim()
      : `Playback ${titanId}`

  const typeValue = raw.type ?? raw.Type
  const type = typeof typeValue === 'string' ? typeValue : 'playbackHandle'
  const group =
    typeof raw.handleLocation?.group === 'string' ? raw.handleLocation.group : fallbackGroup
  const page = safeNumber(raw.handleLocation?.page)
  const index = safeNumber(raw.handleLocation?.index)
  const userNumber = safeNumber(raw.userNumber) ?? safeNumber(raw.UserNumber)
  const active = Boolean(raw.active ?? raw.Active)

  const locationLabel = [group, page != null ? `P${page + 1}` : null, index != null ? `#${index + 1}` : null]
    .filter(Boolean)
    .join(' · ')

  return {
    titanId,
    userNumber,
    legend,
    type,
    active,
    group,
    page,
    index,
    locationLabel
  }
}

export const titanApi = new TitanApiService()
