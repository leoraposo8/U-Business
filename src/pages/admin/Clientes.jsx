import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Building2, Users, Plus, ChevronRight, X, Loader2, Mail, Briefcase, Check, AlertCircle, Trash2, Phone, Wallet, Infinity as InfinityIcon, Save, Pencil } from 'lucide-react'

const PERFIS = [
  { value: 'aprovador_2', label: 'Aprovador nível 2', desc: 'Aprova qualquer valor; escopo da empresa toda' },
  { value: 'aprovador_1', label: 'Aprovador nível 1', desc: 'Alçada configurável por tipo; vinculado a centros de custo' },
  { value: 'solicitante', label: 'Solicitante',       desc: 'Abre solicitações de viagem' },
]

const TIPOS_ITEM = [
  { value: 'aereo',       label: 'Passagem aérea',      unidade: 'por emissão' },
  { value: 'rodoviario',  label: 'Passagem rodoviária', unidade: 'por emissão' },
  { value: 'hospedagem',  label: 'Hospedagem',          unidade: 'por noite'   },
]

// aprovador_1 → { aereo: { ilimitado, valor }, rodoviario: {...}, hospedagem: {...} }
const LIMITES_INICIAIS = Object.fromEntries(
  TIPOS_ITEM.map(t => [t.value, { ilimitado: false, valor: '' }])
)

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-auto max-h-[calc(100vh-2rem)] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-6 pb-3 flex-shrink-0">
          <h2 className="text-lg font-semibold" style={{ color: '#1A1614' }}>{title}</h2>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="px-6 pb-6 overflow-y-auto">
          {children}
        </div>
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

