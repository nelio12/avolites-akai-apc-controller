import { create } from 'zustand'
import type {
  ApcModel,
  ConnectionStatus,
  LedBehaviorMode,
  LedColorName,
  MappingProfileFile,
  MidiDeviceInfo,
  PadMappingConfig,
  TitanPlayback,
  TriggerType
} from '@/types'
import { cloneMappings, createPadMapping, mappingsFromList } from '@/lib/mapping'

interface AppState {
  isMappingMode: boolean
  selectedPadId: string | null
  isListeningToTitan: boolean
  mappings: Map<string, PadMappingConfig>
  listenSnapshotIds: number[]

  midiStatus: ConnectionStatus
  midiModel: ApcModel | null
  midiDeviceName: string | null
  midiError: string | null
  midiDevices: MidiDeviceInfo[]
  lastMidiControlId: string | null

  titanStatus: ConnectionStatus
  titanHost: string
  titanPort: number
  titanVersion: string | null
  titanShowName: string | null
  titanError: string | null
  playbacks: TitanPlayback[]

  profileName: string
  runtimeError: string | null
  faderValues: Record<string, number>
  pressedControlIds: string[]

  setMappingMode: (enabled: boolean) => void
  selectPad: (padId: string | null) => void
  startListeningToTitan: () => void
  stopListeningToTitan: () => void
  ingestPlaybacks: (playbacks: TitanPlayback[]) => void

  setMidiStatus: (payload: {
    status: ConnectionStatus
    model: ApcModel | null
    deviceName: string | null
    error: string | null
    devices: MidiDeviceInfo[]
  }) => void
  setLastMidiControlId: (id: string | null) => void
  setTitanConnection: (host: string, port: number) => void
  setTitanStatus: (payload: {
    status: ConnectionStatus
    version?: string | null
    showName?: string | null
    error?: string | null
  }) => void
  setPlaybacks: (playbacks: TitanPlayback[]) => void
  assignPlayback: (playback: TitanPlayback) => void
  assignPlaybackToPad: (padId: string, playback: TitanPlayback) => void
  updatePadMapping: (
    padId: string,
    patch: Partial<Pick<PadMappingConfig, 'triggerType' | 'ledBehavior' | 'activeColor' | 'backgroundColor'>>
  ) => void
  clearMapping: (padId: string) => void
  setProfileName: (name: string) => void
  setRuntimeError: (error: string | null) => void
  setFaderValue: (controlId: string, value: number) => void
  setPressedControlIds: (ids: string[]) => void
  loadProfile: (profile: MappingProfileFile) => void
  toProfile: () => MappingProfileFile
}

function activeIds(playbacks: TitanPlayback[]): number[] {
  return playbacks.filter((item) => item.active).map((item) => item.titanId)
}

