import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Building2, Users, Plus, ChevronRight, X, Loader2, Mail, Briefcase, Check, AlertCircle, Trash2 } from 'lucide-react'

const PERFIS = [
  { value: 'aprovador',   label: 'Aprovador',   desc: 'Aprova demandas e vê valores' },
  { value: 'solicitante', label: 'Solicitante',  desc: 'Abre solicitações de viagem' },
]

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold" style={{ color: '#1A1614' }}>{title}</h2>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ConfirmModal({ title, msg, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm mb-5" style={{ color: '#6B7280' }}>{msg}</p>
      <div className="flex gap-3">
        <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
        <button onClick={onConfirm} className="btn-danger flex-1 justify-center">Confirmar exclusão</button>
      </div>
    </Modal>
  )
}

function NovaEmpresaModal({ onSalvar, onFechar }) {
  const [form, setForm] = useState({ nome: '', cnpj: '' })
  const [salvando, setSalvando] = useState(false)
  async function salvar() {
    if (!form.nome) return
    setSalvando(true)
    const { data, error } = await supabase.from('empresas').insert({ nome: form.nome, cnpj: form.cnpj || null }).select().single()
    setSalvando(false)
    if (!error) onSalvar(data)
  }
  return (
    <Modal title="Nova empresa" onClose={onFechar}>
      <div className="space-y-3">
        <div><label className="label">Nome da empresa *</label>
          <input className="input" placeholder="Ex: Construtora XYZ" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></div>
        <div><label className="label">CNPJ <span className="text-gray-400 font-normal">(opcional)</span></label>
          <input className="input" placeholder="00.000.000/0001-00" value={form.cnpj} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} /></div>
      </div>
      <div className="flex gap-3 mt-5">
        <button onClick={onFechar} className="btn-secondary flex-1">Cancelar</button>
        <button onClick={salvar} disabled={!form.nome || salvando} className="btn-primary flex-1 justify-center">
          {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Criar empresa
        </button>
      </div>
    </Modal>
  )
}

