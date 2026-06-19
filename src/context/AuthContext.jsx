import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [loading, setLoading] = useState(true)

  async function carregarPerfil(userId) {
    const { data } = await supabase
      .from('perfis')
      .select('*, empresas(id, nome)')
      .eq('id', userId)
      .single()
    setPerfil(data)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) carregarPerfil(session.user.id).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) carregarPerfil(session.user.id)
      else setPerfil(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function login(email, senha) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) throw error
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  const isAgencia   = perfil?.perfil === 'admin_agencia' || perfil?.perfil === 'agente'
  const isAprovador = perfil?.perfil === 'aprovador' || perfil?.perfil === 'admin_cliente'
  const isAdmin     = perfil?.perfil === 'admin_agencia'

  return (
    <AuthContext.Provider value={{ user, perfil, loading, login, logout, isAgencia, isAprovador, isAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
