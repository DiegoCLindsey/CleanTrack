import { useState, useRef, useCallback } from 'react'

const GRID = 10
const snap = v => Math.round(v / GRID) * GRID
const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

function progressColor(pct) {
  return `rgba(42, 110, 74, ${(pct * 0.7).toFixed(3)})`
}

const HANDLES = ['nw', 'ne', 'sw', 'se']

function handlePos(zone, h) {
  return {
    x: h.includes('e') ? zone.x + zone.w : zone.x,
    y: h.includes('s') ? zone.y + zone.h : zone.y,
  }
}

export default function FloorPlan({ zones, rooms, progressByRoom, onSaveZones }) {
  const svgRef = useRef(null)
  const [selectedId, setSelectedId] = useState(null)
  const [drag, setDrag] = useState(null)
  const [liveZone, setLiveZone] = useState(null)
  const [pendingRect, setPendingRect] = useState(null)

  const svgCoords = useCallback((e) => {
    const svg = svgRef.current
    const r = svg.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    return {
      x: clamp(((src.clientX - r.left) / r.width) * 100, 0, 100),
      y: clamp(((src.clientY - r.top) / r.height) * 100, 0, 100),
    }
  }, [])

  // ── Drag start ──────────────────────────────────────────────────────────────

  const onSvgDown = (e) => {
    e.preventDefault()
    const { x, y } = svgCoords(e)
    const sx = snap(x), sy = snap(y)
    setSelectedId(null)
    setDrag({ type: 'draw', sx, sy })
    setLiveZone({ x: sx, y: sy, w: 0, h: 0 })
  }

  const onZoneDown = (e, zone) => {
    e.stopPropagation()
    e.preventDefault()
    const pos = svgCoords(e)
    setSelectedId(zone.id)
    setDrag({ type: 'move', zoneId: zone.id, sx: pos.x, sy: pos.y, orig: { ...zone } })
    setLiveZone({ ...zone })
  }

  const onHandleDown = (e, zone, handle) => {
    e.stopPropagation()
    e.preventDefault()
    setDrag({ type: 'resize', zoneId: zone.id, handle, orig: { ...zone } })
    setLiveZone({ ...zone })
  }

  // ── Drag move ───────────────────────────────────────────────────────────────

  const onMove = (e) => {
    if (!drag) return
    e.preventDefault()
    const { x, y } = svgCoords(e)

    if (drag.type === 'draw') {
      const ex = snap(x), ey = snap(y)
      setLiveZone({
        x: Math.min(drag.sx, ex), y: Math.min(drag.sy, ey),
        w: Math.abs(ex - drag.sx), h: Math.abs(ey - drag.sy),
      })
    } else if (drag.type === 'move') {
      const o = drag.orig
      const dx = snap(x - drag.sx), dy = snap(y - drag.sy)
      setLiveZone({
        ...o,
        x: clamp(snap(o.x + dx), 0, 100 - o.w),
        y: clamp(snap(o.y + dy), 0, 100 - o.h),
      })
    } else if (drag.type === 'resize') {
      const o = drag.orig
      const ex = snap(clamp(x, 0, 100))
      const ey = snap(clamp(y, 0, 100))
      const h = drag.handle
      let { x: rx, y: ry, w: rw, h: rh } = o

      if (h.includes('e')) { rw = Math.max(GRID, ex - o.x) }
      if (h.includes('w')) { rw = Math.max(GRID, o.x + o.w - ex); rx = o.x + o.w - rw }
      if (h.includes('s')) { rh = Math.max(GRID, ey - o.y) }
      if (h.includes('n')) { rh = Math.max(GRID, o.y + o.h - ey); ry = o.y + o.h - rh }

      setLiveZone({ ...o, x: rx, y: ry, w: rw, h: rh })
    }
  }

  // ── Drag end ────────────────────────────────────────────────────────────────

  const onUp = (e) => {
    if (!drag) return
    e.preventDefault()

    if (drag.type === 'draw') {
      if (liveZone?.w >= GRID && liveZone?.h >= GRID) setPendingRect({ ...liveZone })
    } else if ((drag.type === 'move' || drag.type === 'resize') && liveZone) {
      onSaveZones(zones.map(z => z.id === drag.zoneId ? { ...z, ...liveZone } : z))
    }

    setDrag(null)
    setLiveZone(null)
  }

  // ── Other actions ───────────────────────────────────────────────────────────

  const assignRoom = (roomName) => {
    if (!pendingRect) return
    onSaveZones([...zones, { id: crypto.randomUUID(), roomName, ...pendingRect }])
    setPendingRect(null)
  }

  const deleteZone = (id, e) => {
    e?.stopPropagation()
    onSaveZones(zones.filter(z => z.id !== id))
    setSelectedId(null)
  }

  const ez = (zone) =>
    liveZone && drag?.zoneId === zone.id ? { ...zone, ...liveZone } : zone

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="floorplan-wrap">
        <svg
          ref={svgRef}
          className="floorplan-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          onMouseDown={onSvgDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
          onTouchStart={onSvgDown}
          onTouchMove={onMove}
          onTouchEnd={onUp}
        >
          {/* Grid */}
          <defs>
            <pattern id="fp-grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M10 0 L0 0 0 10" fill="none" stroke="var(--border)" strokeWidth="0.4" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="var(--surface)" />
          <rect width="100" height="100" fill="url(#fp-grid)" />

          {/* Zones */}
          {zones.map((zone) => {
            const z = ez(zone)
            const pct = progressByRoom?.[zone.roomName] ?? 0
            const sel = zone.id === selectedId
            return (
              <g key={zone.id}>
                {/* Zone body */}
                <rect
                  x={z.x} y={z.y} width={z.w} height={z.h}
                  fill={progressColor(pct)}
                  stroke={sel ? 'var(--accent)' : (pct > 0 ? 'var(--accent-mid)' : 'var(--border2)')}
                  strokeWidth={sel ? 0.8 : 0.5}
                  strokeDasharray={sel ? '2 1' : 'none'}
                  style={{ cursor: drag?.type === 'move' && drag.zoneId === zone.id ? 'grabbing' : 'grab' }}
                  onMouseDown={(e) => onZoneDown(e, zone)}
                  onTouchStart={(e) => onZoneDown(e, zone)}
                  onClick={() => setSelectedId(sel ? null : zone.id)}
                />

                {/* Room name */}
                {z.w > 8 && z.h > 6 && (
                  <text
                    x={z.x + z.w / 2} y={z.y + z.h / 2 - (z.h > 10 ? 1.5 : 0)}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={Math.max(2.2, Math.min(4, z.w / 8))}
                    fill="var(--text)"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >{zone.roomName}</text>
                )}

                {/* Progress % */}
                {z.w > 8 && z.h > 10 && (
                  <text
                    x={z.x + z.w / 2} y={z.y + z.h / 2 + 3}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="2.5"
                    fill={pct > 0 ? 'var(--accent)' : 'var(--text3)'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >{Math.round(pct * 100)}%</text>
                )}

                {/* Selection: resize handles + delete */}
                {sel && HANDLES.map(h => {
                  const hp = handlePos(z, h)
                  return (
                    <rect
                      key={h}
                      x={hp.x - 1.5} y={hp.y - 1.5} width="3" height="3"
                      fill="var(--surface)" stroke="var(--accent)" strokeWidth="0.6"
                      style={{ cursor: 'nwse-resize' }}
                      onMouseDown={(e) => onHandleDown(e, zone, h)}
                      onTouchStart={(e) => onHandleDown(e, zone, h)}
                    />
                  )
                })}
                {sel && (
                  <g onClick={(e) => deleteZone(zone.id, e)} style={{ cursor: 'pointer' }}>
                    <circle cx={z.x + z.w} cy={z.y} r="3" fill="var(--danger)" />
                    <text
                      x={z.x + z.w} y={z.y}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize="3" fill="white"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >✕</text>
                  </g>
                )}
              </g>
            )
          })}

          {/* Drawing preview */}
          {drag?.type === 'draw' && liveZone?.w > 0 && (
            <rect
              x={liveZone.x} y={liveZone.y} width={liveZone.w} height={liveZone.h}
              fill="rgba(42,110,74,0.12)"
              stroke="var(--accent)" strokeWidth="0.6" strokeDasharray="2 1"
            />
          )}
        </svg>
      </div>

      {/* Room picker */}
      {pendingRect && (
        <div className="floorplan-picker">
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
            ¿A qué estancia pertenece esta zona?
          </p>
          <div className="btn-row">
            {rooms.map(room => (
              <button key={room} className="btn sm" onClick={() => assignRoom(room)}>{room}</button>
            ))}
            <button className="btn sm danger" onClick={() => setPendingRect(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="floorplan-legend">
        {zones.length === 0
          ? 'Dibuja un rectángulo para añadir una zona'
          : 'Arrastra para mover · Esquinas para redimensionar · Clic para seleccionar'}
      </div>

      <div className="floorplan-scale">
        <span>0%</span>
        <div className="floorplan-scale-bar" />
        <span>100%</span>
      </div>
    </div>
  )
}
