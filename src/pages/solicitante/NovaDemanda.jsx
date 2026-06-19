import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import {
  Plane, Bus, Hotel, Package, Headphones,
  Loader2, ChevronLeft, Send, X, Search, UserPlus, Calendar, Minus, Plus
} from 'lucide-react'

const TIPOS = [
  { key: 'aereo',      label: 'Aéreo',      icon: Plane,      desc: 'Voo nacional' },
  { key: 'rodoviario', label: 'Rodoviário',  icon: Bus,        desc: 'Ônibus' },
  { key: 'hospedagem', label: 'Hospedagem',  icon: Hotel,      desc: 'Hotel / pousada' },
  { key: 'pacote',     label: 'Pacote',      icon: Package,    desc: 'Combinação' },
  { key: 'posvenda',   label: 'Pós-venda',   icon: Headphones, desc: 'Remarcação, reembolso...' },
]

const TIPO_QUARTO = [
  { value: 'individual', label: 'Individual' },
  { value: 'duplo',      label: 'Duplo' },
  { value: 'triplo',     label: 'Triplo' },
]

const POSVENDA_TIPOS = [
  { value: 'bagagem',    label: 'Inclusão de bagagem' },
  { value: 'remarcacao', label: 'Remarcação' },
  { value: 'reembolso',  label: 'Cálculo de reembolso' },
  { value: 'assento',    label: 'Compra de assento' },
  { value: 'outros',     label: 'Outros' },
]

function ToggleSwitch({ on, onToggle, label }) {
  return (
    <button type="button" onClick={onToggle}
      className="flex items-center gap-2 text-sm font-medium"
      style={{ color: on ? '#C0186A' : '#6B7280' }}>
      <div className="w-9 h-5 rounded-full relative transition-colors"
        style={{ backgroundColor: on ? '#C0186A' : '#D1D5DB' }}>
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      {label}
    </button>
  )
}


// Returns today's date in Brazil timezone as YYYY-MM-DD for min date validation
function hojeISO() {
  return new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).split('/').reverse().join('-')
}

function NovoPassageiroModal({ onSalvar, onFechar }) {
  const [form, setForm] = useState({ nome: '', sobrenome: '', cpf: '', nascimento: '', contato: '' })
  function set(f, v) { setForm(p => ({ ...p, [f]: v })) }
  const valido = form.nome && form.sobrenome && form.cpf && form.nascimento
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold" style={{ color: '#1A1614' }}>Novo passageiro</h2>
          <button onClick={onFechar}><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Nome *</label>
              <input className="input" placeholder="Nome" value={form.nome} onChange={e => set('nome', e.target.value)} /></div>
            <div><label className="label">Sobrenome *</label>
              <input className="input" placeholder="Sobrenome" value={form.sobrenome} onChange={e => set('sobrenome', e.target.value)} /></div>
          </div>
          <div><label className="label">CPF *</label>
            <input className="input" placeholder="000.000.000-00" value={form.cpf} onChange={e => set('cpf', e.target.value)} /></div>
          <div><label className="label">Data de nascimento *</label>
            <input type="date" className="input" value={form.nascimento} onChange={e => set('nascimento', e.target.value)} /></div>
          <div><label className="label">Celular <span className="text-gray-400 font-normal">(opcional)</span></label>
            <input className="input" placeholder="+55 (11) 99999-9999" value={form.contato} onChange={e => set('contato', e.target.value)} /></div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onFechar} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={() => valido && onSalvar(form)}
            disabled={!valido} className="btn-primary flex-1 justify-center">Adicionar</button>
        </div>
      </div>
    </div>
  )
}

