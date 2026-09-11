import { useEffect } from 'react'
import { mappingEngine } from '@/services/MappingEngine'
import { midiService } from '@/services/MidiService'
import { titanApi } from '@/services/TitanApiService'
import { useAppStore } from '@/store/app-store'
import type { MappingProfileFile } from '@/types'
import { titanIdFromMapping } from '@/lib/mapping'

const POLL_MS = 150

export function useAppController(): void {
  const mappings = useAppStore((state) => state.mappings)
  const isMappingMode = useAppStore((state) => state.isMappingMode)
  const selectedPadId = useAppStore((state) => state.selectedPadId)
  const isListeningToTitan = useAppStore((state) => state.isListeningToTitan)
  const midiModel = useAppStore((state) => state.midiModel)
  const playbacks = useAppStore((state) => state.playbacks)

  useEffect(() => {
    let cancelled = false

    const boot = async (): Promise<void> => {
      const settings = await window.api.settings.get()
      if (cancelled) {
        return
      }
      useAppStore.getState().setTitanConnection(settings.titanHost, settings.titanPort)
      titanApi.configure(settings.titanHost, settings.titanPort)

      useAppStore.getState().setMidiStatus({
        status: 'connecting',
        model: null,
        deviceName: null,
        error: null,
        devices: []
      })

      try {
        await midiService.initialize()
        mappingEngine.setFaderErrorHandler((message) => {
          useAppStore.getState().setRuntimeError(message)
        })
      } catch (error) {
        if (cancelled) {
          return
        }
        useAppStore.getState().setMidiStatus({
          status: 'error',
          model: null,
          deviceName: null,
          error: error instanceof Error ? error.message : 'No se pudo iniciar MIDI.',
          devices: []
        })
      }

      void connectTitan(settings.titanHost, settings.titanPort)
    }

    let lastModel: typeof midiModel = null
    let lastGeneration = -1
    let pollInFlight = false
    let pollFailures = 0
    let lastPollAt = 0

    const unsubscribeClock = window.api.clock.onTick((now) => {
      mappingEngine.handleClock(now)
      if (useAppStore.getState().titanStatus !== 'connected') {
        pollFailures = 0
        return
      }
      if (pollInFlight || now - lastPollAt < POLL_MS) {
        return
      }
      lastPollAt = now
      pollInFlight = true
      void titanApi
        .listPlaybacks()
        .then((next) => {
          pollFailures = 0
          useAppStore.getState().setPlaybacks(next)
          useAppStore.getState().setTitanStatus({ status: 'connected', error: null })
        })
        .catch((error) => {
          pollFailures += 1
          if (pollFailures >= 3) {
            useAppStore.getState().setTitanStatus({
              status: 'error',
              error: error instanceof Error ? error.message : 'Se perdió la conexión con Titan.'
            })
          }
        })
        .finally(() => {
          pollInFlight = false
        })
    })

    const unsubscribeStatus = midiService.onStatus((status) => {
      useAppStore.getState().setMidiStatus({
        status: status.connected ? 'connected' : status.error ? 'error' : 'idle',
        model: status.model,
        deviceName: status.inputName,
        error: status.error,
        devices: status.devices
      })
      if (status.model && status.model !== lastModel) {
        lastModel = status.model
        mappingEngine.setModel(status.model)
      }
      if (status.connected && status.generation !== lastGeneration && status.generation > 0) {
        lastGeneration = status.generation
        mappingEngine.refreshLeds()
      }
    })

    const unsubscribeEvents = midiService.onEvent((event) => {
      if (event.kind === 'cc') {
        const faderIndex = event.controller - 48
        if (faderIndex >= 0 && faderIndex <= 8) {
          useAppStore.getState().setFaderValue(`fader-${faderIndex}`, event.value)
        }
      }

      const ingested = mappingEngine.ingestMidi(event)
      useAppStore.getState().setPressedControlIds([...mappingEngine.getPressedControls()])
      useAppStore.getState().setLatchedControlIds(mappingEngine.getLatchedControls())
      if (ingested.controlId) {
        useAppStore.getState().setLastMidiControlId(ingested.controlId)
        const mappingMode = useAppStore.getState().isMappingMode
        if (mappingMode && (event.kind === 'cc' || (event.kind === 'note' && event.pressed))) {
          useAppStore.getState().selectPad(ingested.controlId)
        }
      }

      if (!ingested.trigger) {
        return
      }

      void mappingEngine.commitTrigger(ingested.trigger.mapping, ingested.trigger.pressed).then((error) => {
        useAppStore.getState().setLatchedControlIds(mappingEngine.getLatchedControls())
        useAppStore.getState().setRuntimeError(error)
      })
    })

    void boot()

    return () => {
      cancelled = true
      unsubscribeStatus()
      unsubscribeEvents()
      unsubscribeClock()
    }
  }, [])

  useEffect(() => {
    mappingEngine.setMappings(mappings)
  }, [mappings])

  useEffect(() => {
    mappingEngine.setMappingMode(isMappingMode)
  }, [isMappingMode])

  useEffect(() => {
    mappingEngine.setSelectedPad(selectedPadId)
  }, [selectedPadId])

  useEffect(() => {
    mappingEngine.setListening(isListeningToTitan)
  }, [isListeningToTitan])

  useEffect(() => {
    if (midiModel) {
      mappingEngine.setModel(midiModel)
    }
  }, [midiModel])

  useEffect(() => {
    const ids = [...mappings.values()]
      .map((mapping) => titanIdFromMapping(mapping))
      .filter((id): id is number => id != null)
    const active = playbacks.filter((item) => item.active && ids.includes(item.titanId)).map((item) => item.titanId)
    mappingEngine.setActiveTitanIds(active)
  }, [playbacks, mappings])
}

