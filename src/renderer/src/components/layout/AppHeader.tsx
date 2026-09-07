import { Crosshair, FolderOpen, Lightbulb, Radio, Save, Unplug, Zap } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConnectionDialog } from '@/components/titan/ConnectionDialog'
import { killAllPlaybacks, loadProfileFromDisk, saveCurrentProfile } from '@/hooks/useAppController'
import { midiService } from '@/services/MidiService'
import { useAppStore } from '@/store/app-store'

export function AppHeader() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const midiStatus = useAppStore((state) => state.midiStatus)
  const midiDeviceName = useAppStore((state) => state.midiDeviceName)
  const midiError = useAppStore((state) => state.midiError)
  const midiModel = useAppStore((state) => state.midiModel)
  const titanStatus = useAppStore((state) => state.titanStatus)
  const titanHost = useAppStore((state) => state.titanHost)
  const titanShowName = useAppStore((state) => state.titanShowName)
  const titanError = useAppStore((state) => state.titanError)
  const midiDevices = useAppStore((state) => state.midiDevices)
  const profileName = useAppStore((state) => state.profileName)
  const setProfileName = useAppStore((state) => state.setProfileName)
  const isMappingMode = useAppStore((state) => state.isMappingMode)
  const isListeningToTitan = useAppStore((state) => state.isListeningToTitan)
  const setMappingMode = useAppStore((state) => state.setMappingMode)

  return (
    <header className="flex items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-950/90 px-5 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-zinc-950">
          <Lightbulb className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-sm font-semibold tracking-wide text-white uppercase">Titan APC Mapper</h1>
          <input
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            className="bg-transparent text-xs text-zinc-400 outline-none hover:text-zinc-200"
          />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center gap-3">
        <StatusChip
          ok={midiStatus === 'connected'}
          label={midiStatus === 'connected' ? midiDeviceName ?? 'APC Mini' : midiError ?? 'MIDI desconectado'}
          detail={midiModel === 'apc-mini-mk2' ? 'MK2' : midiModel === 'apc-mini' ? 'Mini' : undefined}
          icon={<Radio className="h-3.5 w-3.5" />}
        />
        <button type="button" onClick={() => setSettingsOpen(true)}>
          <StatusChip
            ok={titanStatus === 'connected'}
            label={
              titanStatus === 'connected'
                ? titanShowName ?? titanHost
                : titanError ?? `Titan ${titanHost}`
            }
            detail={titanStatus === 'connecting' ? 'Conectando' : titanHost}
            icon={<Zap className="h-3.5 w-3.5" />}
          />
        </button>
      </div>

      <div className="flex items-center gap-2">
        {midiDevices.length > 0 ? (
          <select
            className="h-8 max-w-[180px] rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200"
            value={midiDeviceName ?? ''}
            onChange={(event) => {
              const device = midiDevices.find((item) => item.name === event.target.value)
              if (device) {
                midiService.connect(device.id)
              }
            }}
          >
            <option value="">MIDI…</option>
            {midiDevices.map((device) => (
              <option key={device.id} value={device.name}>
                {device.name}
              </option>
            ))}
          </select>
        ) : null}
        <Button
          variant={isMappingMode ? 'default' : 'secondary'}
          size="sm"
          onClick={() => setMappingMode(!isMappingMode)}
        >
          <Crosshair className="h-3.5 w-3.5" />
          {isMappingMode ? (isListeningToTitan ? 'Asignar · Escucha' : 'Asignar ON') : 'Asignar'}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => void midiService.autoConnect()}>
          Reconectar MIDI
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setSettingsOpen(true)}>
          Titan
        </Button>
        <Button variant="outline" size="sm" onClick={() => void saveCurrentProfile()}>
          <Save className="h-3.5 w-3.5" />
          Guardar
        </Button>
        <Button variant="outline" size="sm" onClick={() => void loadProfileFromDisk()}>
          <FolderOpen className="h-3.5 w-3.5" />
          Cargar
        </Button>
        <Button variant="danger" size="sm" onClick={() => void killAllPlaybacks()} disabled={titanStatus !== 'connected'}>
          <Unplug className="h-3.5 w-3.5" />
          Kill All
        </Button>
      </div>

      <ConnectionDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  )
}

function StatusChip({
  ok,
  label,
  detail,
  icon
}: {
  ok: boolean
  label: string
  detail?: string
  icon: ReactNode
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5">
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-red-500'}`} />
      {icon}
      <span className="max-w-[220px] truncate text-xs text-zinc-200">{label}</span>
      {detail ? (
        <Badge tone={ok ? 'ok' : 'danger'}>{detail}</Badge>
      ) : (
        <Badge tone={ok ? 'ok' : 'danger'}>{ok ? 'Conectado' : 'Off'}</Badge>
      )}
    </div>
  )
}