function SeletorPassageiros({ passageiros, selecionados, onChange, qtd, perfil }) {
  const [busca, setBusca] = useState('')
  const [mostrarModal, setMostrarModal] = useState(false)
  const [todosPassageiros, setTodosPassageiros] = useState(passageiros)
  useEffect(() => { setTodosPassageiros(passageiros) }, [passageiros])

  const filtrados = todosPassageiros.filter(p =>
    !busca || `${p.nome} ${p.sobrenome ?? ''}`.toLowerCase().includes(busca.toLowerCase())
  )
  const isSelected = (id) => selecionados.some(s => s.id === id)
  function toggle(p) {
    if (isSelected(p.id)) onChange(selecionados.filter(s => s.id !== p.id))
    else if (selecionados.length < qtd) onChange([...selecionados, p])
  }
  async function salvarNovo(form) {
    const { data } = await supabase.from('passageiros').insert({
      empresa_id: perfil.empresa_id,
      nome: form.nome.toUpperCase(), sobrenome: form.sobrenome.toUpperCase(),
      cpf: form.cpf || null, contato: form.contato || null,
    }).select().single()
    if (data && selecionados.length < qtd) {
      setTodosPassageiros(prev => [...prev, data])
      onChange([...selecionados, data])
    }
    setMostrarModal(false)
  }

  const falta = qtd - selecionados.length

  return (
    <div>
      {mostrarModal && <NovoPassageiroModal onSalvar={salvarNovo} onFechar={() => setMostrarModal(false)} />}

      {/* Chips dos selecionados */}
      {selecionados.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selecionados.map(p => (
            <span key={p.id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium"
              style={{ background: '#fdf2f8', border: '1px solid #f9c0d8', color: '#C0186A' }}>
              {p.nome} {p.sobrenome}
              <button onClick={() => toggle(p)}><X size={13} /></button>
            </span>
          ))}
        </div>
      )}

      {/* Aviso de quantos faltam */}
      {falta > 0 && (
        <p className="text-xs mb-2" style={{ color: '#E8820C' }}>
          Adicione mais {falta} passageiro{falta > 1 ? 's' : ''}
        </p>
      )}

      {/* Busca */}
      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input pl-8 text-sm" placeholder="Buscar passageiro na lista..."
          value={busca} onChange={e => setBusca(e.target.value)} />
      </div>

      {busca && (
        <div className="border rounded-xl overflow-hidden mb-2 max-h-48 overflow-y-auto shadow-sm"
          style={{ borderColor: '#E5E7EB' }}>
          {filtrados.length === 0
            ? <p className="text-sm text-gray-400 p-3 text-center">Nenhum resultado</p>
            : filtrados.slice(0, 8).map(p => (
              <button key={p.id} type="button"
                onClick={() => { toggle(p); setBusca('') }}
                disabled={!isSelected(p.id) && selecionados.length >= qtd}
                className="w-full text-left px-4 py-2.5 text-sm flex items-center justify-between hover:bg-gray-50 disabled:opacity-40"
                style={{ color: isSelected(p.id) ? '#C0186A' : '#1A1614', background: isSelected(p.id) ? '#fdf2f8' : 'white' }}>
                <span>{p.nome} {p.sobrenome}</span>
                {isSelected(p.id) && <span className="text-xs" style={{ color: '#C0186A' }}>✓</span>}
              </button>
            ))
          }
        </div>
      )}

      <button type="button" onClick={() => setMostrarModal(true)}
        className="flex items-center gap-2 text-sm font-medium mt-1" style={{ color: '#C0186A' }}>
        <UserPlus size={15} /> Cadastrar novo passageiro
      </button>
    </div>
  )
}

function CampoViagem({ form, set, tipo }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Origem *</label>
          <input className="input" placeholder="Ex: Governador Valadares, MG"
            value={form.origem} onChange={e => set('origem', e.target.value)} /></div>
        <div><label className="label">Destino *</label>
          <input className="input" placeholder="Ex: São Paulo, SP"
            value={form.destino} onChange={e => set('destino', e.target.value)} /></div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Data de ida *</label>
          <ToggleSwitch on={form.ida_flexivel} onToggle={() => set('ida_flexivel', !form.ida_flexivel)} label="Data flexível" />
        </div>
        {form.ida_flexivel ? (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label text-xs text-gray-400">A partir de</label>
              <input type="date" className="input" value={form.data_ida_min} onChange={e => set('data_ida_min', e.target.value)} /></div>
            <div><label className="label text-xs text-gray-400">Até</label>
              <input type="date" className="input" value={form.data_ida_max} onChange={e => set('data_ida_max', e.target.value)} /></div>
          </div>
        ) : (
          <input type="date" className="input" min={hojeISO()} value={form.data_ida} onChange={e => set('data_ida', e.target.value)} />
        )}
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Data de volta <span className="text-gray-400 font-normal">(opcional)</span></label>
          <ToggleSwitch on={form.volta_flexivel} onToggle={() => set('volta_flexivel', !form.volta_flexivel)} label="Data flexível" />
        </div>
        {form.volta_flexivel ? (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label text-xs text-gray-400">A partir de</label>
              <input type="date" className="input" value={form.data_volta_min} onChange={e => set('data_volta_min', e.target.value)} /></div>
            <div><label className="label text-xs text-gray-400">Até</label>
              <input type="date" className="input" value={form.data_volta_max} onChange={e => set('data_volta_max', e.target.value)} /></div>
          </div>
        ) : (
          <input type="date" className="input" min={form.data_ida || hojeISO()} value={form.data_volta} onChange={e => set('data_volta', e.target.value)} />
        )}
      </div>
      {tipo === 'aereo' && (
        <div className="flex items-center gap-3 p-4 rounded-xl border" style={{ background: '#F8F9FA', borderColor: '#E5E7EB' }}>
          <input type="checkbox" id="bagagem" checked={form.bagagem} onChange={e => set('bagagem', e.target.checked)}
            className="w-4 h-4 cursor-pointer" style={{ accentColor: '#C0186A' }} />
          <label htmlFor="bagagem" className="text-sm font-medium cursor-pointer select-none" style={{ color: '#1A1614' }}>
            Bagagem despachada
          </label>
          <span className="text-xs text-gray-400 ml-auto">Desmarcado por padrão</span>
        </div>
      )}
    </>
  )
}

