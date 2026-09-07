import type { ApcControl, ApcModel } from '@/types'

const TRACK_LABELS = ['▲', '▼', '◀', '▶', 'Vol', 'Pan', 'Send', 'Dev']

export const APC_PADS: ApcControl[] = Array.from({ length: 64 }, (_, index) => {
  const col = index % 8
  const rowFromBottom = Math.floor(index / 8)
  const visualRow = 7 - rowFromBottom

  return {
    id: `pad-${index}`,
    kind: 'pad',
    label: String(index),
    row: visualRow,
    col,
    noteOriginal: index,
    noteMk2: index
  }
})

export const APC_TRACKS: ApcControl[] = Array.from({ length: 8 }, (_, index) => ({
  id: `track-${index}`,
  kind: 'track',
  label: TRACK_LABELS[index],
  row: 8,
  col: index,
  noteOriginal: 64 + index,
  noteMk2: 100 + index
}))

export const APC_SCENES: ApcControl[] = Array.from({ length: 8 }, (_, index) => ({
  id: `scene-${index}`,
  kind: 'scene',
  label: String(index + 1),
  row: index,
  col: 8,
  noteOriginal: 82 + index,
  noteMk2: 112 + index
}))

export const APC_SHIFT: ApcControl = {
  id: 'shift',
  kind: 'shift',
  label: 'Shift',
  row: 8,
  col: 8,
  noteOriginal: 98,
  noteMk2: 122
}

export const APC_FADERS: ApcControl[] = Array.from({ length: 9 }, (_, index) => ({
  id: `fader-${index}`,
  kind: 'fader',
  label: index === 8 ? 'Master' : String(index + 1),
  row: 9,
  col: index,
  cc: 48 + index
}))

export const ALL_APC_CONTROLS: ApcControl[] = [
  ...APC_PADS,
  ...APC_TRACKS,
  ...APC_SCENES,
  APC_SHIFT,
  ...APC_FADERS
]

export function midiNameKey(deviceName: string): string {
  return deviceName.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function detectApcModel(deviceName: string, manufacturer = ''): ApcModel | null {
  const key = midiNameKey(`${deviceName} ${manufacturer}`)
  const looksLikeApc =
    key.includes('apcmini') ||
    (key.includes('apc') && key.includes('mini')) ||
    (key.includes('akai') && key.includes('apc'))

  if (!looksLikeApc) {
    return null
  }

  return key.includes('mk2') || key.includes('mkii') ? 'apc-mini-mk2' : 'apc-mini'
}

export function namesLookRelated(left: string, right: string): boolean {
  const a = midiNameKey(left)
  const b = midiNameKey(right)
  if (!a || !b) {
    return false
  }
  return a === b || a.includes(b) || b.includes(a)
}

export function getControlNote(control: ApcControl, model: ApcModel): number | undefined {
  return model === 'apc-mini-mk2' ? control.noteMk2 : control.noteOriginal
}

export function findControlByNote(note: number, model: ApcModel): ApcControl | undefined {
  return ALL_APC_CONTROLS.find((control) => getControlNote(control, model) === note)
}

export function findControlByCc(cc: number): ApcControl | undefined {
  return ALL_APC_CONTROLS.find((control) => control.cc === cc)
}

export function findControlById(id: string): ApcControl | undefined {
  return ALL_APC_CONTROLS.find((control) => control.id === id)
}

export function trackLabel(index: number, _model?: ApcModel): string {
  return TRACK_LABELS[index]
}

export function visualPadId(control: ApcControl): string {
  if (control.kind === 'pad') {
    return `pad_r${control.row}_c${control.col}`
  }
  return control.id
}
