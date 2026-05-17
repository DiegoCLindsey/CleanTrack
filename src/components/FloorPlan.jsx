import { useState, useRef } from 'react'

function getProgressColor(pct) {
  return `rgba(42, 110, 74, ${(pct * 0.7).toFixed(3)})`
}

export default function FloorPlan({ zones, rooms, progressByRoom, onSaveZones }) {
  const svgRef = useRef(null)
  const [drawing, setDrawing] = useState(false)
  const [tempRect, setTempRect] = useState(null)
  const [startPos, setStartPos] = useState(null)
  const [pendingRect, setPendingRect] = useState(null)
  const [selectedZoneId, setSelectedZoneId] = useState(null)

  const getCoords = (e) => {
    const svg = svgRef.current
    const rect = svg.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    return {
      x: Math.max(0, Math.min(100, ((src.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((src.clientY - rect.top) / rect.height) * 100)),
    }
  }

  const onDown = (e) => {
    if (e.target.closest('.zone-g')) return
    e.preventDefault()
    const pos = getCoords(e)
    setStartPos(pos)
    setDrawing(true)
    setTempRect({ x: pos.x, y: pos.y, w: 0, h: 0 })
    setSelectedZoneId(null)
  }

  const onMove = (e) => {
    if (!drawing || !startPos) return
    e.preventDefault()
    const pos = getCoords(e)
    setTempRect({
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      w: Math.abs(pos.x - startPos.x),
      h: Math.abs(pos.y - startPos.y),
    })
  }

  const onUp = (e) => {
    if (!drawing) return
    e.preventDefault()
    setDrawing(false)
    if (tempRect && tempRect.w > 3 && tempRect.h > 3) {
      setPendingRect({ ...tempRect })
    }
    setTempRect(null)
    setStartPos(null)
  }

  const assignRoom = (roomName) => {
    if (!pendingRect) return
    const newZone = { id: crypto.randomUUID(), roomName, ...pendingRect }
    onSaveZones([...zones, newZone])
    setPendingRect(null)
  }

  const deleteZone = (id, e) => {
    e?.stopPropagation()
    onSaveZones(zones.filter(z => z.id !== id))
    setSelectedZoneId(null)
  }

  return (
    <div>
      {/* Canvas */}
      <div className="floorplan-wrap">
        <svg
          ref={svgRef}
          className="floorplan-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
          onTouchStart={onDown}
          onTouchMove={onMove}
          onTouchEnd={onUp}
        >
          {/* Grid background */}
          <defs>
            <pattern id="fp-grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M10 0 L0 0 0 10" fill="none" stroke="var(--border)" strokeWidth="0.4" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="var(--surface)" />
          <rect width="100" height="100" fill="url(#fp-grid)" />

          {/* Existing zones */}
          {zones.map((zone) => {
            const pct = progressByRoom?.[zone.roomName] ?? 0
            const isSelected = zone.id === selectedZoneId
            return (
              <g
                key={zone.id}
                className="zone-g"
                onClick={() => setSelectedZoneId(isSelected ? null : zone.id)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={zone.x} y={zone.y} width={zone.w} height={zone.h}
                  fill={getProgressColor(pct)}
                  stroke={pct > 0 ? 'var(--accent)' : 'var(--border2)'}
                  strokeWidth={isSelected ? 0.8 : 0.5}
                  strokeDasharray={isSelected ? '2 1' : 'none'}
                  rx="0.8"
                />
                {/* Room label */}
                {zone.w > 8 && zone.h > 6 && (
                  <text
                    x={zone.x + zone.w / 2}
                    y={zone.y + zone.h / 2 - (zone.h > 10 ? 1.5 : 0)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.max(2.2, Math.min(4, zone.w / 8))}
                    fill="var(--text)"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {zone.roomName}
                  </text>
                )}
                {/* Progress % */}
                {zone.w > 8 && zone.h > 10 && (
                  <text
                    x={zone.x + zone.w / 2}
                    y={zone.y + zone.h / 2 + 3}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="2.5"
                    fill={pct > 0 ? 'var(--accent)' : 'var(--text3)'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {Math.round(pct * 100)}%
                  </text>
                )}
                {/* Delete button when selected */}
                {isSelected && (
                  <g onClick={(e) => deleteZone(zone.id, e)} style={{ cursor: 'pointer' }}>
                    <circle cx={zone.x + zone.w} cy={zone.y} r="3" fill="var(--danger)" />
                    <text
                      x={zone.x + zone.w} y={zone.y}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize="3" fill="white"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      ✕
                    </text>
                  </g>
                )}
              </g>
            )
          })}

          {/* Temp rect while drawing */}
          {tempRect && tempRect.w > 0 && (
            <rect
              x={tempRect.x} y={tempRect.y} width={tempRect.w} height={tempRect.h}
              fill="rgba(42,110,74,0.12)"
              stroke="var(--accent)"
              strokeWidth="0.6"
              strokeDasharray="2 1"
              rx="0.8"
            />
          )}
        </svg>
      </div>

      {/* Room picker after drawing */}
      {pendingRect && (
        <div className="floorplan-picker">
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
            ¿A qué estancia pertenece esta zona?
          </p>
          <div className="btn-row">
            {rooms.map((room) => (
              <button key={room} className="btn sm" onClick={() => assignRoom(room)}>
                {room}
              </button>
            ))}
            <button className="btn sm danger" onClick={() => setPendingRect(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="floorplan-legend">
        {zones.length === 0 ? (
          <span>Dibuja un rectángulo para añadir una zona</span>
        ) : (
          <>
            <span>Haz clic en una zona para seleccionarla · </span>
            <span>
              {rooms
                .filter((r) => !zones.find((z) => z.roomName === r))
                .map((r) => <span key={r} style={{ color: 'var(--warn)' }}>{r} sin zona · </span>)
              }
            </span>
          </>
        )}
      </div>

      {/* Color scale */}
      <div className="floorplan-scale">
        <span>0%</span>
        <div className="floorplan-scale-bar" />
        <span>100%</span>
      </div>
    </div>
  )
}
