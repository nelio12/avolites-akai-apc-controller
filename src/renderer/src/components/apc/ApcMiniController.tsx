import { Fragment, type DragEvent } from 'react'
import { APC_FADERS, APC_PADS, APC_SCENES, APC_SHIFT, APC_TRACKS, trackLabel } from '@/lib/apc-layout'
import { ledCss } from '@/lib/apc-leds'
import { parseLedColor, resolvePadLed, titanIdFromMapping } from '@/lib/mapping'
import { cn, mappingByPad } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import type { ApcControl, PadMappingConfig, TitanPlayback } from '@/types'

export function ApcMiniController() {
  const mappings = useAppStore((state) => state.mappings)
  const selectedPadId = useAppStore((state) => state.selectedPadId)
  const isMappingMode = useAppStore((state) => state.isMappingMode)
  const isListeningToTitan = useAppStore((state) => state.isListeningToTitan)
  const lastMidiControlId = useAppStore((state) => state.lastMidiControlId)
  const pressedControlIds = useAppStore((state) => state.pressedControlIds)
  const playbacks = useAppStore((state) => state.playbacks)
  const faderValues = useAppStore((state) => state.faderValues)
  const midiModel = useAppStore((state) => state.midiModel)
  const selectPad = useAppStore((state) => state.selectPad)
  const assignPlaybackToPad = useAppStore((state) => state.assignPlaybackToPad)

  const dropOn = (padId: string, event: DragEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    if (!isMappingMode) {
      return
    }
    const raw = event.dataTransfer.getData('application/x-titan-playback')
    if (!raw) {
      return
    }
    const playback = JSON.parse(raw) as TitanPlayback
    assignPlaybackToPad(padId, playback)
  }

  return (
    <div className="flex h-full flex-col">
      <MappingStatusBar />
      <div className="flex flex-1 items-center justify-center p-6">
        <div
          className={`apc-chassis w-full max-w-[760px] rounded-[28px] border p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)] ${
            isMappingMode ? 'border-amber-400/60 bg-linear-to-b from-zinc-800 to-zinc-950' : 'border-zinc-700 bg-linear-to-b from-zinc-800 to-zinc-950'
          }`}
        >
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-[10px] tracking-[0.35em] text-zinc-500 uppercase">Akai Professional</p>
              <h2 className="text-xl font-semibold text-white">APC Mini</h2>
            </div>
            <p className="text-[11px] text-zinc-500">
              {midiModel === 'apc-mini-mk2' ? 'Layout MK2 (RGB)' : 'Layout original (rojo/verde/ámbar)'}
            </p>
          </div>

          <div className="grid grid-cols-9 gap-x-1.5 gap-y-1.5">
            {Array.from({ length: 8 }, (_, row) => {
              const rowPads = orderedPads().filter((pad) => pad.row === row)
              const scene = APC_SCENES[row]
              const sceneMapping = mappingByPad(mappings, scene.id)
              return (
                <Fragment key={`row-${row}`}>
                  {rowPads.map((pad) => {
                    const mapping = mappingByPad(mappings, pad.id)
                    return (
                      <Pad
                        key={pad.id}
                        control={pad}
                        mapping={mapping}
                        selected={selectedPadId === pad.id}
                        listening={isListeningToTitan && selectedPadId === pad.id}
                        mappingMode={isMappingMode}
                        live={lastMidiControlId === pad.id || pressedControlIds.includes(pad.id)}
                        active={isPlaybackActive(mapping, playbacks)}
                        onSelect={() => selectPad(pad.id)}
                        onDrop={(event) => dropOn(pad.id, event)}
                      />
                    )
                  })}
                  <RoundButton
                    control={scene}
                    mapping={sceneMapping}
                    selected={selectedPadId === scene.id}
                    listening={isListeningToTitan && selectedPadId === scene.id}
                    live={lastMidiControlId === scene.id || pressedControlIds.includes(scene.id)}
                    active={isPlaybackActive(sceneMapping, playbacks)}
                    onSelect={() => selectPad(scene.id)}
                    onDrop={(event) => dropOn(scene.id, event)}
                  />
                </Fragment>
              )
            })}

            {APC_TRACKS.map((track, index) => {
              const mapping = mappingByPad(mappings, track.id)
              return (
                <RoundButton
                  key={track.id}
                  control={{ ...track, label: trackLabel(index) }}
                  mapping={mapping}
                  selected={selectedPadId === track.id}
                  listening={isListeningToTitan && selectedPadId === track.id}
                  live={lastMidiControlId === track.id || pressedControlIds.includes(track.id)}
                  active={isPlaybackActive(mapping, playbacks)}
                  onSelect={() => selectPad(track.id)}
                  onDrop={(event) => dropOn(track.id, event)}
                  className="mt-2"
                />
              )
            })}
            <SquareButton
              control={{ ...APC_SHIFT, label: 'Sh' }}
              mapping={mappingByPad(mappings, APC_SHIFT.id)}
              selected={selectedPadId === APC_SHIFT.id}
              listening={isListeningToTitan && selectedPadId === APC_SHIFT.id}
              live={lastMidiControlId === APC_SHIFT.id || pressedControlIds.includes(APC_SHIFT.id)}
              active={isPlaybackActive(mappingByPad(mappings, APC_SHIFT.id), playbacks)}
              onSelect={() => selectPad(APC_SHIFT.id)}
              onDrop={(event) => dropOn(APC_SHIFT.id, event)}
              className="mt-2"
            />

            {APC_FADERS.map((fader) => (
              <FaderSlot
                key={fader.id}
                control={fader}
                mapping={mappingByPad(mappings, fader.id)}
                value={faderValues[fader.id] ?? 0}
                selected={selectedPadId === fader.id}
                onSelect={() => selectPad(fader.id)}
                onDrop={(event) => dropOn(fader.id, event)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function MappingStatusBar() {
  const isMappingMode = useAppStore((state) => state.isMappingMode)
  const isListeningToTitan = useAppStore((state) => state.isListeningToTitan)
  const selectedPadId = useAppStore((state) => state.selectedPadId)

  if (!isMappingMode) {
    return (
      <div className="border-b border-zinc-800 px-6 py-2 text-center text-xs text-zinc-500">
        Modo interpretación. Activa <span className="text-amber-300">Asignar</span> para mapear pads.
      </div>
    )
  }

  if (isListeningToTitan) {
    return (
      <div className="border-b border-sky-500/30 bg-sky-950/40 px-6 py-2 text-center text-xs text-sky-200">
        Escuchando Titan… dispara un playback en la consola para asignarlo a{' '}
        <span className="font-semibold">{selectedPadId}</span>.
      </div>
    )
  }

  return (
    <div className="border-b border-amber-400/30 bg-amber-950/30 px-6 py-2 text-center text-xs text-amber-200">
      Modo asignar. Selecciona un pad (pantalla o APC) y elige un playback, o escucha Titan.
    </div>
  )
}

function orderedPads(): ApcControl[] {
  return [...APC_PADS].sort((a, b) => a.row - b.row || a.col - b.col)
}

function isPlaybackActive(mapping: PadMappingConfig | undefined, playbacks: { titanId: number; active: boolean }[]): boolean {
  const titanId = mapping ? titanIdFromMapping(mapping) : null
  return Boolean(titanId != null && playbacks.some((item) => item.titanId === titanId && item.active))
}

function padSurfaceColor(mapping: PadMappingConfig | undefined, active: boolean): string {
  if (!mapping) {
    return '#111827'
  }
  const resolved = resolvePadLed(mapping, active)
  return ledCss(parseLedColor(resolved.color), resolved.behavior)
}

function Pad({
  control,
  mapping,
  selected,
  listening,
  mappingMode,
  live,
  active,
  onSelect,
  onDrop
}: {
  control: ApcControl
  mapping?: PadMappingConfig
  selected: boolean
  listening: boolean
  mappingMode: boolean
  live: boolean
  active: boolean
  onSelect: () => void
  onDrop: (event: DragEvent<HTMLButtonElement>) => void
}) {
  const color = padSurfaceColor(mapping, active)

  return (
    <button
      type="button"
      title={mapping ? mapping.titanPlaybackName : `Pad ${control.label}`}
      onClick={onSelect}
      onDragOver={(event) => {
        if (mappingMode) {
          event.preventDefault()
        }
      }}
      onDrop={onDrop}
      className={`apc-pad relative aspect-[2/1] rounded-sm border transition ${
        listening ? 'border-sky-300 ring-2 ring-sky-300/70' : selected ? 'border-amber-300 ring-2 ring-amber-300/50' : 'border-zinc-900'
      } ${live ? 'scale-[0.96]' : ''}`}
      style={{
        background: mapping
          ? `radial-gradient(circle at 50% 40%, ${color === 'transparent' ? '#1f2937' : color}, #09090b 78%)`
          : 'linear-gradient(180deg, #1f2937, #0b0f14)',
        boxShadow: mapping && color !== 'transparent' ? `0 0 14px ${color}55` : 'inset 0 1px 0 rgba(255,255,255,0.06)'
      }}
    >
      {mapping ? (
        <span className="absolute inset-x-0.5 bottom-0.5 truncate text-[8px] text-white/80">{mapping.titanPlaybackName}</span>
      ) : null}
    </button>
  )
}

function RoundButton({
  control,
  mapping,
  selected,
  listening,
  live,
  active,
  onSelect,
  onDrop,
  className
}: {
  control: ApcControl
  mapping?: PadMappingConfig
  selected: boolean
  listening: boolean
  live: boolean
  active: boolean
  onSelect: () => void
  onDrop: (event: DragEvent<HTMLButtonElement>) => void
  className?: string
}) {
  const color = mapping ? padSurfaceColor(mapping, active) : '#3f3f46'
  const fill = color === 'transparent' ? '#18181b' : color

  return (
    <button
      type="button"
      title={mapping ? mapping.titanPlaybackName : control.label}
      onClick={onSelect}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className={cn(
        'flex size-7 items-center justify-center justify-self-center self-center rounded-full border text-[7px] font-medium leading-none text-zinc-200',
        listening ? 'border-sky-300 ring-2 ring-sky-300/60' : selected ? 'border-amber-300 ring-2 ring-amber-300/40' : 'border-zinc-700',
        live && 'scale-95',
        className
      )}
      style={{
        background: `radial-gradient(circle at 50% 40%, ${fill}, #18181b 70%)`
      }}
    >
      {control.label}
    </button>
  )
}

function SquareButton({
  control,
  mapping,
  selected,
  listening,
  live,
  active,
  onSelect,
  onDrop,
  className
}: {
  control: ApcControl
  mapping?: PadMappingConfig
  selected: boolean
  listening: boolean
  live: boolean
  active: boolean
  onSelect: () => void
  onDrop: (event: DragEvent<HTMLButtonElement>) => void
  className?: string
}) {
  const color = mapping ? padSurfaceColor(mapping, active) : '#3f3f46'
  const fill = color === 'transparent' ? '#18181b' : color

  return (
    <button
      type="button"
      title={mapping ? mapping.titanPlaybackName : 'Shift'}
      onClick={onSelect}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className={cn(
        'flex size-7 items-center justify-center justify-self-center self-center rounded-sm border text-[7px] font-medium leading-none text-zinc-200',
        listening ? 'border-sky-300 ring-2 ring-sky-300/60' : selected ? 'border-amber-300 ring-2 ring-amber-300/40' : 'border-zinc-700',
        live && 'scale-95',
        className
      )}
      style={{
        background: `radial-gradient(circle at 50% 40%, ${fill}, #18181b 70%)`
      }}
    >
      {control.label}
    </button>
  )
}

function FaderSlot({
  control,
  mapping,
  value,
  selected,
  onSelect,
  onDrop
}: {
  control: ApcControl
  mapping?: PadMappingConfig
  value: number
  selected: boolean
  onSelect: () => void
  onDrop: (event: DragEvent<HTMLButtonElement>) => void
}) {
  const fill = Math.round((value / 127) * 100)

  return (
    <button
      type="button"
      onClick={onSelect}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className={`mt-3 flex w-full flex-col items-center gap-1 rounded-md py-1 ${selected ? 'bg-amber-400/10 ring-1 ring-amber-300/50' : ''}`}
    >
      <div className="relative h-32 w-4 overflow-hidden rounded-full border border-zinc-700 bg-zinc-900">
        <div
          className="absolute right-0 bottom-0 left-0 bg-linear-to-t from-amber-500 to-amber-200"
          style={{ height: `${fill}%` }}
        />
      </div>
      <span className="text-[10px] font-medium text-zinc-400">{control.label}</span>
      {mapping ? <span className="max-w-full truncate text-[9px] text-zinc-500">{mapping.titanPlaybackName}</span> : null}
    </button>
  )
}
