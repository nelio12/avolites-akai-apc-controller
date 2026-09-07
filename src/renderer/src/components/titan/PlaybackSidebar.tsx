import { RefreshCw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { refreshPlaybacks } from '@/hooks/useAppController'
import { formatTitanType } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import type { TitanPlayback } from '@/types'

export function PlaybackSidebar() {
  const playbacks = useAppStore((state) => state.playbacks)
  const titanStatus = useAppStore((state) => state.titanStatus)
  const selectedPadId = useAppStore((state) => state.selectedPadId)
  const isMappingMode = useAppStore((state) => state.isMappingMode)
  const isListeningToTitan = useAppStore((state) => state.isListeningToTitan)
  const assignPlayback = useAppStore((state) => state.assignPlayback)
  const [query, setQuery] = useState('')

  const canAssign = isMappingMode && Boolean(selectedPadId)
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return playbacks
    }
    return playbacks.filter((item) =>
      `${item.legend} ${item.titanId} ${item.userNumber ?? ''} ${item.type} ${item.locationLabel}`
        .toLowerCase()
        .includes(needle)
    )
  }, [playbacks, query])

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">Titan</p>
            <h2 className="text-base font-semibold text-white">Playbacks</h2>
          </div>
          <Button variant="secondary" size="icon" onClick={() => void refreshPlaybacks()} disabled={titanStatus !== 'connected'}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-zinc-500" />
          <Input className="pl-8" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar legend, ID…" />
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          {isListeningToTitan
            ? 'Escuchando Titan. El próximo playback activo se asignará solo.'
            : canAssign
              ? 'Haz clic o arrastra un playback al pad seleccionado.'
              : 'Activa Asignar y selecciona un pad para mapear.'}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {titanStatus !== 'connected' ? (
            <EmptyState text="Conecta la consola Titan para leer playbacks, cue lists y ejecutores." />
          ) : filtered.length === 0 ? (
            <EmptyState text="No hay handles en este show o el filtro no coincide." />
          ) : (
            filtered.map((playback) => (
              <PlaybackRow
                key={`${playback.group}-${playback.titanId}`}
                playback={playback}
                disabled={!canAssign}
                onAssign={() => assignPlayback(playback)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </aside>
  )
}

function PlaybackRow({
  playback,
  disabled,
  onAssign
}: {
  playback: TitanPlayback
  disabled: boolean
  onAssign: () => void
}) {
  return (
    <button
      type="button"
      draggable={!disabled}
      disabled={disabled}
      onClick={onAssign}
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-titan-playback', JSON.stringify(playback))
        event.dataTransfer.effectAllowed = 'copy'
      }}
      className="w-full rounded-lg border border-transparent bg-zinc-900/80 px-3 py-2 text-left transition hover:border-amber-400/40 hover:bg-zinc-800 disabled:opacity-50"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-sm font-medium text-white">{playback.legend}</p>
        {playback.active ? <Badge tone="ok">Activo</Badge> : null}
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <Badge>{formatTitanType(playback.type)}</Badge>
        <Badge tone="info">ID {playback.titanId}</Badge>
        {playback.userNumber != null ? <Badge tone="neutral">UN {playback.userNumber}</Badge> : null}
      </div>
      <p className="mt-1 truncate text-[11px] text-zinc-500">{playback.locationLabel}</p>
    </button>
  )
}

function EmptyState({ text }: { text: string }) {
  return <p className="px-3 py-8 text-center text-sm text-zinc-500">{text}</p>
}