function CampoHospedagem({ form, set, maxHospedes }) {
  const quartos = form.quartos_lista ?? [{ tipo: 'individual', hospedes: 1, nomes: [] }]

  function setQuartos(lista) { set('quartos_lista', lista) }
  function addQuarto() { setQuartos([...quartos, { tipo: 'individual', hospedes: 1, nomes: [] }]) }
  function removeQuarto(i) { if (quartos.length > 1) setQuartos(quartos.filter((_, idx) => idx !== i)) }
  function setQuarto(i, field, val) {
    setQuartos(quartos.map((q, idx) => idx === i ? { ...q, [field]: val } : q))
  }

  return (
    <>
      {/* 1. Quartos primeiro */}
      <div>
        <label className="label">Nº de quartos *</label>
        <div className="flex items-center gap-3 mb-3">
          <button type="button" onClick={() => removeQuarto(quartos.length - 1)}
            className="w-9 h-9 rounded-lg border flex items-center justify-center"
            style={{ borderColor: '#E5E7EB', color: '#6B7280' }}>
            <Minus size={16} />
          </button>
          <span className="text-2xl font-bold w-8 text-center" style={{ color: '#1A1614' }}>{quartos.length}</span>
          <button type="button" onClick={addQuarto}
            className="w-9 h-9 rounded-lg border flex items-center justify-center"
            style={{ borderColor: '#E5E7EB', color: '#6B7280' }}>
            <Plus size={16} />
          </button>
        </div>

        {/* Um card por quarto */}
        <div className="space-y-3">
          {quartos.map((q, i) => (
            <div key={i} className="p-4 rounded-xl border space-y-3" style={{ borderColor: '#E5E7EB', background: '#F8F9FA' }}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold" style={{ color: '#1A1614' }}>Quarto {i + 1}</p>
                {quartos.length > 1 && (
                  <button type="button" onClick={() => removeQuarto(i)} className="text-gray-300 hover:text-red-400">
                    <X size={15} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-4">
                <select className="input flex-1" value={q.tipo} onChange={e => setQuarto(i, 'tipo', e.target.value)}>
                  {TIPO_QUARTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button type="button" onClick={() => setQuarto(i, 'hospedes', Math.max(1, q.hospedes - 1))}
                    className="w-7 h-7 rounded-full border flex items-center justify-center text-sm"
                    style={{ borderColor: '#E5E7EB', color: '#6B7280' }}>−</button>
                  <span className="text-sm font-medium w-6 text-center" style={{ color: '#1A1614' }}>{q.hospedes}</span>
                  <button type="button"
                    onClick={() => setQuarto(i, 'hospedes', Math.min(maxHospedes || 99, q.hospedes + 1))}
                    disabled={maxHospedes && q.hospedes >= maxHospedes}
                    className="w-7 h-7 rounded-full border flex items-center justify-center text-sm disabled:opacity-30"
                    style={{ borderColor: '#E5E7EB', color: '#6B7280' }}>+</button>
                  <span className="text-xs" style={{ color: '#9CA3AF' }}>hósp.</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addQuarto}
          className="mt-2 flex items-center gap-2 text-sm font-medium" style={{ color: '#C0186A' }}>
          <Plus size={14} /> Adicionar outro quarto
        </button>
      </div>

      {/* 2. Cidade e datas */}
      <div><label className="label">Cidade *</label>
        <input className="input" placeholder="Ex: São Paulo, SP" value={form.cidade} onChange={e => set('cidade', e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Check-in *</label>
          <input type="date" className="input" value={form.checkin} onChange={e => set('checkin', e.target.value)} /></div>
        <div><label className="label">Check-out *</label>
          <input type="date" className="input"
            min={form.checkin ? new Date(new Date(form.checkin+'T12:00:00').getTime()+86400000).toISOString().split('T')[0] : hojeISO()}
            value={form.checkout} onChange={e => set('checkout', e.target.value)} /></div>
      </div>

      <div className="flex items-center justify-between p-4 rounded-xl border" style={{ background: '#F8F9FA', borderColor: '#E5E7EB' }}>
        <div>
          <p className="text-sm font-medium" style={{ color: '#1A1614' }}>Café da manhã incluso</p>
          <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>Ligado por padrão</p>
        </div>
        <ToggleSwitch
          on={form.cafe_manha !== false}
          onToggle={() => set('cafe_manha', form.cafe_manha === false ? true : false)}
          label="" />
      </div>
    </>
  )
}

export default function NovaDemanda() {
  const { perfil } = useAuth()
  const navigate = useNavigate()

  const [tipo, setTipo] = useState('')
  const [empresaIdSel, setEmpresaIdSel] = useState('')
  const [empresas, setEmpresas] = useState([])
  const [passageiros, setPassageiros] = useState([])
  const [obras, setObras] = useState([])
  const [qtdPax, setQtdPax] = useState(1)
  const [selecionados, setSelecionados] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [pacoteTipos, setPacoteTipos] = useState({ aereo: false, rodoviario: false, hospedagem: false })
  // Arrays de cards por tipo no pacote
  const [pacoteAereos, setPacoteAereos] = useState([{ origem:'', destino:'', data_ida:'', data_volta:'', bagagem:false, ida_flexivel:false, data_ida_min:'', data_ida_max:'', volta_flexivel:false, data_volta_min:'', data_volta_max:'' }])
  const [pacoteRodos, setPacoteRodos]   = useState([{ origem:'', destino:'', data_ida:'', data_volta:'' }])
  const [pacoteHoteis, setPacoteHoteis] = useState([{ cidade:'', checkin:'', checkout:'', quartos_lista:[{tipo:'individual',hospedes:1}], cafe_manha:true }])

  const [form, setForm] = useState({
    obra_id: '',
    origem: '', destino: '', data_ida: '', data_volta: '', bagagem: false,
    ida_flexivel: false, volta_flexivel: false,
    data_ida_min: '', data_ida_max: '', data_volta_min: '', data_volta_max: '',
    cidade: '', checkin: '', checkout: '', quartos: 1, tipo_quarto: 'individual',
    rodo_origem: '', rodo_destino: '', rodo_data_ida: '', rodo_data_volta: '',
    remark_flexivel: false, nova_data_min: '', nova_data_max: '',
    posvenda_tipo: '', localizador_ref: '', nova_data: '', nova_rota: '',
    observacoes: '',
  })
  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  useEffect(() => {
    async function load() {
      const empresaId = perfil.empresa_id || empresaIdSel
      let qPass = supabase.from('passageiros').select('id, nome, sobrenome, cpf').order('nome')
      let qObra = supabase.from('obras').select('id, nome, codigo').eq('ativo', true).order('nome')
      if (empresaId) {
        qPass = qPass.eq('empresa_id', empresaId)
        qObra = qObra.eq('empresa_id', empresaId)
      }
      const [{ data: pass }, { data: obr }] = await Promise.all([qPass, qObra])
      setPassageiros(pass ?? [])
      setObras(obr ?? [])

      // Load empresas for admin_agencia
      if (!perfil.empresa_id) {
        const { data: emps } = await supabase.from('empresas').select('id, nome').order('nome')
        setEmpresas(emps ?? [])
      }
    }
    if (perfil) load()
  }, [perfil])

  // Reset selecionados when qtd drops below current selection
  useEffect(() => {
    if (selecionados.length > qtdPax) setSelecionados(selecionados.slice(0, qtdPax))
  }, [qtdPax])

  // Reload passageiros/obras when empresa changes (admin_agencia)
  useEffect(() => {
    if (!perfil?.empresa_id && empresaIdSel) {
      supabase.from('passageiros').select('id, nome, sobrenome, cpf').eq('empresa_id', empresaIdSel).order('nome').then(({ data }) => setPassageiros(data ?? []))
      supabase.from('obras').select('id, nome, codigo').eq('empresa_id', empresaIdSel).eq('ativo', true).order('nome').then(({ data }) => setObras(data ?? []))
      setSelecionados([])
    }
  }, [empresaIdSel])

  // Reset tipo-specific state when tipo changes
  useEffect(() => {
    setSelecionados([])
    setQtdPax(1)
  }, [tipo])

  function buildObservacoes() {
    const partes = []
    if (form.ida_flexivel) partes.push(`Ida flexível: ${form.data_ida_min} a ${form.data_ida_max}`)
    if (form.volta_flexivel) partes.push(`Volta flexível: ${form.data_volta_min} a ${form.data_volta_max}`)
    if (form.observacoes) partes.push(form.observacoes)
    return partes.join(' · ') || null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSalvando(true)
    try {
      const empresaFinal = perfil.empresa_id || empresaIdSel
      const base = {
        empresa_id: empresaFinal,
        solicitante_id: perfil.id,
        status: 'aguardando_opcoes',
        obra_id: form.obra_id || null,
      }

      let demandas = []

      if (tipo === 'pacote') {
        if (selecionados.length === 0) { alert('Adicione pelo menos um passageiro.'); setSalvando(false); return }
        const pacoteId = crypto.randomUUID()
        const paxList = selecionados

        // One demanda per service card (not per pax — all pax share the same demanda)
        const paxPrincipal = selecionados[0]?.id || null
        if (pacoteTipos.aereo) {
          pacoteAereos.forEach(pa => {
            demandas.push({ ...base, tipo: 'aereo', passageiro_id: paxPrincipal, pacote_id: pacoteId,
              origem: pa.origem, destino: pa.destino, data_ida: pa.data_ida || null, data_volta: pa.data_volta || null, bagagem: pa.bagagem })
          })
        }
        if (pacoteTipos.rodoviario) {
          pacoteRodos.forEach(pr => {
            demandas.push({ ...base, tipo: 'rodoviario', passageiro_id: paxPrincipal, pacote_id: pacoteId,
              origem: pr.origem, destino: pr.destino, data_ida: pr.data_ida || null, data_volta: pr.data_volta || null })
          })
        }
        if (pacoteTipos.hospedagem) {
          pacoteHoteis.forEach(ph => {
            const ql = ph.quartos_lista ?? [{ tipo: 'individual', hospedes: 1 }]
            const quartoDesc = ql.map((q,i)=>`Q${i+1}: ${q.tipo}, ${q.hospedes} hósp.`).join(' | ')
            const cafe = ph.cafe_manha !== false ? 'Com café da manhã' : 'Sem café da manhã'
            demandas.push({ ...base, tipo: 'hospedagem', passageiro_id: paxPrincipal, pacote_id: pacoteId,
              cidade: ph.cidade, checkin: ph.checkin, checkout: ph.checkout,
              observacoes: [quartoDesc, cafe].join(' · ') })
          })
        }
      } else if (tipo === 'posvenda') {
        const dataInfo = form.posvenda_tipo === 'remarcacao'
          ? (form.remark_flexivel
              ? `Data flexível: ${form.nova_data_min} a ${form.nova_data_max}`
              : form.nova_data ? `Nova data: ${form.nova_data}` : '')
          : ''
        const obs = [
          form.posvenda_tipo.toUpperCase(),
          `Localizador: ${form.localizador_ref}`,
          dataInfo,
          form.nova_rota ? `Nova rota: ${form.nova_rota}` : '',
          form.observacoes,
        ].filter(Boolean).join(' | ')
        demandas = [{
          ...base, tipo: 'posvenda',
          passageiro_id: selecionados[0]?.id || null,
          observacoes: obs,
        }]
      } else if (tipo === 'hospedagem') {
        const ql = form.quartos_lista ?? [{ tipo: 'individual', hospedes: 1 }]
        const quartoDesc = ql.map((q, i) => `Quarto ${i+1}: ${q.tipo}, ${q.hospedes} hósp.`).join(' | ')
        const cafe = form.cafe_manha !== false ? 'Com café da manhã' : 'Sem café da manhã'
        const obs = [quartoDesc, cafe, buildObservacoes()].filter(Boolean).join(' · ')
        // Uma demanda só, passageiro principal = primeiro selecionado
        demandas = [{
          ...base, tipo,
          passageiro_id: selecionados[0]?.id || null,
          cidade: form.cidade, checkin: form.checkin, checkout: form.checkout,
          observacoes: obs,
        }]
      } else {
        // Uma demanda só, passageiro principal = primeiro selecionado
        demandas = [{
          ...base, tipo,
          passageiro_id: selecionados[0]?.id || null,
          origem: form.origem, destino: form.destino,
          data_ida: form.data_ida || null, data_volta: form.data_volta || null,
          bagagem: tipo === 'aereo' ? form.bagagem : false,
          observacoes: buildObservacoes(),
        }]
      }

      const { data: criadas, error } = await supabase.from('demandas').insert(demandas).select()
      if (error) throw error

      // Registra todos os passageiros em cada demanda
      if (selecionados.length > 0) {
        const paxRels = criadas.flatMap(d =>
          selecionados.map(p => ({ demanda_id: d.id, passageiro_id: p.id }))
        )
        await supabase.from('demanda_passageiros').insert(paxRels)
      }

      await supabase.from('demanda_historico').insert(
        criadas.map(d => ({ demanda_id: d.id, status_anterior: null, status_novo: 'aguardando_opcoes', usuario_id: perfil.id }))
      )
      navigate('/app/demandas')
    } catch (err) {
      alert('Erro ao salvar: ' + err.message)
    } finally { setSalvando(false) }
  }

  const isViagem = tipo === 'aereo' || tipo === 'rodoviario'
  const needsPax = tipo !== 'posvenda' && tipo !== ''
  const paxOk = tipo === 'posvenda' ? true : selecionados.length === qtdPax

  const canSubmit = (() => {
    if (!perfil?.empresa_id && !empresaIdSel) return false
    if (!tipo) return false
    if (tipo === 'posvenda') return !!form.localizador_ref && !!form.posvenda_tipo
    if (tipo === 'hospedagem') return paxOk && !!(form.cidade && form.checkin && form.checkout)
    if (tipo === 'pacote') return selecionados.length > 0 && Object.values(pacoteTipos).some(Boolean)
    return paxOk && !!(form.origem && form.destino && (form.data_ida || form.ida_flexivel))
  })()

  const pacoteTemViagem = pacoteTipos.aereo || pacoteTipos.rodoviario
  const pacoteTemHotel = pacoteTipos.hospedagem

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(-1)} className="btn-secondary px-2"><ChevronLeft size={16} /></button>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1A1614' }}>Nova solicitação</h1>
          <p className="text-sm" style={{ color: '#6B7280' }}>Preencha os dados da viagem</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Empresa — obrigatório para admin_agência */}
        {!perfil?.empresa_id && (
          <div>
            <label className="label">Empresa *</label>
            <select className="input" value={empresaIdSel} onChange={e => setEmpresaIdSel(e.target.value)} required>
              <option value="">Selecione a empresa</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
            {!empresaIdSel && (
              <p className="text-xs mt-1" style={{ color: '#E8820C' }}>⚠️ Selecione a empresa antes de continuar</p>
            )}
          </div>
        )}

        {/* Tipo */}
        <div>
          <label className="label">Tipo de serviço *</label>
          <div className="grid grid-cols-5 gap-2">
            {TIPOS.map(t => (
              <button key={t.key} type="button"
                disabled={!perfil?.empresa_id && !empresaIdSel}
                onClick={() => (!perfil?.empresa_id && !empresaIdSel) ? null : setTipo(t.key)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all"
                style={{
                  borderColor: tipo === t.key ? '#C0186A' : '#E5E7EB',
                  background: tipo === t.key ? '#fdf2f8' : 'white',
                  color: tipo === t.key ? '#C0186A' : '#6B7280',
                }}>
                <t.icon size={20} />
                <span className="text-xs font-medium text-center leading-tight">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {tipo && (
          <>
            {/* QUANTIDADE DE PASSAGEIROS — todos exceto pós-venda */}
            {needsPax && (
              <div>
                <label className="label">{tipo === 'hospedagem' ? 'Quantidade de hóspedes' : 'Quantidade de passageiros'} *</label>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setQtdPax(q => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-lg border flex items-center justify-center transition-colors hover:bg-gray-50"
                    style={{ borderColor: '#E5E7EB' }}>
                    <Minus size={16} style={{ color: '#6B7280' }} />
                  </button>
                  <span className="text-2xl font-bold w-8 text-center" style={{ color: '#1A1614' }}>{qtdPax}</span>
                  <button type="button" onClick={() => setQtdPax(q => q + 1)}
                    className="w-9 h-9 rounded-lg border flex items-center justify-center transition-colors hover:bg-gray-50"
                    style={{ borderColor: '#E5E7EB' }}>
                    <Plus size={16} style={{ color: '#6B7280' }} />
                  </button>
                  {qtdPax > 1 && (
                    <span className="text-xs" style={{ color: '#6B7280' }}>
                      Será criada uma solicitação individual para cada passageiro
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* PASSAGEIROS — identificação */}
            {needsPax && (
              <div>
                <label className="label">
                  Identificar {tipo === 'hospedagem' ? 'hóspede' : 'passageiro'}{qtdPax > 1 ? 's' : ''} *
                  <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full"
                    style={{ background: selecionados.length === qtdPax ? '#ECFDF5' : '#FEF3C7', color: selecionados.length === qtdPax ? '#059669' : '#E8820C' }}>
                    {selecionados.length}/{qtdPax}
                  </span>
                </label>
                <SeletorPassageiros passageiros={passageiros} selecionados={selecionados}
                  onChange={setSelecionados} qtd={qtdPax} perfil={perfil} />
              </div>
            )}

            {/* Centro de custo */}
            {obras.length > 0 && (
              <div>
                <label className="label">Centro de custo <span className="text-gray-400 font-normal">(opcional)</span></label>
                <select className="input" value={form.obra_id} onChange={e => set('obra_id', e.target.value)}>
                  <option value="">Nenhum</option>
                  {obras.map(o => <option key={o.id} value={o.id}>{o.codigo ? `[${o.codigo}] ` : ''}{o.nome}</option>)}
                </select>
              </div>
            )}

            {/* AÉREO */}
            {tipo === 'aereo' && <CampoViagem form={form} set={set} tipo="aereo" />}

            {/* RODOVIÁRIO */}
            {tipo === 'rodoviario' && <CampoViagem form={form} set={set} tipo="rodoviario" />}

            {/* HOSPEDAGEM */}
            {tipo === 'hospedagem' && <CampoHospedagem form={form} set={set} maxHospedes={qtdPax} />}

            {/* PACOTE */}
            {tipo === 'pacote' && (
              <>
                <div>
                  <label className="label">Serviços do pacote *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[{ key: 'aereo', label: 'Aéreo', icon: Plane },
                      { key: 'rodoviario', label: 'Rodoviário', icon: Bus },
                      { key: 'hospedagem', label: 'Hospedagem', icon: Hotel }].map(s => (
                      <button key={s.key} type="button"
                        onClick={() => setPacoteTipos(p => ({ ...p, [s.key]: !p[s.key] }))}
                        className="flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all"
                        style={{
                          borderColor: pacoteTipos[s.key] ? '#C0186A' : '#E5E7EB',
                          background: pacoteTipos[s.key] ? '#fdf2f8' : 'white',
                          color: pacoteTipos[s.key] ? '#C0186A' : '#6B7280',
                        }}>
                        <s.icon size={16} /> {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cards Aéreo */}
                {pacoteTipos.aereo && (
                  <div className="space-y-3">
                    {pacoteAereos.map((pa, idx) => (
                      <div key={idx} className="rounded-xl border-2 p-5 space-y-4" style={{ borderColor: '#C0186A', background: '#fdf2f8' }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Plane size={16} style={{ color: '#C0186A' }} />
                            <p className="text-sm font-semibold" style={{ color: '#C0186A' }}>Aéreo {pacoteAereos.length > 1 ? idx+1 : ''}</p>
                          </div>
                          {pacoteAereos.length > 1 && (
                            <button type="button" onClick={() => setPacoteAereos(prev => prev.filter((_,i)=>i!==idx))}
                              className="text-gray-300 hover:text-red-400"><X size={15}/></button>
                          )}
                        </div>
                        <CampoViagem form={pa} set={(f,v)=>setPacoteAereos(prev=>prev.map((x,i)=>i===idx?{...x,[f]:v}:x))} tipo="aereo" />
                      </div>
                    ))}
                    <button type="button" onClick={() => setPacoteAereos(prev=>[...prev,{origem:'',destino:'',data_ida:'',data_volta:'',bagagem:false,ida_flexivel:false,data_ida_min:'',data_ida_max:'',volta_flexivel:false,data_volta_min:'',data_volta_max:''}])}
                      className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border" style={{ color: '#C0186A', borderColor: '#f9c0d8' }}>
                      <Plus size={14}/> Adicionar outro voo
                    </button>
                  </div>
                )}

                {/* Cards Rodoviário */}
                {pacoteTipos.rodoviario && (
                  <div className="space-y-3">
                    {pacoteRodos.map((pr, idx) => (
                      <div key={idx} className="rounded-xl border-2 p-5 space-y-4" style={{ borderColor: '#E8820C', background: '#fff7ed' }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Bus size={16} style={{ color: '#E8820C' }} />
                            <p className="text-sm font-semibold" style={{ color: '#E8820C' }}>Rodoviário {pacoteRodos.length > 1 ? idx+1 : ''}</p>
                          </div>
                          {pacoteRodos.length > 1 && (
                            <button type="button" onClick={() => setPacoteRodos(prev => prev.filter((_,i)=>i!==idx))}
                              className="text-gray-300 hover:text-red-400"><X size={15}/></button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div><label className="label">Origem *</label>
                            <input className="input" placeholder="Ex: Gov. Valadares, MG" value={pr.origem}
                              onChange={e=>setPacoteRodos(prev=>prev.map((x,i)=>i===idx?{...x,origem:e.target.value}:x))}/></div>
                          <div><label className="label">Destino *</label>
                            <input className="input" placeholder="Ex: São Paulo, SP" value={pr.destino}
                              onChange={e=>setPacoteRodos(prev=>prev.map((x,i)=>i===idx?{...x,destino:e.target.value}:x))}/></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div><label className="label">Data de ida *</label>
                            <input type="date" className="input" value={pr.data_ida}
                              onChange={e=>setPacoteRodos(prev=>prev.map((x,i)=>i===idx?{...x,data_ida:e.target.value}:x))}/></div>
                          <div><label className="label">Data de volta <span className="text-gray-400 font-normal">(opcional)</span></label>
                            <input type="date" className="input" value={pr.data_volta}
                              onChange={e=>setPacoteRodos(prev=>prev.map((x,i)=>i===idx?{...x,data_volta:e.target.value}:x))}/></div>
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={() => setPacoteRodos(prev=>[...prev,{origem:'',destino:'',data_ida:'',data_volta:''}])}
                      className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border" style={{ color: '#E8820C', borderColor: '#fed7aa' }}>
                      <Plus size={14}/> Adicionar outro ônibus
                    </button>
                  </div>
                )}

                {/* Cards Hospedagem */}
                {pacoteTipos.hospedagem && (
                  <div className="space-y-3">
                    {pacoteHoteis.map((ph, idx) => (
                      <div key={idx} className="rounded-xl border-2 p-5 space-y-4" style={{ borderColor: '#7E22CE', background: '#faf5ff' }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Hotel size={16} style={{ color: '#7E22CE' }} />
                            <p className="text-sm font-semibold" style={{ color: '#7E22CE' }}>Hospedagem {pacoteHoteis.length > 1 ? idx+1 : ''}</p>
                          </div>
                          {pacoteHoteis.length > 1 && (
                            <button type="button" onClick={() => setPacoteHoteis(prev => prev.filter((_,i)=>i!==idx))}
                              className="text-gray-300 hover:text-red-400"><X size={15}/></button>
                          )}
                        </div>
                        <CampoHospedagem
                          form={ph} maxHospedes={qtdPax}
                          set={(f,v)=>setPacoteHoteis(prev=>prev.map((x,i)=>i===idx?{...x,[f]:v}:x))} />
                      </div>
                    ))}
                    <button type="button" onClick={() => setPacoteHoteis(prev=>[...prev,{cidade:'',checkin:'',checkout:'',quartos_lista:[{tipo:'individual',hospedes:1}],cafe_manha:true}])}
                      className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border" style={{ color: '#7E22CE', borderColor: '#e9d5ff' }}>
                      <Plus size={14}/> Adicionar outra hospedagem
                    </button>
                  </div>
                )}
              </>
            )}

            {/* PÓS-VENDA */}
            {tipo === 'posvenda' && (
              <>
                <div>
                  <label className="label">Passageiro</label>
                  <SeletorPassageiros passageiros={passageiros} selecionados={selecionados}
                    onChange={s => setSelecionados(s.slice(-1))} qtd={1} perfil={perfil} />
                </div>
                <div>
                  <label className="label">Tipo de solicitação *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {POSVENDA_TIPOS.map(t => (
                      <button key={t.value} type="button" onClick={() => set('posvenda_tipo', t.value)}
                        className="text-left px-3 py-2.5 rounded-lg border text-sm font-medium transition-all"
                        style={{
                          borderColor: form.posvenda_tipo === t.value ? '#C0186A' : '#E5E7EB',
                          background: form.posvenda_tipo === t.value ? '#fdf2f8' : 'white',
                          color: form.posvenda_tipo === t.value ? '#C0186A' : '#1A1614',
                        }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Localizador / ID da reserva *</label>
                  <input className="input" placeholder="Ex: 113456978 ou ABCDEF"
                    value={form.localizador_ref} onChange={e => set('localizador_ref', e.target.value)} />
                </div>
                {form.posvenda_tipo === 'remarcacao' && (
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="label mb-0">Nova data desejada</label>
                        <ToggleSwitch on={form.remark_flexivel} onToggle={() => set('remark_flexivel', !form.remark_flexivel)} label="Data flexível" />
                      </div>
                      {form.remark_flexivel ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="label text-xs text-gray-400">A partir de</label>
                            <input type="date" className="input" min={hojeISO()} value={form.nova_data_min} onChange={e => set('nova_data_min', e.target.value)} /></div>
                          <div><label className="label text-xs text-gray-400">Até</label>
                            <input type="date" className="input" min={form.nova_data_min || hojeISO()} value={form.nova_data_max} onChange={e => set('nova_data_max', e.target.value)} /></div>
                        </div>
                      ) : (
                        <input type="date" className="input" min={hojeISO()} value={form.nova_data} onChange={e => set('nova_data', e.target.value)} />
                      )}
                    </div>
                    <div><label className="label">Nova rota <span className="text-gray-400 font-normal">(se diferente)</span></label>
                      <input className="input" placeholder="Ex: GV → Rio" value={form.nova_rota} onChange={e => set('nova_rota', e.target.value)} /></div>
                  </div>
                )}
              </>
            )}

            {/* Observações */}
            <div>
              <label className="label">Observações <span className="text-gray-400 font-normal">(opcional)</span></label>
              <textarea className="input resize-none" rows={3}
                placeholder="Ex: preferência de horário, voo noturno, andar alto..."
                value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
            </div>

            {/* Submit */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={!canSubmit || salvando} className="btn-primary">
                {salvando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {salvando ? 'Enviando...' : 'Enviar solicitação'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