export async function connectTitan(host: string, port: number): Promise<void> {
  titanApi.configure(host, port)
  useAppStore.getState().setTitanConnection(host, port)
  useAppStore.getState().setTitanStatus({ status: 'connecting', error: null })

  try {
    const info = await titanApi.ping()
    const playbacks = await titanApi.listPlaybacks()
    await window.api.settings.set({ titanHost: host, titanPort: port })
    useAppStore.getState().setPlaybacks(playbacks)
    useAppStore.getState().setTitanStatus({
      status: 'connected',
      version: info.softwareVersion,
      showName: info.showName,
      error: null
    })
  } catch (error) {
    useAppStore.getState().setPlaybacks([])
    useAppStore.getState().setTitanStatus({
      status: 'error',
      version: null,
      showName: null,
      error: error instanceof Error ? error.message : 'No se pudo conectar con Titan.'
    })
  }
}

export async function refreshPlaybacks(): Promise<void> {
  try {
    const playbacks = await titanApi.listPlaybacks()
    useAppStore.getState().setPlaybacks(playbacks)
    useAppStore.getState().setRuntimeError(null)
  } catch (error) {
    useAppStore.getState().setRuntimeError(error instanceof Error ? error.message : 'No se pudieron leer los playbacks.')
  }
}

export async function saveCurrentProfile(): Promise<void> {
  const profile = useAppStore.getState().toProfile()
  await window.api.profiles.save(profile)
}

export async function loadProfileFromDisk(): Promise<void> {
  const result = await window.api.profiles.load()
  if (result.canceled || !result.profile) {
    return
  }
  const profile = result.profile as MappingProfileFile
  useAppStore.getState().loadProfile(profile)
  titanApi.configure(profile.titan.host, profile.titan.port)
  await connectTitan(profile.titan.host, profile.titan.port)
}

export async function killAllPlaybacks(): Promise<void> {
  try {
    await titanApi.killAll()
    useAppStore.getState().setRuntimeError(null)
  } catch (error) {
    useAppStore.getState().setRuntimeError(error instanceof Error ? error.message : 'No se pudo hacer Kill All.')
  }
}
