import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Plane, Loader2, CheckCircle2 } from 'lucide-react'

export default function RedefinirSenha() {
  const navigate = useNavigate()
  const [pronto, setPronto] = useState(false) // sessao de recovery ativa
  const [erro, setErro] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [loading, setLoading] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    // Supabase automaticamente cria uma sessao 'recovery' quando o usuario chega
    // aqui via o link do email (ele mesmo troca o hash pela sessao).
    // Damos um tempo curto pra isso acontecer.
    let cancelado = false
    supabase.auth.getSession().then(({ data }) => {
      if (cancelado) return
      if (data.session) setPronto(true)
      else setErro('Link invalido ou expirado. Peca um novo em "Esqueci minha senha".')
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setPronto(true)
    })
    return () => { cancelado = true; subscription.unsubscribe() }
  }, [])

  const valido = senha.length >= 8 && senha === confirmar

  async function handleSubmit(e) {
    e.preventDefault()
    if (!valido) return
    setLoading(true); setErro('')
    try {
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw error
      setOk(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      setErro(err.message || 'Falha ao atualizar a senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
            <Plane size={20} className="text-white" />
          </div>
          <div>
            <p className="text-white text-lg font-semibold leading-none">U Business Travel</p>
            <p className="text-slate-400 text-sm leading-none mt-0.5">Redefinir senha</p>
          </div>
        </div>

        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
          <h1 className="text-white text-xl font-semibold mb-4">Defina uma nova senha</h1>

          {ok ? (
            <div className="flex items-start gap-2 bg-emerald-500/10 text-emerald-300 rounded-lg px-3 py-2 text-sm">
              <CheckCircle2 size={16} className="mt-0.5" />
              <span>Senha atualizada. Redirecionando para o login…</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Nova senha</label>
                <input type="password" required disabled={!pronto || loading}
                  value={senha} onChange={e => setSenha(e.target.value)}
                  className="block w-full px-3 py-2 text-sm bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="Ao menos 8 caracteres" autoComplete="new-password" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Confirmar</label>
                <input type="password" required disabled={!pronto || loading}
                  value={confirmar} onChange={e => setConfirmar(e.target.value)}
                  className="block w-full px-3 py-2 text-sm bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="Repita a senha" autoComplete="new-password" />
                {confirmar && senha !== confirmar && (
                  <p className="text-xs mt-1 text-red-400">As senhas não coincidem.</p>
                )}
              </div>

              {erro && (
                <p className="text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">{erro}</p>
              )}

              <button type="submit" disabled={!valido || loading || !pronto} className="btn-primary w-full justify-center py-2.5">
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? 'Salvando...' : 'Atualizar senha'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
