import React from 'react'

export interface PadConfig {
  titanName?: string
  activeColor?: string
  backgroundColor?: string
  isBlinking?: boolean
}

interface ApcMiniCanvasProps {
  mappings: Record<number, PadConfig>
  selectedNote: number | null
  onSelectNote: (noteId: number) => void
}

export const ApcMiniCanvas: React.FC<ApcMiniCanvasProps> = ({
  mappings,
  selectedNote,
  onSelectNote
}) => {
  const renderGrid = () => {
    const pads = []
    for (let row = 7; row >= 0; row--) {
      for (let col = 0; col < 8; col++) {
        const noteId = row * 8 + col
        const padData = mappings[noteId] || {}
        const isSelected = selectedNote === noteId

        pads.push(
          <g
            key={`pad-${noteId}`}
            onClick={() => onSelectNote(noteId)}
            className="cursor-pointer transition-transform duration-100 hover:scale-105"
          >
            <rect
              x={40 + col * 42}
              y={40 + (7 - row) * 32}
              width={38}
              height={28}
              rx={4}
              fill={padData.backgroundColor || '#2A2E37'}
              stroke={isSelected ? '#3B82F6' : padData.activeColor || '#4B5563'}
              strokeWidth={isSelected ? 3 : 1}
              className={padData.isBlinking ? 'animate-pulse' : ''}
            />

            {padData.activeColor && (
              <circle
                cx={40 + col * 42 + 19}
                cy={40 + (7 - row) * 32 + 14}
                r={4}
                fill={padData.activeColor}
              />
            )}

            <text
              x={40 + col * 42 + 19}
              y={40 + (7 - row) * 32 + 18}
              fill="#FFFFFF"
              fontSize="8"
              fontWeight="bold"
              textAnchor="middle"
              className="pointer-events-none select-none"
            >
              {padData.titanName ? padData.titanName.slice(0, 6) : `N:${noteId}`}
            </text>
          </g>
        )
      }
    }
    return pads
  }

  const renderSideButtons = () => {
    return [82, 83, 84, 85, 86, 87, 88, 89].map((noteId, idx) => {
      const isSelected = selectedNote === noteId
      const padData = mappings[noteId] || {}

      return (
        <g
          key={`side-${noteId}`}
          onClick={() => onSelectNote(noteId)}
          className="cursor-pointer hover:opacity-80"
        >
          <rect
            x={380}
            y={40 + idx * 32}
            width={35}
            height={28}
            rx={4}
            fill={padData.backgroundColor || '#1E293B'}
            stroke={isSelected ? '#3B82F6' : '#64748B'}
            strokeWidth={isSelected ? 3 : 1}
          />
          <text
            x={397}
            y={40 + idx * 32 + 17}
            fill="#94A3B8"
            fontSize="8"
            textAnchor="middle"
            className="pointer-events-none select-none"
          >
            {padData.titanName || `S${idx + 1}`}
          </text>
        </g>
      )
    })
  }

  const renderBottomButtons = () => {
    return [64, 65, 66, 67, 68, 69, 70, 71].map((noteId, idx) => {
      const isSelected = selectedNote === noteId
      const padData = mappings[noteId] || {}

      return (
        <g
          key={`bottom-${noteId}`}
          onClick={() => onSelectNote(noteId)}
          className="cursor-pointer hover:opacity-80"
        >
          <circle
            cx={59 + idx * 42}
            cy={310}
            r={12}
            fill={padData.backgroundColor || '#1E293B'}
            stroke={isSelected ? '#3B82F6' : '#64748B'}
            strokeWidth={isSelected ? 3 : 1}
          />
          <text
            x={59 + idx * 42}
            y={313}
            fill="#94A3B8"
            fontSize="8"
            textAnchor="middle"
            className="pointer-events-none select-none"
          >
            T{idx + 1}
          </text>
        </g>
      )
    })
  }

  const renderFaders = () => {
    return Array.from({ length: 9 }).map((_, idx) => {
      const isMaster = idx === 8
      const xPos = isMaster ? 385 : 59 + idx * 42

      return (
        <g key={`fader-${idx}`} className="select-none">
          <line
            x1={xPos}
            y1={340}
            x2={xPos}
            y2={440}
            stroke="#0F172A"
            strokeWidth={6}
            strokeLinecap="round"
          />
          <rect
            x={xPos - 12}
            y={380}
            width={24}
            height={16}
            rx={2}
            fill={isMaster ? '#EF4444' : '#E2E8F0'}
            stroke="#000"
            strokeWidth={1}
            className="cursor-ns-resize"
          />
          <text x={xPos} y={455} fill="#64748B" fontSize="8" textAnchor="middle">
            {isMaster ? 'MASTER' : `CH${idx + 1}`}
          </text>
        </g>
      )
    })
  }

  return (
    <div className="flex items-center justify-center rounded-xl border border-slate-800 bg-slate-950 p-4 shadow-2xl">
      <svg viewBox="0 0 440 480" className="h-auto w-full max-w-[650px] drop-shadow-md">
        <rect x={10} y={10} width={420} height={460} rx={16} fill="#111827" stroke="#374151" strokeWidth={3} />

        <text x={30} y={30} fill="#EF4444" fontSize="12" fontWeight="900">
          AKAI <tspan fill="#9CA3AF" fontWeight="normal">PROFESSIONAL</tspan>
        </text>
        <text x={395} y={30} fill="#6B7280" fontSize="10" fontWeight="bold" textAnchor="end">
          APC mini
        </text>

        {renderGrid()}
        {renderSideButtons()}
        {renderBottomButtons()}
        {renderFaders()}
      </svg>
    </div>
  )
}
