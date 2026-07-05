import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { User, Mail, Building2, Shield, Lock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

const PERFIL_LABEL = {
  admin_agencia: 'Admin da agência',
  agente: 'Agente',
  admin_cliente: 'Admin da empresa',
  aprovador: 'Aprovador',
  solicitante: 'Solicitante',
}

export default function Perfil() {
  const { user, perfil } = useAuth()
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [feedback, setFeedback] = useState(null) // { tipo: 'ok'|'erro', msg }

  const valido = senha.length >= 8 && senha === confirmar

  async function trocarSenha(e) {
    e.preventDefault()
    if (!valido) return
    setSalvando(true); setFeedback(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw error
      setSenha(''); setConfirmar('')
      setFeedback({ tipo: 'ok', msg: 'Senha atualizada com sucesso.' })
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err.message || 'Falha ao trocar a senha.' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#1A1614' }}>Meu perfil</h1>
        <p className="text-sm" style={{ color: '#6B7280' }}>Suas informações e segurança da conta</p>
      </div>

      {/* Dados */}
      <div className="card p-5 mb-5">
        <p className="text-sm font-medium mb-4" style={{ color: '#1A1614' }}>Dados da conta</p>
        <div className="space-y-3 text-sm">
          <Linha icon={User} label="Nome" value={perfil?.nome ?? '—'} />
          <Linha icon={Mail} label="E-mail" value={user?.email ?? '—'} />
          <Linha icon={Building2} label="Empresa" value={perfil?.empresas?.nome ?? 'U Business'} />
          <Linha icon={Shield} label="Perfil" value={PERFIL_LABEL[perfil?.perfil] ?? perfil?.perfil ?? '—'} />
        </div>
      </div>

      {/* Trocar senha */}
      <form onSubmit={trocarSenha} className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lock size={16} style={{ color: '#C0186A' }} />
          <p className="text-sm font-medium" style={{ color: '#1A1614' }}>Trocar senha</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="label">Nova senha *</label>
            <input type="password" className="input" placeholder="Ao menos 8 caracteres"
              value={senha} onChange={e => setSenha(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <label className="label">Confirmar nova senha *</label>
            <input type="password" className="input" placeholder="Repita a senha"
              value={confirmar} onChange={e => setConfirmar(e.target.value)} autoComplete="new-password" />
            {confirmar && senha !== confirmar && (
              <p className="text-xs mt-1" style={{ color: '#B91C1C' }}>As senhas não coincidem.</p>
            )}
            {senha && senha.length < 8 && (
              <p className="text-xs mt-1" style={{ color: '#B91C1C' }}>Mínimo de 8 caracteres.</p>
            )}
          </div>
        </div>

        {feedback && (
          <div className="mt-4 flex items-start gap-2 text-sm rounded-md px-3 py-2"
            style={{
              background: feedback.tipo === 'ok' ? '#ECFDF5' : '#FEF2F2',
              color: feedback.tipo === 'ok' ? '#065F46' : '#991B1B',
            }}>
            {feedback.tipo === 'ok' ? <CheckCircle2 size={15} className="mt-0.5" /> : <AlertCircle size={15} className="mt-0.5" />}
            <span>{feedback.msg}</span>
          </div>
        )}

        <div className="flex justify-end mt-5">
          <button type="submit" disabled={!valido || salvando} className="btn-primary">
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
            {salvando ? 'Salvando...' : 'Atualizar senha'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Linha({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3">
      <Icon size={16} style={{ color: '#9CA3AF' }} />
      <div className="flex-1 grid grid-cols-3 gap-3">
        <span style={{ color: '#6B7280' }}>{label}</span>
        <span className="col-span-2 font-medium" style={{ color: '#1A1614' }}>{value}</span>
      </div>
    </div>
  )
}