// Modal unificado de usuário — cria (via convite) ou edita.
// mode='create': envia POST /api/convidar-usuario (cria user no Auth + insere perfis + limites + obras)
// mode='edit'  : envia POST /api/atualizar-usuario (atualiza perfis + sincroniza limites/obras).
//                Ao abrir em edit + aprovador_1, faz fetch das linhas atuais.
function UsuarioModal({ mode, empresa, obras, usuario, onSalvar, onFechar }) {
  const isEdit = mode === 'edit'
  const [form, setForm] = useState(() => ({
    email:    isEdit ? (usuario?.email ?? '')    : '',
    nome:     isEdit ? (usuario?.nome ?? '')     : '',
    telefone: isEdit ? (usuario?.telefone ?? '') : '',
    perfil:   isEdit ? (usuario?.perfil ?? 'solicitante') : 'solicitante',
  }))
  const [limites, setLimites]   = useState(LIMITES_INICIAIS)
  const [obrasSel, setObrasSel] = useState(() => new Set())
  const [carregando, setCarregando] = useState(isEdit && usuario?.perfil === 'aprovador_1')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro]         = useState('')

  const isAprovador1 = form.perfil === 'aprovador_1'
  const obrasAtivas  = obras.filter(o => o.ativo !== false)

  // Em edit + aprovador_1, busca limites e obras atuais pra pré-preencher.
  useEffect(() => {
    if (!isEdit || usuario?.perfil !== 'aprovador_1') return
    let cancelou = false
    async function carregar() {
      const [{ data: lim }, { data: obr }] = await Promise.all([
        supabase.from('aprovador_limites').select('tipo_item, valor_limite').eq('usuario_id', usuario.id),
        supabase.from('aprovador_obras').select('obra_id').eq('usuario_id', usuario.id),
      ])
      if (cancelou) return
      // Mapeia linhas do DB de volta ao shape do form.
      const seed = { ...LIMITES_INICIAIS }
      for (const row of lim ?? []) {
        seed[row.tipo_item] = row.valor_limite === null
          ? { ilimitado: true, valor: '' }
          : { ilimitado: false, valor: String(row.valor_limite) }
      }
      setLimites(seed)
      setObrasSel(new Set((obr ?? []).map(o => o.obra_id)))
      setCarregando(false)
    }
    carregar()
    return () => { cancelou = true }
  }, [isEdit, usuario?.id, usuario?.perfil])

  function setLimite(tipo, patch) {
    setLimites(prev => ({ ...prev, [tipo]: { ...prev[tipo], ...patch } }))
  }
  function toggleObra(id) {
    setObrasSel(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Validação
  const limitesValidos = TIPOS_ITEM.every(t => {
    const l = limites[t.value]
    return l.ilimitado || (l.valor !== '' && Number(l.valor) >= 0)
  })
  const podeSalvar = (isEdit || form.email) && form.nome && form.telefone &&
    (!isAprovador1 || (limitesValidos && obrasSel.size > 0)) && !carregando

  async function salvar() {
    if (!podeSalvar) return
    setSalvando(true); setErro('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessao expirada. Faca login novamente.')

      const body = {
        nome:     form.nome,
        telefone: form.telefone,
        perfil:   form.perfil,
      }
      if (isEdit) {
        body.user_id = usuario.id
      } else {
        body.email      = form.email
        body.empresa_id = empresa.id
      }
      if (isAprovador1) {
        body.limites = TIPOS_ITEM.map(t => ({
          tipo_item:    t.value,
          valor_limite: limites[t.value].ilimitado ? null : Number(limites[t.value].valor),
        }))
        body.obras = Array.from(obrasSel)
      }

      const url = isEdit ? '/api/atualizar-usuario' : '/api/convidar-usuario'
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.detail || `Erro ${res.status}`)
      onSalvar({
        id: isEdit ? usuario.id : j.user_id,
        email: isEdit ? usuario.email : form.email,
        nome: form.nome, telefone: form.telefone, perfil: form.perfil,
      })
    } catch (err) { setErro(err.message)
    } finally { setSalvando(false) }
  }

  const titulo = isEdit
    ? `Editar usuário — ${usuario?.nome ?? ''}`
    : `Novo usuário — ${empresa.nome}`

  return (
    <Modal title={titulo} onClose={onFechar}>
      <div className="space-y-3">
        <div><label className="label">Nome completo *</label>
          <input className="input" placeholder="Nome do usuário" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></div>
        {!isEdit && (
          <div><label className="label">E-mail *</label>
            <input className="input" type="email" placeholder="email@empresa.com" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
        )}
        <div><label className="label">Telefone (WhatsApp) *</label>
          <input className="input" type="tel" placeholder="(11) 99999-9999" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} /></div>
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

        {isAprovador1 && (
          <div className="space-y-3 pt-2 border-t" style={{ borderColor: '#F3F4F6' }}>
            <div>
              <label className="label flex items-center gap-1.5"><Wallet size={13} /> Alçadas de aprovação *</label>
              <p className="text-xs mb-2" style={{ color: '#9CA3AF' }}>Acima do teto, a demanda sobe pro Aprovador nível 2.</p>
              <div className="space-y-2">
                {TIPOS_ITEM.map(t => {
                  const l = limites[t.value]
                  return (
                    <div key={t.value} className="flex items-center gap-2 p-2 rounded-lg border" style={{ borderColor: '#E5E7EB' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium" style={{ color: '#1A1614' }}>{t.label}</p>
                        <p className="text-[10px]" style={{ color: '#9CA3AF' }}>{t.unidade}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs" style={{ color: '#6B7280' }}>R$</span>
                        <input
                          type="number" min="0" step="0.01" placeholder="0,00"
                          disabled={l.ilimitado}
                          value={l.ilimitado ? '' : l.valor}
                          onChange={e => setLimite(t.value, { valor: e.target.value })}
                          className="input py-1 px-2 text-xs w-24 text-right"
                          style={{ background: l.ilimitado ? '#F9FAFB' : 'white' }}
                        />
                      </div>
                      <label className="flex items-center gap-1 cursor-pointer text-xs" style={{ color: '#6B7280' }}>
                        <input type="checkbox" checked={l.ilimitado}
                          onChange={e => setLimite(t.value, { ilimitado: e.target.checked, valor: e.target.checked ? '' : l.valor })}
                          style={{ accentColor: '#C0186A' }} />
                        <InfinityIcon size={13} /> ilimitado
                      </label>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="label flex items-center gap-1.5"><Briefcase size={13} /> Centros de custo *</label>
              <p className="text-xs mb-2" style={{ color: '#9CA3AF' }}>Selecione quais centros este aprovador cobre.</p>
              {obrasAtivas.length === 0 ? (
                <div className="flex gap-2 text-xs p-2 rounded-lg" style={{ background: '#FEF3C7', color: '#E8820C' }}>
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                  Nenhum centro de custo cadastrado. Crie um antes de vincular.
                </div>
              ) : (
                <div className="space-y-1 max-h-36 overflow-y-auto p-2 rounded-lg border" style={{ borderColor: '#E5E7EB' }}>
                  {obrasAtivas.map(o => (
                    <label key={o.id} className="flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked={obrasSel.has(o.id)}
                        onChange={() => toggleObra(o.id)} style={{ accentColor: '#C0186A' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: '#1A1614' }}>{o.nome}</p>
                        {o.codigo && <p className="text-[10px]" style={{ color: '#9CA3AF' }}>{o.codigo}</p>}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {erro && <div className="flex gap-2 text-sm p-3 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }}><AlertCircle size={15} className="flex-shrink-0 mt-0.5" />{erro}</div>}
        {!isEdit && (
          <div className="p-3 rounded-lg text-xs" style={{ background: '#FEF3C7', color: '#E8820C' }}>
            <Mail size={12} className="inline mr-1" />O usuário receberá um e-mail para definir a senha.
          </div>
        )}
        {carregando && (
          <div className="flex items-center gap-2 text-xs p-2" style={{ color: '#6B7280' }}>
            <Loader2 size={13} className="animate-spin" /> Carregando alçadas e centros de custo…
          </div>
        )}
      </div>
      <div className="flex gap-3 mt-5">
        <button onClick={onFechar} className="btn-secondary flex-1">Cancelar</button>
        <button onClick={salvar} disabled={!podeSalvar || salvando} className="btn-primary flex-1 justify-center">
          {salvando
            ? <Loader2 size={14} className="animate-spin" />
            : isEdit ? <Save size={14} /> : <Mail size={14} />
          } {isEdit ? 'Salvar alterações' : 'Enviar convite'}
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
  const [usuarioEdit, setUsuarioEdit]   = useState(null)
  const [modalCentro, setModalCentro]   = useState(false)
  const [confirmUser, setConfirmUser]   = useState(null)
  const [confirmCentro, setConfirmCentro] = useState(null)
  const [confirmEmpresa, setConfirmEmpresa] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: u }, { data: c }] = await Promise.all([
        supabase.from('perfis').select('id, nome, telefone, perfil, ativo').eq('empresa_id', empresa.id).order('nome'),
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

  const perfilLabel = {
    aprovador_1: 'Aprovador N1',
    aprovador_2: 'Aprovador N2',
    solicitante: 'Solicitante',
  }
  const perfilColor = {
    aprovador_1: 'bg-amber-100 text-amber-700',
    aprovador_2: 'bg-orange-100 text-orange-700',
    solicitante: 'bg-blue-100 text-blue-700',
  }

  return (
    <div className="p-8 max-w-3xl">
      {modalUsuario && <UsuarioModal mode="create" empresa={empresa} obras={centros} onFechar={() => setModalUsuario(false)}
        onSalvar={u => { setUsuarios(prev => [...prev, u]); setModalUsuario(false) }} />}
      {usuarioEdit && <UsuarioModal mode="edit" empresa={empresa} obras={centros} usuario={usuarioEdit}
        onFechar={() => setUsuarioEdit(null)}
        onSalvar={u => {
          setUsuarios(prev => prev.map(x => x.id === u.id ? { ...x, ...u } : x))
          setUsuarioEdit(null)
        }} />}
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
                <div key={u.id} className="group flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: '#F3F4F6' }}>
                  <button onClick={() => setUsuarioEdit(u)}
                    className="flex-1 min-w-0 text-left cursor-pointer hover:opacity-80 transition-opacity">
                    <p className="text-sm font-medium truncate" style={{ color: '#1A1614' }}>{u.nome}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`badge ${perfilColor[u.perfil] ?? 'bg-gray-100 text-gray-600'}`}>
                        {perfilLabel[u.perfil] ?? u.perfil}
                      </span>
                      {u.telefone && (
                        <span className="flex items-center gap-1 text-[11px]" style={{ color: '#9CA3AF' }}>
                          <Phone size={10} /> {u.telefone}
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setUsuarioEdit(u)}
                      className="text-gray-300 hover:text-brand-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Editar">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmUser(u)} className="text-gray-300 hover:text-red-400 p-1" title="Excluir">
                      <Trash2 size={14} />
                    </button>
                  </div>
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
