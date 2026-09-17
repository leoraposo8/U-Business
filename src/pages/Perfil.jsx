import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { User, Mail, Building2, Shield, Lock, Loader2, CheckCircle2, AlertCircle, Users, ArrowUp, ArrowDown } from 'lucide-react'

const PERFIL_LABEL = {
  admin_agencia:     'Admin da agência',
  agente:            'Agente',
  admin_cliente:     'Admin da empresa',
  aprovador_nivel_0: 'Aprovador Nível 0',
  aprovador_1:       'Aprovador Nível 1',
  aprovador_2:       'Aprovador Nível 2',
  aprovador:         'Aprovador',
  solicitante:       'Solicitante',
}

export default function Perfil() {
  const { user, perfil } = useAuth()
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [feedback, setFeedback] = useState(null) // { tipo: 'ok'|'erro', msg }

  const [aprovadorDireto, setAprovadorDireto] = useState(null)
  const [subordinados, setSubordinados]       = useState([])
  const [loadingHier, setLoadingHier]         = useState(false)

  // Regras de exibição:
  // - Aprovador direto acima: mostra pra solicitante e aprovador_nivel_0.
  //   Nivel_1 e Nivel_2 NAO mostram quem está acima (regra do produto).
  // - Subordinados abaixo: mostra pra nivel_0 (solicitantes) e nivel_1 (nivel_0 abaixo).
  const meuPerfil = perfil?.perfil
  const mostraAprovadorAcima = meuPerfil === 'solicitante' || meuPerfil === 'aprovador_nivel_0'
  const mostraSubordinados   = meuPerfil === 'aprovador_nivel_0' || meuPerfil === 'aprovador_1'

  useEffect(() => {
    if (!perfil?.id) return
    let cancelado = false
    async function carregar() {
      setLoadingHier(true)
      const promessas = []

      // Aprovador direto (perfil.aprovador_direto_id -> perfis)
      if (mostraAprovadorAcima && perfil.aprovador_direto_id) {
        promessas.push(
          supabase.from('perfis').select('id, nome, perfil').eq('id', perfil.aprovador_direto_id).maybeSingle()
        )
      } else {
        promessas.push(Promise.resolve({ data: null }))
      }

      // Subordinados (perfis onde aprovador_direto_id = perfil.id)
      if (mostraSubordinados) {
        promessas.push(
          supabase.from('perfis').select('id, nome, perfil').eq('aprovador_direto_id', perfil.id).order('nome')
        )
      } else {
        promessas.push(Promise.resolve({ data: [] }))
      }

      const [{ data: ad }, { data: subs }] = await Promise.all(promessas)
      if (cancelado) return
      setAprovadorDireto(ad ?? null)
      setSubordinados(subs ?? [])
      setLoadingHier(false)
    }
    carregar()
    return () => { cancelado = true }
  }, [perfil?.id, perfil?.aprovador_direto_id, mostraAprovadorAcima, mostraSubordinados])

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

  const mostraHierarquia = mostraAprovadorAcima || mostraSubordinados

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

      {/* Hierarquia */}
      {mostraHierarquia && (
        <div className="card p-5 mb-5">
          <p className="text-sm font-medium mb-4" style={{ color: '#1A1614' }}>Hierarquia de aprovação</p>
          {loadingHier ? (
            <div className="text-sm flex items-center gap-2" style={{ color: '#9CA3AF' }}>
              <Loader2 size={14} className="animate-spin" /> Carregando…
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              {mostraAprovadorAcima && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide mb-1.5" style={{ color: '#9CA3AF' }}>
                    <ArrowUp size={12} /> Meu aprovador direto
                  </div>
                  {aprovadorDireto ? (
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: '#F8F9FA' }}>
                      <span style={{ color: '#1A1614' }}>{aprovadorDireto.nome}</span>
                      <span className="text-xs" style={{ color: '#6B7280' }}>{PERFIL_LABEL[aprovadorDireto.perfil] ?? aprovadorDireto.perfil}</span>
                    </div>
                  ) : (
                    <p className="text-xs" style={{ color: '#9CA3AF' }}>Não configurado</p>
                  )}
                </div>
              )}

              {mostraSubordinados && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide mb-1.5" style={{ color: '#9CA3AF' }}>
                    <ArrowDown size={12} /> Quem eu aprovo
                    {subordinados.length > 0 && (
                      <span className="ml-1 font-normal">({subordinados.length})</span>
                    )}
                  </div>
                  {subordinados.length > 0 ? (
                    <div className="space-y-1">
                      {subordinados.map(s => (
                        <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: '#F8F9FA' }}>
                          <span style={{ color: '#1A1614' }}>{s.nome}</span>
                          <span className="text-xs" style={{ color: '#6B7280' }}>{PERFIL_LABEL[s.perfil] ?? s.perfil}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs" style={{ color: '#9CA3AF' }}>Nenhum subordinado configurado</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
