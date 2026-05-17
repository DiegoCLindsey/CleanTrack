import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  doc, onSnapshot, updateDoc, collection, addDoc,
  serverTimestamp, query, orderBy, arrayRemove,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../hooks/useAuth.jsx'
import RoomCard from '../components/RoomCard.jsx'
import Modal from '../components/Modal.jsx'
import FloorPlan from '../components/FloorPlan.jsx'

const TABS = [
  { id: 'session', label: 'Sesión' },
  { id: 'map', label: 'Mapa' },
  { id: 'history', label: 'Historial' },
  { id: 'config', label: 'Configurar' },
  { id: 'share', label: 'Compartir' },
]

function fmtDate(ts) {
  if (!ts) return '—'
  const d = new Date(typeof ts === 'number' ? ts : ts.toMillis?.() ?? Number(ts))
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

function fmtDateTime(ts) {
  if (!ts) return '—'
  const d = new Date(typeof ts === 'number' ? ts : ts.toMillis?.() ?? Number(ts))
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function calcProgress(session) {
  let done = 0, total = 0
  for (const room of session.rooms ?? []) {
    for (const step of room.steps ?? []) {
      total++
      if (step.done) done++
    }
  }
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) }
}

export default function ListPage() {
  const { listId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [list, setList] = useState(null)
  const [sessions, setSessions] = useState([])
  const [selectedSessionId, setSelectedSessionId] = useState(null)
  const [tab, setTab] = useState('session')
  const [loading, setLoading] = useState(true)

  const [showNewSession, setShowNewSession] = useState(false)
  const [newSessionName, setNewSessionName] = useState('')
  const [creating, setCreating] = useState(false)

  const [newRoom, setNewRoom] = useState('')
  const [newStep, setNewStep] = useState('')
  const [configAlert, setConfigAlert] = useState(null)

  const [copied, setCopied] = useState(false)

  // Subscribe to list doc
  useEffect(() => {
    return onSnapshot(doc(db, 'lists', listId), snap => {
      if (!snap.exists()) { navigate('/'); return }
      const data = snap.data()
      if (!data.memberEmails?.includes(user.email)) { navigate('/'); return }
      setList({ id: snap.id, ...data })
      setLoading(false)
    })
  }, [listId, user.email, navigate])

  // Subscribe to sessions
  useEffect(() => {
    const q = query(collection(db, 'lists', listId, 'sessions'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setSessions(docs)
      // auto-select first unfinished session
      setSelectedSessionId(prev => {
        if (prev && docs.find(s => s.id === prev)) return prev
        return docs.find(s => !s.finished)?.id ?? null
      })
    })
  }, [listId])

  const activeSession = sessions.find(s => s.id === selectedSessionId) ?? null

  // Progress for header ring
  const { done, total, pct } = activeSession && !activeSession.finished
    ? calcProgress(activeSession)
    : { done: 0, total: 0, pct: 0 }

  const circ = 2 * Math.PI * 16

  // Progress per room name (0–1) for the floor plan
  const progressByRoom = {}
  if (activeSession && !activeSession.finished) {
    for (const room of activeSession.rooms ?? []) {
      const t = room.steps?.length ?? 0
      const d = room.steps?.filter(s => s.done).length ?? 0
      progressByRoom[room.name] = t === 0 ? 0 : d / t
    }
  }

  const saveZones = (newZones) =>
    updateDoc(doc(db, 'lists', listId), { zones: newZones })

  // ── Session actions ─────────────────────────────────────────────────────────

  const createSession = async () => {
    if (!newSessionName.trim() || !list) return
    setCreating(true)
    try {
      const rooms = (list.rooms ?? []).map(name => ({
        id: crypto.randomUUID(),
        name,
        lastUpdated: null,
        steps: (list.steps ?? []).map(s => ({ name: s, done: false })),
      }))
      const ref = await addDoc(collection(db, 'lists', listId, 'sessions'), {
        name: newSessionName.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        finished: false,
        finishedAt: null,
        rooms,
      })
      setSelectedSessionId(ref.id)
      setShowNewSession(false)
      setNewSessionName('')
      setTab('session')
    } finally {
      setCreating(false)
    }
  }

  const toggleStep = async (roomId, stepIdx) => {
    if (!activeSession) return
    const updatedRooms = activeSession.rooms.map(room => {
      if (room.id !== roomId) return room
      const steps = room.steps.map((step, i) =>
        i === stepIdx ? { ...step, done: !step.done } : step,
      )
      return { ...room, steps, lastUpdated: Date.now() }
    })
    await updateDoc(doc(db, 'lists', listId, 'sessions', activeSession.id), {
      rooms: updatedRooms,
      updatedAt: serverTimestamp(),
    })
  }

  const finishSession = async () => {
    if (!activeSession || !confirm('¿Finalizar esta sesión?')) return
    await updateDoc(doc(db, 'lists', listId, 'sessions', activeSession.id), {
      finished: true,
      finishedAt: serverTimestamp(),
    })
  }

  const openSession = (sess) => {
    setSelectedSessionId(sess.id)
    setTab('session')
  }

  // ── Config actions ───────────────────────────────────────────────────────────

  const showAlert = (msg, type = 'success') => {
    setConfigAlert({ msg, type })
    setTimeout(() => setConfigAlert(null), 2500)
  }

  const addRoom = async () => {
    const val = newRoom.trim()
    if (!val || !list) return
    await updateDoc(doc(db, 'lists', listId), { rooms: [...list.rooms, val] })
    setNewRoom('')
    showAlert(`"${val}" añadida.`)
  }

  const removeRoom = async (name) => {
    if (!list || list.rooms.length <= 1) { showAlert('Debe haber al menos una estancia.', 'error'); return }
    if (!confirm(`¿Eliminar "${name}"?`)) return
    await updateDoc(doc(db, 'lists', listId), { rooms: arrayRemove(name) })
  }

  const addStep = async () => {
    const val = newStep.trim()
    if (!val || !list) return
    await updateDoc(doc(db, 'lists', listId), { steps: [...list.steps, val] })
    setNewStep('')
    showAlert(`"${val}" añadido.`)
  }

  const removeStep = async (name) => {
    if (!list || list.steps.length <= 1) { showAlert('Debe haber al menos un paso.', 'error'); return }
    if (!confirm(`¿Eliminar "${name}"?`)) return
    await updateDoc(doc(db, 'lists', listId), { steps: arrayRemove(name) })
  }

  // ── Share actions ────────────────────────────────────────────────────────────

  const copyCode = () => {
    navigator.clipboard.writeText(list.inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const leaveList = async () => {
    if (list.ownerId === user.uid) {
      alert('Eres el propietario. Transfiere la propiedad antes de salir.')
      return
    }
    if (!confirm('¿Salir de esta lista?')) return
    await updateDoc(doc(db, 'lists', listId), { memberEmails: arrayRemove(user.email) })
    navigate('/')
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <div className="loading-screen">Cargando…</div>

  return (
    <>
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <button className="back-btn" onClick={() => navigate('/')} aria-label="Volver">‹</button>
          <div className="brand">
            {list?.name}
            <span className="brand-sub">CleanTrack</span>
          </div>
        </div>
        <div className="header-right">
          {activeSession && !activeSession.finished ? (
            <div className="progress-ring-wrap">
              <div className="progress-text">
                <div className="progress-pct">{pct}%</div>
                <div className="progress-label">{done} / {total}</div>
              </div>
              <svg width="38" height="38" className="ring" viewBox="0 0 38 38">
                <circle className="ring-bg" cx="19" cy="19" r="16" />
                <circle
                  className="ring-fill" cx="19" cy="19" r="16"
                  strokeDasharray={circ}
                  strokeDashoffset={circ - (pct / 100) * circ}
                />
              </svg>
            </div>
          ) : null}
          <button className="icon-btn accent" onClick={() => setShowNewSession(true)} title="Nueva sesión">＋</button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="nav-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`nav-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="page-wrap">

        {/* ── SESIÓN ── */}
        {tab === 'session' && (
          <>
            {!activeSession || activeSession.finished ? (
              <div className="no-content">
                <h3>Sin sesión activa</h3>
                <p>Crea una nueva sesión para empezar a limpiar.</p>
                <button className="btn primary" onClick={() => setShowNewSession(true)}>＋ Nueva sesión</button>
              </div>
            ) : (
              <>
                <div className="session-header">
                  <div>
                    <div className="session-title">{activeSession.name}</div>
                    <div className="session-meta">{fmtDateTime(activeSession.createdAt)}</div>
                  </div>
                  <div className="btn-row">
                    <button className="btn sm danger" onClick={finishSession}>Finalizar</button>
                  </div>
                </div>

                {activeSession.rooms?.map(room => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    onToggleStep={i => toggleStep(room.id, i)}
                  />
                ))}
              </>
            )}
          </>
        )}

        {/* ── MAPA ── */}
        {tab === 'map' && list && (
          <FloorPlan
            zones={list.zones ?? []}
            rooms={list.rooms ?? []}
            progressByRoom={progressByRoom}
            onSaveZones={saveZones}
          />
        )}

        {/* ── HISTORIAL ── */}
        {tab === 'history' && (
          <>
            {sessions.length === 0 ? (
              <div className="no-content">
                <p>No hay sesiones todavía.</p>
              </div>
            ) : (
              sessions.map(sess => {
                const { done: sd, total: st, pct: sp } = calcProgress(sess)
                const isActive = sess.id === selectedSessionId && !sess.finished
                return (
                  <div key={sess.id} className="hist-card" onClick={() => openSession(sess)}>
                    <div className="hist-card-header">
                      <div>
                        <div className="hist-card-title">
                          {sess.name}
                          {isActive && <span className="chip active" style={{ marginLeft: 8 }}>activa</span>}
                        </div>
                        <div className="hist-card-date">{fmtDate(sess.createdAt)}</div>
                      </div>
                      {sess.finished
                        ? <span className="chip done">Completa</span>
                        : sp === 0
                          ? <span className="chip empty">Sin iniciar</span>
                          : <span className="chip partial">{sp}%</span>}
                    </div>
                    <div className="hist-progress">
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text2)' }}>
                        <span>{sd} de {st} pasos</span>
                        <span>{sp}%</span>
                      </div>
                      <div className="progress-bar-wrap">
                        <div className="progress-bar" style={{ width: `${sp}%` }} />
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </>
        )}

        {/* ── CONFIGURAR ── */}
        {tab === 'config' && list && (
          <>
            {configAlert && <div className={`alert ${configAlert.type}`}>{configAlert.msg}</div>}

            <div className="config-section">
              <h3>Estancias</h3>
              <div className="config-list">
                {list.rooms.map(name => (
                  <div key={name} className="config-item">
                    <span className="item-label">{name}</span>
                    <div className="item-actions">
                      <button className="del" onClick={() => removeRoom(name)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="add-item-row">
                <input
                  type="text"
                  value={newRoom}
                  onChange={e => setNewRoom(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addRoom()}
                  placeholder="Nueva estancia…"
                  maxLength={40}
                />
                <button className="btn primary sm" onClick={addRoom}>Añadir</button>
              </div>
            </div>

            <div className="config-section">
              <h3>Pasos de limpieza</h3>
              <div className="config-list">
                {list.steps.map(name => (
                  <div key={name} className="config-item">
                    <span className="item-label">{name}</span>
                    <div className="item-actions">
                      <button className="del" onClick={() => removeStep(name)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="add-item-row">
                <input
                  type="text"
                  value={newStep}
                  onChange={e => setNewStep(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addStep()}
                  placeholder="Nuevo paso…"
                  maxLength={40}
                />
                <button className="btn primary sm" onClick={addStep}>Añadir</button>
              </div>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text2)' }}>
              Los cambios se aplican a las nuevas sesiones. Las sesiones ya creadas no se modifican.
            </p>
          </>
        )}

        {/* ── COMPARTIR ── */}
        {tab === 'share' && list && (
          <>
            <div className="section-title">Código de invitación</div>
            <div className="invite-box">
              <div>
                <div className="invite-label">Código</div>
                <div className="invite-code">{list.inviteCode}</div>
              </div>
              <button className="btn primary" onClick={copyCode}>
                {copied ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24 }}>
              Comparte este código con quien quieras que tenga acceso a esta lista. Solo usuarios autorizados en la plataforma pueden unirse.
            </p>

            <div className="section-title">Miembros ({list.memberEmails?.length ?? 1})</div>
            <div className="member-list">
              {list.memberEmails?.map(email => (
                <div key={email} className="member-item">
                  <span className="member-email">{email}</span>
                  {email === list.ownerEmail && <span className="owner-badge">propietario</span>}
                </div>
              ))}
            </div>

            {list.ownerId !== user.uid && (
              <div style={{ marginTop: 24 }}>
                <button className="btn danger sm" onClick={leaveList}>Salir de la lista</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* New session modal */}
      <Modal
        open={showNewSession}
        onClose={() => { setShowNewSession(false); setNewSessionName('') }}
        title="Nueva sesión de limpieza"
        actions={
          <>
            <button className="btn" onClick={() => { setShowNewSession(false); setNewSessionName('') }}>Cancelar</button>
            <button className="btn primary" onClick={createSession} disabled={creating || !newSessionName.trim()}>
              {creating ? 'Creando…' : 'Crear'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Nombre</label>
          <input
            type="text"
            value={newSessionName}
            onChange={e => setNewSessionName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createSession()}
            placeholder={`Limpieza ${new Date().toLocaleDateString('es-ES')}`}
            maxLength={60}
            autoFocus
          />
        </div>
        {list && (
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>
            Se crearán {list.rooms?.length ?? 0} estancias × {list.steps?.length ?? 0} pasos = {(list.rooms?.length ?? 0) * (list.steps?.length ?? 0)} nodos.
          </p>
        )}
      </Modal>
    </>
  )
}
