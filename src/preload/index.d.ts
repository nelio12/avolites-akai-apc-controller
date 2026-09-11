import type { AppSettings, DiscoveredTitan, MappingProfile, TitanRequestPayload, TitanRequestResult } from '../shared/ipc'

export interface DesktopApi {
  settings: {
    get: () => Promise<AppSettings>
    set: (settings: AppSettings) => Promise<AppSettings>
  }
  titan: {
    request: (payload: TitanRequestPayload) => Promise<TitanRequestResult>
    discover: (preferredHost?: string) => Promise<DiscoveredTitan[]>
  }
  clock: {
    onTick: (listener: (now: number) => void) => () => void
  }
  profiles: {
    save: (profile: MappingProfile) => Promise<{ canceled: boolean; filePath?: string }>
    load: () => Promise<{ canceled: boolean; profile?: MappingProfile; filePath?: string }>
  }
}

declare global {
  interface Window {
    api: DesktopApi
  }
}

export {}
