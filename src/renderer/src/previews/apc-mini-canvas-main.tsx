import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ApcMiniCanvas, type PadConfig } from '../components/apc/ApcMiniCanvas'
import './apc-mini-canvas.css'

const SAMPLE_MAPPINGS: Record<number, PadConfig> = {
  0: { titanName: 'Strobe', activeColor: '#22c55e', backgroundColor: '#14532d' },
  8: { titanName: 'Wash', activeColor: '#38bdf8', backgroundColor: '#0c4a6e' },
  16: { titanName: 'Blinder', activeColor: '#eab308', isBlinking: true, backgroundColor: '#713f12' },
  56: { titanName: 'Beam', activeColor: '#ef4444', backgroundColor: '#7f1d1d' },
  63: { titanName: 'Fan', activeColor: '#a855f7', backgroundColor: '#3b0764' },
  82: { titanName: 'Go', activeColor: '#22c55e', backgroundColor: '#14532d' },
  64: { titanName: 'Mute', backgroundColor: '#7f1d1d' }
}

function Preview() {
  const [selectedNote, setSelectedNote] = useState<number | null>(16)

  return (
    <div className="min-h-screen overflow-auto bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-[720px] space-y-4">
        <div>
          <p className="text-xs tracking-[0.25em] text-slate-500 uppercase">Preview aislada</p>
          <h1 className="text-xl font-semibold">ApcMiniCanvas</h1>
          <p className="text-sm text-slate-400">
            No está conectado a la app principal. Haz clic en pads para ver la selección.
            {selectedNote != null ? ` Nota seleccionada: ${selectedNote}` : ''}
          </p>
        </div>
        <ApcMiniCanvas mappings={SAMPLE_MAPPINGS} selectedNote={selectedNote} onSelectNote={setSelectedNote} />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
