import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db, googleProvider } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [whitelistError, setWhitelistError] = useState(false)

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const snap = await getDoc(doc(db, 'whitelist', firebaseUser.email))
        if (snap.exists()) {
          setUser(firebaseUser)
          setWhitelistError(false)
        } else {
          await signOut(auth)
          setUser(null)
          setWhitelistError(true)
        }
      } else {
        setUser(null)
      }
      setLoading(false)
    })
  }, [])

  const login = () => {
    setWhitelistError(false)
    return signInWithPopup(auth, googleProvider)
  }

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, loading, whitelistError, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
