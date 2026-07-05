import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Plane, Loader2, ChevronLeft, CheckCircle2 } from 'lucide-react'

export default function EsqueciSenha() {
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(''); setLoading(true)
    try {
      const redirectTo = `${window.location.origin}/redefinir-senha`
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) throw error
      setEnviado(true)
    } catch (err) {
      setErro(err.message || 'Falha ao enviar o e-mail.')
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
            <p className="text-slate-400 text-sm leading-none mt-0.5">Recuperar senha</p>
          </div>
        </div>

        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
          <h1 className="text-white text-xl font-semibold mb-1">Esqueci minha senha</h1>
          <p className="text-slate-400 text-sm mb-6">
            Enviamos um link de redefinição pro seu e-mail.
          </p>

          {enviado ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 bg-emerald-500/10 text-emerald-300 rounded-lg px-3 py-2 text-sm">
                <CheckCircle2 size={16} className="mt-0.5" />
                <span>Se existir uma conta com esse e-mail, você vai receber o link em instantes.</span>
              </div>
              <Link to="/login" className="btn-secondary w-full justify-center">
                <ChevronLeft size={15} /> Voltar ao login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">E-mail</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  className="block w-full px-3 py-2 text-sm bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="seu@email.com" />
              </div>

              {erro && (
                <p className="text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">{erro}</p>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? 'Enviando...' : 'Enviar link'}
              </button>

              <Link to="/login" className="flex items-center justify-center gap-1 text-sm text-slate-400 hover:text-white">
                <ChevronLeft size={14} /> Voltar ao login
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
