import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, query, where, onSnapshot,
  addDoc, serverTimestamp, getDocs, updateDoc, doc, arrayUnion,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../hooks/useAuth.jsx'
import Modal from '../components/Modal.jsx'

const DEFAULT_ROOMS = ['Salón', 'Cocina', 'Dormitorio', 'Baño', 'Pasillo']
const DEFAULT_STEPS = ['Recoger', 'Polvo', 'Barrer', 'Trapo', 'Fregona']

function genCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [lists, setLists] = useState([])
  const [showNewList, setShowNewList] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    const q = query(
      collection(db, 'lists'),
      where('memberEmails', 'array-contains', user.email),
    )
    return onSnapshot(q, snap => {
      setLists(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [user.email])

  const createList = async () => {
    if (!newListName.trim()) return
    setCreating(true)
    try {
      const ref = await addDoc(collection(db, 'lists'), {
        name: newListName.trim(),
        ownerId: user.uid,
        ownerEmail: user.email,
        memberEmails: [user.email],
        inviteCode: genCode(),
        rooms: DEFAULT_ROOMS,
        steps: DEFAULT_STEPS,
        createdAt: serverTimestamp(),
      })
      setNewListName('')
      setShowNewList(false)
      navigate(`/list/${ref.id}`)
    } finally {
      setCreating(false)
    }
  }

  const joinByCode = async () => {
    setJoinError('')
    if (!inviteCode.trim()) return
    setJoining(true)
    try {
      const q = query(
        collection(db, 'lists'),
        where('inviteCode', '==', inviteCode.trim().toUpperCase()),
      )
      const snap = await getDocs(q)
      if (snap.empty) {
        setJoinError('Código no encontrado.')
        return
      }
      const listDoc = snap.docs[0]
      if (listDoc.data().memberEmails?.includes(user.email)) {
        setJoinError('Ya eres miembro de esta lista.')
        return
      }
      await updateDoc(doc(db, 'lists', listDoc.id), {
        memberEmails: arrayUnion(user.email),
      })
      setInviteCode('')
      setShowJoin(false)
      navigate(`/list/${listDoc.id}`)
    } finally {
      setJoining(false)
    }
  }

  return (
    <>
      <header className="app-header">
        <div className="header-left">
          <div className="brand">CleanTrack</div>
        </div>
        <div className="header-right">
          {user.photoURL
            ? <img className="avatar" src={user.photoURL} alt={user.displayName} referrerPolicy="no-referrer" />
            : <div className="avatar-fallback">{user.email[0].toUpperCase()}</div>
          }
          <button className="btn sm" onClick={logout}>Salir</button>
        </div>
      </header>

      <div className="page-wrap">
        <div className="section-title">Mis listas</div>

        {lists.length === 0 && (
          <div className="no-content">
            <h3>Sin listas todavía</h3>
            <p>Crea una lista o únete a una con un código de invitación.</p>
          </div>
        )}

        {lists.map(list => (
          <div
            key={list.id}
            className="list-card"
            onClick={() => navigate(`/list/${list.id}`)}
          >
            <div>
              <div className="list-card-title">{list.name}</div>
              <div className="list-card-meta">
                {list.rooms?.length ?? 0} estancias · {list.steps?.length ?? 0} pasos · {list.memberEmails?.length ?? 1} miembro{list.memberEmails?.length !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="list-card-arrow">›</div>
          </div>
        ))}

        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={() => setShowNewList(true)}>＋ Nueva lista</button>
          <button className="btn" onClick={() => setShowJoin(true)}>Unirse con código</button>
        </div>
      </div>

      {/* New list modal */}
      <Modal
        open={showNewList}
        onClose={() => { setShowNewList(false); setNewListName('') }}
        title="Nueva lista de limpieza"
        actions={
          <>
            <button className="btn" onClick={() => { setShowNewList(false); setNewListName('') }}>Cancelar</button>
            <button className="btn primary" onClick={createList} disabled={creating || !newListName.trim()}>
              {creating ? 'Creando…' : 'Crear'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Nombre</label>
          <input
            type="text"
            value={newListName}
            onChange={e => setNewListName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createList()}
            placeholder="Ej: Casa de verano"
            maxLength={60}
            autoFocus
          />
        </div>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>
          Se crearán con las estancias y pasos por defecto. Podrás modificarlos después.
        </p>
      </Modal>

      {/* Join modal */}
      <Modal
        open={showJoin}
        onClose={() => { setShowJoin(false); setInviteCode(''); setJoinError('') }}
        title="Unirse a una lista"
        actions={
          <>
            <button className="btn" onClick={() => { setShowJoin(false); setInviteCode(''); setJoinError('') }}>Cancelar</button>
            <button className="btn primary" onClick={joinByCode} disabled={joining || !inviteCode.trim()}>
              {joining ? 'Buscando…' : 'Unirse'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Código de invitación</label>
          <input
            type="text"
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && joinByCode()}
            placeholder="XXXXXX"
            maxLength={6}
            style={{ textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--mono, monospace)', fontSize: 20 }}
            autoFocus
          />
        </div>
        {joinError && <div className="alert error">{joinError}</div>}
      </Modal>
    </>
  )
}
