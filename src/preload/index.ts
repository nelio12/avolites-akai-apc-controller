import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, MappingProfile, TitanRequestPayload, TitanRequestResult } from '../shared/ipc'

const api = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    set: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke('settings:set', settings)
  },
  titan: {
    request: (payload: TitanRequestPayload): Promise<TitanRequestResult> =>
      ipcRenderer.invoke('titan:request', payload)
  },
  profiles: {
    save: (profile: MappingProfile): Promise<{ canceled: boolean; filePath?: string }> =>
      ipcRenderer.invoke('profiles:save', profile),
    load: (): Promise<{ canceled: boolean; profile?: MappingProfile; filePath?: string }> =>
      ipcRenderer.invoke('profiles:load')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  Object.assign(window, { api })
}
