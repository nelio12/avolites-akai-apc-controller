import { Ear, EarOff, Eraser } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { findControlById, visualPadId } from '@/lib/apc-layout'
import { ledCss } from '@/lib/apc-leds'
import { parseLedColor } from '@/lib/mapping'
import { mappingByPad } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import { LED_BEHAVIOR_MODES, LED_COLORS, TRIGGER_TYPES, type LedColorName } from '@/types'

export function MappingInspector() {
  const selectedPadId = useAppStore((state) => state.selectedPadId)
  const isMappingMode = useAppStore((state) => state.isMappingMode)
  const isListeningToTitan = useAppStore((state) => state.isListeningToTitan)
  const mappings = useAppStore((state) => state.mappings)
  const midiModel = useAppStore((state) => state.midiModel)
  const titanStatus = useAppStore((state) => state.titanStatus)
  const runtimeError = useAppStore((state) => state.runtimeError)
  const updatePadMapping = useAppStore((state) => state.updatePadMapping)
  const clearMapping = useAppStore((state) => state.clearMapping)
  const startListeningToTitan = useAppStore((state) => state.startListeningToTitan)
  const stopListeningToTitan = useAppStore((state) => state.stopListeningToTitan)

  const control = selectedPadId ? findControlById(selectedPadId) : undefined
  const mapping = selectedPadId ? mappingByPad(mappings, selectedPadId) : undefined

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 p-4">
        <p className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">Inspector</p>
        <h2 className="text-base font-semibold text-white">Configuración del pad</h2>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        {!control ? (
          <p className="text-sm text-zinc-500">Selecciona un pad para ver o editar su configuración.</p>
        ) : (
          <>
            <section>
              <p className="text-[11px] text-zinc-500 uppercase">Control</p>
              <p className="mt-1 text-sm font-medium text-white">
                {control.kind === 'pad' ? `Pad ${control.label}` : control.label}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge>{visualPadId(control)}</Badge>
                {control.kind === 'fader' ? (
                  <Badge tone="info">CC {control.cc}</Badge>
                ) : (
                  <Badge tone="info">
                    Note {midiModel === 'apc-mini-mk2' ? control.noteMk2 : control.noteOriginal}
                  </Badge>
                )}
              </div>
            </section>

            {control.kind !== 'fader' ? (
              <section>
                <p className="mb-2 text-[11px] text-zinc-500 uppercase">Captura desde Titan</p>
                <Button
                  variant={isListeningToTitan ? 'danger' : 'secondary'}
                  className="w-full"
                  disabled={!selectedPadId || titanStatus !== 'connected'}
                  onClick={() => (isListeningToTitan ? stopListeningToTitan() : startListeningToTitan())}
                >
                  {isListeningToTitan ? <EarOff className="h-3.5 w-3.5" /> : <Ear className="h-3.5 w-3.5" />}
                  {isListeningToTitan ? 'Cancelar escucha' : 'Escuchar Titan'}
                </Button>
                <p className="mt-2 text-[11px] text-zinc-500">
                  {isListeningToTitan
                    ? 'Activa un playback en la consola. El primero que pase a activo se asignará a este pad.'
                    : 'Espera a que se active un playback en Titan y lo asocia al pad seleccionado.'}
                </p>
              </section>
            ) : null}

            {mapping ? (
              <>
                <section>
                  <p className="text-[11px] text-zinc-500 uppercase">Asignado a Titan</p>
                  <p className="mt-1 text-sm text-white">{mapping.titanPlaybackName}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="info">ID {mapping.titanPlaybackId}</Badge>
                    <Badge>{mapping.ledBehavior}</Badge>
                  </div>
                </section>

                {control.kind !== 'fader' ? (
                  <>
                    <section>
                      <p className="mb-2 text-[11px] text-zinc-500 uppercase">TriggerType</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {TRIGGER_TYPES.map((trigger) => (
                          <button
                            key={trigger.value}
                            type="button"
                            title={trigger.description}
                            onClick={() => updatePadMapping(control.id, { triggerType: trigger.value })}
                            className={`rounded-md border px-2 py-1.5 text-xs ${
                              mapping.triggerType === trigger.value
                                ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                                : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600'
                            }`}
                          >
                            {trigger.label}
                          </button>
                        ))}
                      </div>
                    </section>

                    <section>
                      <p className="mb-2 text-[11px] text-zinc-500 uppercase">LedBehaviorMode</p>
                      <div className="grid gap-1.5">
                        {LED_BEHAVIOR_MODES.map((mode) => (
                          <button
                            key={mode.value}
                            type="button"
                            title={mode.description}
                            onClick={() => updatePadMapping(control.id, { ledBehavior: mode.value })}
                            className={`rounded-md border px-2 py-2 text-left ${
                              mapping.ledBehavior === mode.value
                                ? 'border-amber-400 bg-amber-400/15'
                                : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
                            }`}
                          >
                            <p className="text-xs font-medium text-zinc-100">{mode.label}</p>
                            <p className="mt-0.5 text-[10px] text-zinc-500">{mode.description}</p>
                          </button>
                        ))}
                      </div>
                    </section>

                    <ColorPicker
                      label="activeColor"
                      value={parseLedColor(mapping.activeColor)}
                      onChange={(color) => updatePadMapping(control.id, { activeColor: color })}
                    />

                    {mapping.ledBehavior === 'background' ? (
                      <ColorPicker
                        label="backgroundColor"
                        value={parseLedColor(mapping.backgroundColor)}
                        onChange={(color) => updatePadMapping(control.id, { backgroundColor: color })}
                      />
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-zinc-500">
                    Los faders envían el nivel del playback (SetPlaybackLevel) en tiempo real.
                  </p>
                )}

                <Button variant="outline" onClick={() => clearMapping(control.id)}>
                  <Eraser className="h-3.5 w-3.5" />
                  Quitar asignación
                </Button>
              </>
            ) : (
              <p className="text-sm text-zinc-500">
                {isMappingMode
                  ? 'Pad libre. Elige un playback, arrástralo o escucha Titan.'
                  : 'Activa Asignar para vincular un playback a este pad.'}
              </p>
            )}
          </>
        )}
      </div>

      {runtimeError ? (
        <div className="border-t border-red-900/60 bg-red-950/40 px-4 py-3 text-xs text-red-300">{runtimeError}</div>
      ) : (
        <div className="border-t border-zinc-800 px-4 py-3 text-[11px] text-zinc-500">
          {mappings.size} mapeos · {isMappingMode ? 'modo asignar' : 'modo interpretación'}
        </div>
      )}
    </aside>
  )
}

function ColorPicker({
  label,
  value,
  onChange
}: {
  label: string
  value: LedColorName
  onChange: (color: LedColorName) => void
}) {
  return (
    <section>
      <p className="mb-2 text-[11px] text-zinc-500 uppercase">{label}</p>
      <div className="flex flex-wrap gap-2">
        {LED_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            onClick={() => onChange(color)}
            className={`h-7 w-7 rounded-full border ${
              value === color ? 'border-white ring-2 ring-white/40' : 'border-zinc-700'
            }`}
            style={{ background: ledCss(color) }}
          />
        ))}
      </div>
    </section>
  )
}
