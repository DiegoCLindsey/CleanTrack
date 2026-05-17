import { useState } from 'react'

function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(typeof ts === 'number' ? ts : ts.toMillis?.() ?? Number(ts))
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function RoomCard({ room, onToggleStep }) {
  const [collapsed, setCollapsed] = useState(false)
  const done = room.steps.filter(s => s.done).length
  const total = room.steps.length
  const allDone = done === total

  return (
    <div className="room-card">
      <div className="room-header" onClick={() => setCollapsed(c => !c)}>
        <div className="room-name">
          <span>{room.name}</span>
          <span className={`room-badge ${allDone ? 'done-badge' : ''}`}>{done}/{total}</span>
        </div>
        <div className="room-date">{fmtDate(room.lastUpdated)}</div>
      </div>

      {!collapsed && (
        <div className="room-steps-wrap">
          <div className="node-path">
            {room.steps.map((step, i) => (
              <div key={i} className="node-wrap">
                {i > 0 && (
                  <div className={`node-connector ${room.steps[i].done ? 'done' : ''}`} />
                )}
                <div className="node-item">
                  <div
                    className={`node ${step.done ? 'done' : ''}`}
                    onClick={() => onToggleStep(i)}
                  >
                    <span className="node-num">{i + 1}</span>
                  </div>
                  <div className="node-label">{step.name}</div>
                  <div className="node-tooltip">{step.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