function NovoUsuarioModal({ empresa, onSalvar, onFechar }) {
  const [form, setForm] = useState({ email: '', nome: '', perfil: 'solicitante' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar() {
    if (!form.email || !form.nome) return
    setSalvando(true); setErro('')
    try {
      // Create user with a temp password — they'll reset via email
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: form.email, email_confirm: true,
        user_metadata: { nome: form.nome }
      })
      if (authErr) throw authErr
      const { error: perfilErr } = await supabase.from('perfis').insert({
        id: authData.user.id, empresa_id: empresa.id, nome: form.nome, perfil: form.perfil,
      })
      if (perfilErr) throw perfilErr
      // Send password reset so they can set their own password
      await supabase.auth.resetPasswordForEmail(form.email)
      onSalvar({ ...authData.user, nome: form.nome, perfil: form.perfil })
    } catch (err) { setErro(err.message)
    } finally { setSalvando(false) }
  }

  return (
    <Modal title={`Novo usuário — ${empresa.nome}`} onClose={onFechar}>
      <div className="space-y-3">
        <div><label className="label">Nome completo *</label>
          <input className="input" placeholder="Nome do usuário" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></div>
        <div><label className="label">E-mail *</label>
          <input className="input" type="email" placeholder="email@empresa.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
        <div>
          <label className="label">Perfil *</label>
          <div className="space-y-2 mt-1">
            {PERFIS.map(p => (
              <label key={p.value} className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                style={{ borderColor: form.perfil === p.value ? '#C0186A' : '#E5E7EB', background: form.perfil === p.value ? '#fdf2f8' : 'white' }}>
                <input type="radio" name="perfil" value={p.value} checked={form.perfil === p.value}
                  onChange={() => setForm(f => ({ ...f, perfil: p.value }))} className="mt-0.5" style={{ accentColor: '#C0186A' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: '#1A1614' }}>{p.label}</p>
                  <p className="text-xs" style={{ color: '#6B7280' }}>{p.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
        {erro && <div className="flex gap-2 text-sm p-3 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }}><AlertCircle size={15} className="flex-shrink-0 mt-0.5" />{erro}</div>}
        <div className="p-3 rounded-lg text-xs" style={{ background: '#FEF3C7', color: '#E8820C' }}>
          <Mail size={12} className="inline mr-1" />O usuário receberá um e-mail para definir a senha.
        </div>
      </div>
      <div className="flex gap-3 mt-5">
        <button onClick={onFechar} className="btn-secondary flex-1">Cancelar</button>
        <button onClick={salvar} disabled={!form.email || !form.nome || salvando} className="btn-primary flex-1 justify-center">
          {salvando ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Enviar convite
        </button>
      </div>
    </Modal>
  )
}

function NovoCentroCustoModal({ empresa, onSalvar, onFechar }) {
  const [form, setForm] = useState({ nome: '', codigo: '' })
  const [salvando, setSalvando] = useState(false)
  async function salvar() {
    if (!form.nome) return
    setSalvando(true)
    const { data, error } = await supabase.from('obras').insert({ empresa_id: empresa.id, nome: form.nome, codigo: form.codigo || null, ativo: true }).select().single()
    setSalvando(false)
    if (!error) onSalvar(data)
  }
  return (
    <Modal title={`Centro de custo — ${empresa.nome}`} onClose={onFechar}>
      <div className="space-y-3">
        <div><label className="label">Nome *</label>
          <input className="input" placeholder="Ex: Obra Pirapora / Geral" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></div>
        <div><label className="label">Código <span className="text-gray-400 font-normal">(opcional)</span></label>
          <input className="input" placeholder="Ex: OBR-001" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} /></div>
      </div>
      <div className="flex gap-3 mt-5">
        <button onClick={onFechar} className="btn-secondary flex-1">Cancelar</button>
        <button onClick={salvar} disabled={!form.nome || salvando} className="btn-primary flex-1 justify-center">
          {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Criar
        </button>
      </div>
    </Modal>
  )
}

function EmpresaDetalhe({ empresa, onVoltar, onExcluirEmpresa }) {
  const [usuarios, setUsuarios] = useState([])
  const [centros, setCentros]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [modalUsuario, setModalUsuario] = useState(false)
  const [modalCentro, setModalCentro]   = useState(false)
  const [confirmUser, setConfirmUser]   = useState(null)
  const [confirmCentro, setConfirmCentro] = useState(null)
  const [confirmEmpresa, setConfirmEmpresa] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: u }, { data: c }] = await Promise.all([
        supabase.from('perfis').select('id, nome, perfil, ativo').eq('empresa_id', empresa.id).order('nome'),
        supabase.from('obras').select('id, nome, codigo, ativo').eq('empresa_id', empresa.id).order('nome'),
      ])
      setUsuarios(u ?? []); setCentros(c ?? []); setLoading(false)
    }
    load()
  }, [empresa.id])

  async function excluirUsuario(u) {
    await supabase.from('perfis').delete().eq('id', u.id)
    setUsuarios(prev => prev.filter(x => x.id !== u.id))
    setConfirmUser(null)
  }

  async function excluirCentro(c) {
    await supabase.from('obras').delete().eq('id', c.id)
    setCentros(prev => prev.filter(x => x.id !== c.id))
    setConfirmCentro(null)
  }

  async function excluirEmpresa() {
    await supabase.from('empresas').delete().eq('id', empresa.id)
    setConfirmEmpresa(false)
    onExcluirEmpresa(empresa.id)
  }

  const perfilLabel = { aprovador: 'Aprovador', solicitante: 'Solicitante' }
  const perfilColor = { aprovador: 'bg-amber-100 text-amber-700', solicitante: 'bg-blue-100 text-blue-700' }

  return (
    <div className="p-8 max-w-3xl">
      {modalUsuario && <NovoUsuarioModal empresa={empresa} onFechar={() => setModalUsuario(false)}
        onSalvar={u => { setUsuarios(prev => [...prev, u]); setModalUsuario(false) }} />}
      {modalCentro && <NovoCentroCustoModal empresa={empresa} onFechar={() => setModalCentro(false)}
        onSalvar={c => { setCentros(prev => [...prev, c]); setModalCentro(false) }} />}
      {confirmUser && <ConfirmModal title="Excluir usuário"
        msg={`Tem certeza que deseja excluir ${confirmUser.nome}?`}
        onConfirm={() => excluirUsuario(confirmUser)} onClose={() => setConfirmUser(null)} />}
      {confirmCentro && <ConfirmModal title="Excluir centro de custo"
        msg={`Tem certeza que deseja excluir "${confirmCentro.nome}"?`}
        onConfirm={() => excluirCentro(confirmCentro)} onClose={() => setConfirmCentro(null)} />}
      {confirmEmpresa && <ConfirmModal title="Excluir empresa"
        msg={`Tem certeza que deseja excluir a empresa "${empresa.nome}" e todos os seus dados?`}
        onConfirm={excluirEmpresa} onClose={() => setConfirmEmpresa(false)} />}

      <button onClick={onVoltar} className="text-sm mb-6 flex items-center gap-1" style={{ color: '#6B7280' }}>
        ← Voltar para clientes
      </button>

      <div className="flex items-center justify-between gap-3 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: '#fdf2f8' }}>
            <Building2 size={22} style={{ color: '#C0186A' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#1A1614' }}>{empresa.nome}</h1>
            {empresa.cnpj && <p className="text-sm" style={{ color: '#9CA3AF' }}>CNPJ: {empresa.cnpj}</p>}
          </div>
        </div>
        <button onClick={() => setConfirmEmpresa(true)} className="btn-danger py-1.5 px-3 text-xs flex items-center gap-1">
          <Trash2 size={13} /> Excluir empresa
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Usuários */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#1A1614' }}>
              <Users size={16} /> Usuários <span className="font-normal" style={{ color: '#9CA3AF' }}>({usuarios.length})</span>
            </h2>
            <button onClick={() => setModalUsuario(true)} className="btn-primary py-1 px-2 text-xs"><Plus size={13} /> Convidar</button>
          </div>
          {loading ? <Loader2 size={16} className="animate-spin text-gray-200 mx-auto" /> :
            usuarios.length === 0 ? <p className="text-xs text-center py-4" style={{ color: '#9CA3AF' }}>Nenhum usuário</p> :
            <div className="space-y-2">
              {usuarios.map(u => (
                <div key={u.id} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: '#F3F4F6' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#1A1614' }}>{u.nome}</p>
                    <span className={`badge mt-0.5 ${perfilColor[u.perfil] ?? 'bg-gray-100 text-gray-600'}`}>
                      {perfilLabel[u.perfil] ?? u.perfil}
                    </span>
                  </div>
                  <button onClick={() => setConfirmUser(u)} className="text-gray-300 hover:text-red-400 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          }
        </div>

        {/* Centros de custo */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#1A1614' }}>
              <Briefcase size={16} /> Centros de custo <span className="font-normal" style={{ color: '#9CA3AF' }}>({centros.length})</span>
            </h2>
            <button onClick={() => setModalCentro(true)} className="btn-primary py-1 px-2 text-xs"><Plus size={13} /> Novo</button>
          </div>
          {loading ? <Loader2 size={16} className="animate-spin text-gray-200 mx-auto" /> :
            centros.length === 0 ? <p className="text-xs text-center py-4" style={{ color: '#9CA3AF' }}>Nenhum centro de custo</p> :
            <div className="space-y-2">
              {centros.map(o => (
                <div key={o.id} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: '#F3F4F6' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#1A1614' }}>{o.nome}</p>
                    {o.codigo && <p className="text-xs" style={{ color: '#9CA3AF' }}>{o.codigo}</p>}
                  </div>
                  <button onClick={() => setConfirmCentro(o)} className="text-gray-300 hover:text-red-400 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          }
        </div>
      </div>
    </div>
  )
}

export default function Clientes() {
  const [empresas, setEmpresas]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [modalNova, setModalNova]     = useState(false)
  const [empresaAtiva, setEmpresaAtiva] = useState(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('empresas').select('*').order('nome')
      setEmpresas(data ?? []); setLoading(false)
    }
    load()
  }, [])

  if (empresaAtiva) return (
    <EmpresaDetalhe empresa={empresaAtiva}
      onVoltar={() => setEmpresaAtiva(null)}
      onExcluirEmpresa={id => { setEmpresas(prev => prev.filter(e => e.id !== id)); setEmpresaAtiva(null) }} />
  )

  return (
    <div className="p-8">
      {modalNova && <NovaEmpresaModal onFechar={() => setModalNova(false)}
        onSalvar={e => { setEmpresas(prev => [...prev, e]); setModalNova(false) }} />}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1A1614' }}>Clientes</h1>
          <p className="text-sm mt-1" style={{ color: '#6B7280' }}>{empresas.length} empresa{empresas.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setModalNova(true)} className="btn-primary"><Plus size={16} /> Nova empresa</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-300" /></div>
      ) : empresas.length === 0 ? (
        <div className="card p-16 text-center">
          <Building2 size={32} className="mx-auto mb-3" style={{ color: '#E5E7EB' }} />
          <p className="text-sm" style={{ color: '#9CA3AF' }}>Nenhuma empresa cadastrada</p>
          <button onClick={() => setModalNova(true)} className="btn-primary mt-4"><Plus size={15} /> Cadastrar primeira empresa</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {empresas.map(e => (
            <button key={e.id} onClick={() => setEmpresaAtiva(e)} className="card p-5 text-left hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: '#fdf2f8' }}>
                  <Building2 size={18} style={{ color: '#C0186A' }} />
                </div>
                <ChevronRight size={16} style={{ color: '#D1D5DB' }} className="mt-1" />
              </div>
              <p className="text-sm font-semibold" style={{ color: '#1A1614' }}>{e.nome}</p>
              {e.cnpj && <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>{e.cnpj}</p>}
              <p className="text-xs mt-2" style={{ color: '#9CA3AF' }}>
                Criado em {new Date(e.created_at).toLocaleDateString('pt-BR')}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