export const useAppStore = create<AppState>((set, get) => ({
  isMappingMode: false,
  selectedPadId: null,
  isListeningToTitan: false,
  mappings: new Map(),
  listenSnapshotIds: [],

  midiStatus: 'idle',
  midiModel: null,
  midiDeviceName: null,
  midiError: null,
  midiDevices: [],
  lastMidiControlId: null,

  titanStatus: 'idle',
  titanHost: '127.0.0.1',
  titanPort: 4430,
  titanVersion: null,
  titanShowName: null,
  titanError: null,
  playbacks: [],

  profileName: 'Show 1',
  runtimeError: null,
  faderValues: {},
  pressedControlIds: [],

  setMappingMode: (enabled) =>
    set({
      isMappingMode: enabled,
      isListeningToTitan: enabled ? get().isListeningToTitan : false,
      listenSnapshotIds: enabled ? get().listenSnapshotIds : []
    }),

  selectPad: (padId) =>
    set({
      selectedPadId: padId,
      isListeningToTitan: padId ? get().isListeningToTitan : false
    }),

  startListeningToTitan: () => {
    if (!get().selectedPadId) {
      return
    }
    set({
      isMappingMode: true,
      isListeningToTitan: true,
      listenSnapshotIds: activeIds(get().playbacks)
    })
  },

  stopListeningToTitan: () => set({ isListeningToTitan: false, listenSnapshotIds: [] }),

  ingestPlaybacks: (playbacks) => {
    const listening = get().isListeningToTitan
    const selectedPadId = get().selectedPadId
    const previous = new Set(get().listenSnapshotIds)
    const current = activeIds(playbacks)
    const newlyActiveId = current.find((id) => !previous.has(id))

    if (listening && selectedPadId && newlyActiveId != null) {
      const playback = playbacks.find((item) => item.titanId === newlyActiveId)
      const mappings = cloneMappings(get().mappings)
      if (playback) {
        mappings.set(selectedPadId, createPadMapping(selectedPadId, playback, mappings.get(selectedPadId)))
      }
      set({
        playbacks,
        mappings,
        isListeningToTitan: false,
        listenSnapshotIds: []
      })
      return
    }

    set({
      playbacks,
      listenSnapshotIds: listening ? current : get().listenSnapshotIds
    })
  },

  setMidiStatus: ({ status, model, deviceName, error, devices }) =>
    set({
      midiStatus: status,
      midiModel: model,
      midiDeviceName: deviceName,
      midiError: error,
      midiDevices: devices
    }),

  setLastMidiControlId: (id) => set({ lastMidiControlId: id }),

  setTitanConnection: (host, port) => set({ titanHost: host, titanPort: port }),

  setTitanStatus: ({ status, version, showName, error }) =>
    set({
      titanStatus: status,
      titanVersion: version === undefined ? get().titanVersion : version,
      titanShowName: showName === undefined ? get().titanShowName : showName,
      titanError: error === undefined ? get().titanError : error
    }),

  setPlaybacks: (playbacks) => get().ingestPlaybacks(playbacks),

  assignPlayback: (playback) => {
    const padId = get().selectedPadId
    if (!padId || !get().isMappingMode) {
      return
    }
    get().assignPlaybackToPad(padId, playback)
  },

  assignPlaybackToPad: (padId, playback) => {
    const mappings = cloneMappings(get().mappings)
    mappings.set(padId, createPadMapping(padId, playback, mappings.get(padId)))
    set({
      selectedPadId: padId,
      isMappingMode: true,
      isListeningToTitan: false,
      mappings
    })
  },

  updatePadMapping: (padId, patch) => {
    const current = get().mappings.get(padId)
    if (!current) {
      return
    }

    const next: PadMappingConfig = { ...current, ...patch }
    if (patch.ledBehavior === 'background' && !next.backgroundColor) {
      next.backgroundColor = 'yellow'
    }

    const mappings = cloneMappings(get().mappings)
    mappings.set(padId, next)
    set({ mappings })
  },

  clearMapping: (padId) => {
    const mappings = cloneMappings(get().mappings)
    mappings.delete(padId)
    set({ mappings })
  },

  setProfileName: (name) => set({ profileName: name }),

  setRuntimeError: (error) => set({ runtimeError: error }),

  setFaderValue: (controlId, value) =>
    set({
      faderValues: { ...get().faderValues, [controlId]: value }
    }),

  setPressedControlIds: (ids) => set({ pressedControlIds: ids }),

  loadProfile: (profile) =>
    set({
      profileName: profile.name || 'Show',
      titanHost: profile.titan.host || get().titanHost,
      titanPort: profile.titan.port || get().titanPort,
      mappings: mappingsFromList(profile.mappings),
      isListeningToTitan: false,
      selectedPadId: null
    }),

  toProfile: () => ({
    version: 2,
    name: get().profileName,
    createdAt: new Date().toISOString(),
    titan: {
      host: get().titanHost,
      port: get().titanPort
    },
    mappings: [...get().mappings.values()]
  })
}))

export type PadMappingPatch = Partial<{
  triggerType: TriggerType
  ledBehavior: LedBehaviorMode
  activeColor: LedColorName
  backgroundColor: LedColorName
}>
