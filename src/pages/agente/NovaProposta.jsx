import { useState, useMemo, useRef } from 'react'
import { parcelasSemJuros, buscarCia } from '../../lib/parcelamento'
import {
  Plane, Ticket, Sparkles, Plus, X, Trash2, FileDown, Loader2,
  Wand2, Info, ChevronDown, ChevronUp, Layers
} from 'lucide-react'

// Config: em dev usa o proxy do Vite (/proposta-api); em prod, VITE_PROPOSTA_API_URL.
const API_BASE = import.meta.env.VITE_PROPOSTA_API_URL || '/proposta-api'
const API_KEY = import.meta.env.VITE_PROPOSTA_API_KEY || ''

const PERIODOS = [
  { v: 'bom dia', l: 'Bom dia' },
  { v: 'boa tarde', l: 'Boa tarde' },
  { v: 'boa noite', l: 'Boa noite' },
]

const TIPOS_OPCAO = [
  { key: 'rf', label: 'Consolidadora (RF)', icon: Plane, desc: 'Emissão em dinheiro/cartão' },
  { key: 'milhas', label: 'Milhas', icon: Ticket, desc: 'Pix ou cartão 3x' },
  { key: 'multi', label: 'Multi-emissão', icon: Layers, desc: 'Ida + volta separadas' },
  { key: 'adicional', label: 'Adicional', icon: Sparkles, desc: 'Assento, bagagem extra…' },
]

const trechoVazio = () => ({ origem: '', destino: '', cia: '', data: '', partida: '', chegada: '', conexao: '', classe: '' })

const emissaoVazia = (tipo, rotulo = '') => {
  const base = { _eid: crypto.randomUUID(), tipo, rotulo, trechos: [trechoVazio()], bagagem: '' }
  if (tipo === 'rf') return {
    ...base, tarifa: '', taxas: '', cia: '', rav_pct: '5', cambio: '1',
    origem_brasil: true, ndc: false, fidelidade: false, nacional: false,
    remarcacao_multa: '', remarcacao_agencia: '', reembolso_multa: '',
  }
  return { ...base, cia: '', pix: '', cartao: '', reembolso_pct: '', remarcacao: '' }
}

const opcaoVazia = (kind, n = 1) => {
  const base = { _id: crypto.randomUUID(), kind }
  if (kind === 'rf') return {
    ...base, titulo: `Opção ${n}`, rota: '', trechos: [trechoVazio()],
    tarifa: '', taxas: '', cia: '', rav_pct: '5', cambio: '1',
    origem_brasil: true, ndc: false, fidelidade: false, nacional: false,
    bagagem: '', remarcacao_multa: '', remarcacao_agencia: '', reembolso_multa: '',
  }
  if (kind === 'milhas') return {
    ...base, titulo: `Opção ${n}`, rota: '', trechos: [trechoVazio()],
    pix: '', cartao: '', reembolso_pct: '', remarcacao: '', bagagem: '',
  }
  if (kind === 'multi') return {
    ...base, titulo: `Opção ${n}`, rota: '',
    emissoes: [emissaoVazia('rf', 'Ida'), emissaoVazia('milhas', 'Volta')],
  }
  return { ...base, titulo: '', total: '', linhas: [''] }
}

// converte "1.234,50" ou "1234.50" -> número; vazio -> undefined
function toNum(s) {
  if (s === '' || s == null) return undefined
  const n = parseFloat(String(s).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
  return Number.isNaN(n) ? undefined : n
}

function toApiEmissao(e) {
  const trechos = (e.trechos || []).map(t => [t.origem, t.destino, t.cia, t.data, t.partida, t.chegada, t.conexao, t.classe])
  if (e.tipo === 'milhas') {
    const p = {
      kind: 'milhas', rotulo: e.rotulo, rota: '', tipo: '', trechos,
      pix: toNum(e.pix) ?? 0, cartao: toNum(e.cartao) ?? (toNum(e.pix) ?? 0),
    }
    if (e.cia) p.cia = e.cia
    if (toNum(e.reembolso_pct) != null) p.reembolso_pct = toNum(e.reembolso_pct)
    if (e.remarcacao) p.remarcacao = e.remarcacao
    if (e.bagagem) p.bagagem = e.bagagem
    return p
  }
  const p = {
    kind: 'rf', rotulo: e.rotulo, rota: '', tipo: '', trechos,
    tarifa: toNum(e.tarifa) ?? 0, taxas: toNum(e.taxas) ?? 0, cia: e.cia,
    rav_pct: toNum(e.rav_pct) ?? 0, cambio: toNum(e.cambio) ?? 1,
    origem_brasil: !!e.origem_brasil, ndc: !!e.ndc, fidelidade: !!e.fidelidade, nacional: !!e.nacional,
  }
  if (e.bagagem) p.bagagem = e.bagagem
  if (toNum(e.remarcacao_multa) != null) { p.remarcacao_multa = toNum(e.remarcacao_multa); p.remarcacao_agencia = toNum(e.remarcacao_agencia) ?? 0 }
  if (toNum(e.reembolso_multa) != null) p.reembolso_multa = toNum(e.reembolso_multa)
  return p
}

// campos lidos do print -> patch pra uma opção/emissão
function mapTrecho(t) {
  return {
    origem: t.origem || '', destino: t.destino || '', cia: t.cia || '',
    data: t.data || '', partida: t.partida || '', chegada: t.chegada || '',
    conexao: t.conexao || '', classe: t.classe || '',
  }
}
function patchDeCampos(campos, tipo, comRota) {
  const patch = {}
  if (comRota && campos.rota) patch.rota = campos.rota
  if (campos.cia) patch.cia = campos.cia
  if (campos.bagagem) patch.bagagem = campos.bagagem
  if (Array.isArray(campos.trechos) && campos.trechos.length) patch.trechos = campos.trechos.map(mapTrecho)
  if (tipo === 'rf') {
    if (campos.rav_pct) patch.rav_pct = String(campos.rav_pct)
    if (campos.tarifa) patch.tarifa = String(campos.tarifa)
    if (campos.taxas) patch.taxas = String(campos.taxas)
    if (campos.cambio) patch.cambio = String(campos.cambio)
  }
  return patch
}

// Caixa que lê o print: aceita colar (Ctrl+V), arrastar ou clicar pra anexar.
function PrintDropzone({ onCampos }) {
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState('')
  const ref = useRef(null)
  async function ler(file) {
    if (!file) return
    setLendo(true); setErro('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${API_BASE}/interpretar-print`, {
        method: 'POST', headers: { 'X-API-Key': API_KEY }, body: fd,
      })
      if (!res.ok) {
        let m = `Erro ${res.status}`
        try { const j = await res.json(); m += ` · ${j.detail || ''}` } catch { /* ignore */ }
        throw new Error(m)
      }
      const { campos } = await res.json()
      onCampos(campos)
    } catch (e) {
      setErro(e.message || 'falhou')
    } finally {
      setLendo(false)
    }
  }
  function onPaste(ev) {
    const items = ev.clipboardData && ev.clipboardData.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.type && it.type.indexOf('image') === 0) {
        const f = it.getAsFile()
        if (f) { ev.preventDefault(); ler(f) }
        return
      }
    }
  }
  return (
    <div>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={ev => { const f = ev.target.files && ev.target.files[0]; if (f) ler(f); ev.target.value = '' }} />
      <div tabIndex={0} onPaste={onPaste} onClick={() => ref.current && ref.current.click()}
        onDragOver={ev => ev.preventDefault()}
        onDrop={ev => { ev.preventDefault(); const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]; if (f) ler(f) }}
        className="rounded-lg border border-dashed text-center text-xs py-3 px-3 cursor-pointer"
        style={{ borderColor: '#E5C4D6', color: '#9A6B85', background: '#FDF6FA' }}>
        {lendo ? 'Lendo o print…' : 'Ler print: clique aqui e cole (Ctrl+V), ou arraste/anexe a imagem'}
      </div>
      {erro && <p className="text-xs mt-1" style={{ color: '#B91C1C' }}>Print: {erro}</p>}
    </div>
  )
}

// ---- exemplo pra testar o fluxo sem a IA ----
const EXEMPLO = {
  cliente: 'Maria Silva', saudacao_nome: 'Maria', genero: 'F', saudacao_periodo: 'boa tarde',
  opcoes: [
    {
      ...opcaoVazia('rf'), titulo: 'Opção 1', rota: 'GRU → MXP',
      trechos: [{ origem: 'GRU', destino: 'MXP', cia: 'LATAM', data: '01/08/26', partida: '23:20', chegada: '16:35 +1', conexao: 'Direto', classe: 'Executiva' }],
      tarifa: '3300', taxas: '220', cia: 'LATAM', rav_pct: '5', cambio: '5.40',
      bagagem: '2 peças (executiva)', remarcacao_multa: '150', remarcacao_agencia: '30', reembolso_multa: '350',
    },
  ],
}

export default function NovaProposta() {
  const [cliente, setCliente] = useState('')
  const [saudacaoNome, setSaudacaoNome] = useState('')
  const [genero, setGenero] = useState('M')
  const [periodo, setPeriodo] = useState('boa tarde')
  const [comando, setComando] = useState('')
  const [opcoes, setOpcoes] = useState([opcaoVazia('rf')])

  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const nomeSaud = saudacaoNome || cliente.trim().split(' ')[0] || ''

  function aplicarClienteDoPrint(campos) {
    if (campos && campos.cliente && !cliente.trim()) {
      setCliente(campos.cliente)
      if (campos.genero === 'F' || campos.genero === 'M') setGenero(campos.genero)
    }
  }

  function setOpcao(id, patch) {
    setOpcoes(os => os.map(o => o._id === id ? { ...o, ...patch } : o))
  }
  function addOpcao(kind) { setOpcoes(os => [...os, opcaoVazia(kind, os.length + 1)]) }
  function delOpcao(id) { setOpcoes(os => os.filter(o => o._id !== id)) }

  function carregarExemplo() {
    setCliente(EXEMPLO.cliente); setSaudacaoNome(EXEMPLO.saudacao_nome)
    setGenero(EXEMPLO.genero); setPeriodo(EXEMPLO.saudacao_periodo)
    setOpcoes(EXEMPLO.opcoes.map(o => ({ ...o, _id: crypto.randomUUID() })))
    setErro('')
  }

  function toApi(o) {
    const trechos = (o.trechos || []).map(t => [t.origem, t.destino, t.cia, t.data, t.partida, t.chegada, t.conexao, t.classe])
    if (o.kind === 'rf') {
      const p = {
        kind: 'rf', titulo: o.titulo, rota: o.rota, tipo: '', trechos,
        tarifa: toNum(o.tarifa) ?? 0, taxas: toNum(o.taxas) ?? 0,
        cia: o.cia, rav_pct: toNum(o.rav_pct) ?? 0, cambio: toNum(o.cambio) ?? 1,
        origem_brasil: !!o.origem_brasil, ndc: !!o.ndc, fidelidade: !!o.fidelidade, nacional: !!o.nacional,
      }
      if (o.bagagem) p.bagagem = o.bagagem
      if (toNum(o.remarcacao_multa) != null) { p.remarcacao_multa = toNum(o.remarcacao_multa); p.remarcacao_agencia = toNum(o.remarcacao_agencia) ?? 0 }
      if (toNum(o.reembolso_multa) != null) p.reembolso_multa = toNum(o.reembolso_multa)
      return p
    }
    if (o.kind === 'milhas') {
      const p = {
        kind: 'milhas', titulo: o.titulo, rota: o.rota, tipo: '', trechos,
        pix: toNum(o.pix) ?? 0, cartao: toNum(o.cartao) ?? (toNum(o.pix) ?? 0),
      }
      if (toNum(o.reembolso_pct) != null) p.reembolso_pct = toNum(o.reembolso_pct)
      if (o.remarcacao) p.remarcacao = o.remarcacao
      if (o.bagagem) p.bagagem = o.bagagem
      return p
    }
    if (o.kind === 'multi') {
      return {
        kind: 'multi', titulo: o.titulo, rota: o.rota, tipo: '',
        emissoes: (o.emissoes || []).map(toApiEmissao),
      }
    }
    return { kind: 'adicional', titulo: o.titulo || 'Adicional', total: o.total, linhas: (o.linhas || []).filter(Boolean) }
  }

  function validar() {
    if (!cliente.trim()) return 'Informe o nome do cliente.'
    if (!opcoes.length) return 'Adicione pelo menos uma opção.'
    return ''
  }

  async function gerar() {
    const v = validar()
    if (v) { setErro(v); return }
    setLoading(true); setErro('')
    const payload = {
      cliente: cliente.trim(), saudacao_nome: nomeSaud, genero, saudacao_periodo: periodo,
      saida: `Proposta ${cliente.trim()}.pdf`, opcoes: opcoes.map(toApi),
      ...(comando.trim() ? { comando: comando.trim() } : {}),
    }
    try {
      const res = await fetch(`${API_BASE}/gerar-proposta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let msg = `Erro ${res.status}`
        try { const j = await res.json(); msg += ` · ${j.detail || ''}` } catch { /* ignore */ }
        throw new Error(msg)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = payload.saida; document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErro(e.message || 'Falha ao gerar a proposta.')
    } finally { setLoading(false) }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg,#5B2D8E,#C0186A)' }}>
          <FileDown size={16} className="text-white" />
        </div>
        <h1 className="text-xl font-semibold" style={{ color: '#1A1614' }}>Nova Proposta</h1>
      </div>
      <p className="text-sm text-slate-500 mb-5">
        Monte a proposta e gere o PDF. Em cada opção você pode subir/colar o print pra IA preencher.
      </p>

      {/* Cliente */}
      <div className="card p-4 mb-4">
        <p className="text-sm font-medium mb-3">Cliente</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="label">Nome do cliente *</label>
            <input className="input" placeholder="Nome completo" value={cliente} onChange={e => setCliente(e.target.value)} />
          </div>
          <div>
            <label className="label">Saudação (1º nome)</label>
            <input className="input" placeholder={nomeSaud || 'Automático'} value={saudacaoNome} onChange={e => setSaudacaoNome(e.target.value)} />
          </div>
          <div>
            <label className="label">Período</label>
            <select className="input" value={periodo} onChange={e => setPeriodo(e.target.value)}>
              {PERIODOS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Tratamento</label>
            <div className="flex gap-2">
              {[['M', 'Prezado'], ['F', 'Prezada']].map(([g, l]) => (
                <button key={g} type="button" onClick={() => setGenero(g)}
                        className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${genero === g ? 'text-white' : 'bg-white'}`}
                        style={genero === g ? { background: 'linear-gradient(135deg,#5B2D8E,#C0186A)', borderColor: 'transparent' } : { borderColor: '#E5E7EB' }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        {nomeSaud && (
          <p className="text-xs text-slate-500 mt-2">
            Vai aparecer: <span className="font-medium">{genero === 'F' ? 'Prezada' : 'Prezado'} {nomeSaud}, {periodo}.</span>
          </p>
        )}
      </div>

      {/* Opções */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium">Opções ({opcoes.length})</p>
        <button type="button" className="text-xs flex items-center gap-1" style={{ color: '#C0186A' }} onClick={carregarExemplo}>
          <Sparkles size={13} /> Preencher com exemplo
        </button>
      </div>
      <div className="space-y-3">
        {opcoes.map((o, i) => (
          <OpcaoCard key={o._id} idx={i} o={o} onChange={p => setOpcao(o._id, p)} onDel={() => delOpcao(o._id)} onCliente={aplicarClienteDoPrint} />
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {TIPOS_OPCAO.map(t => (
          <button key={t.key} type="button" className="btn-secondary" onClick={() => addOpcao(t.key)}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      <div className="card p-4 mt-4">
        <div className="flex items-start gap-3">
          <Wand2 size={18} className="mt-0.5" style={{ color: '#C0186A' }} />
          <div className="flex-1">
            <p className="text-sm font-medium">Comando para a IA <span className="text-slate-400 font-normal text-xs">(opcional)</span></p>
            <p className="text-xs text-slate-500 mt-0.5 mb-2">
              Deixe vazio pra gerar normalmente (sem IA). Se escrever um pedido, a IA aplica na proposta antes de gerar — use pra coisas que os campos não cobrem.
            </p>
            <textarea className="input" rows={2} placeholder="Ex.: deixa a opção 1 não reembolsável; adiciona um assento LATAM+ de R$ 2.400"
                      value={comando} onChange={e => setComando(e.target.value)} />
          </div>
        </div>
      </div>

      {erro && (
        <div className="mt-4 text-sm rounded-md px-3 py-2" style={{ background: '#FDE7F0', color: '#A01458' }}>
          {erro}
        </div>
      )}

      {/* Barra fixa de ação */}
      <div className="fixed bottom-0 left-0 right-0 md:left-60 bg-white border-t px-4 py-3 flex items-center justify-between"
           style={{ borderColor: '#E5E7EB' }}>
        <p className="text-xs text-slate-500 hidden sm:block">
          {cliente ? `${cliente} · ${opcoes.length} opção(ões)` : 'Preencha o cliente e as opções'}
        </p>
        <button className="btn-primary ml-auto" onClick={gerar} disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
          {loading ? 'Gerando…' : 'Gerar Proposta PDF'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Opção card
function OpcaoCard({ idx, o, onChange, onDel, onCliente }) {
  const [aberto, setAberto] = useState(true)
  const tipo = TIPOS_OPCAO.find(t => t.key === o.kind)

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="badge text-white" style={{ background: 'linear-gradient(135deg,#5B2D8E,#C0186A)' }}>
            {String(idx + 1).padStart(2, '0')}
          </span>
          <span className="text-sm font-medium flex items-center gap-1">
            {tipo && <tipo.icon size={14} style={{ color: '#C0186A' }} />} {tipo?.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 text-slate-400 hover:text-slate-600" onClick={() => setAberto(a => !a)}>
            {aberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button className="p-1.5 text-slate-400 hover:text-red-600" onClick={onDel}><Trash2 size={16} /></button>
        </div>
      </div>

      {aberto && (
        <div className="mt-3">
          {o.kind === 'rf' && <FormRF o={o} onChange={onChange} onCliente={onCliente} />}
          {o.kind === 'milhas' && <FormMilhas o={o} onChange={onChange} onCliente={onCliente} />}
          {o.kind === 'multi' && <FormMulti o={o} onChange={onChange} onCliente={onCliente} />}
          {o.kind === 'adicional' && <FormAdicional o={o} onChange={onChange} />}
        </div>
      )}
    </div>
  )
}

function CampoRotaTipo({ o, onChange }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className="label">Rota</label>
        <input className="input" placeholder="GRU → MXP" value={o.rota} onChange={e => onChange({ rota: e.target.value })} />
      </div>
      <div>
        <label className="label">Descrição <span className="text-slate-400 font-normal">(vira o selo da opção)</span></label>
        <input className="input" placeholder="Opção 1" value={o.titulo} onChange={e => onChange({ titulo: e.target.value })} />
      </div>
    </div>
  )
}

function Trechos({ o, onChange }) {
  const set = (i, patch) => onChange({ trechos: o.trechos.map((t, k) => k === i ? { ...t, ...patch } : t) })
  const add = () => onChange({ trechos: [...o.trechos, trechoVazio()] })
  const del = (i) => onChange({ trechos: o.trechos.filter((_, k) => k !== i) })
  return (
    <div className="mt-3">
      <label className="label">Trechos</label>
      <div className="space-y-2">
        {o.trechos.map((t, i) => (
          <div key={i} className="rounded-lg border p-2" style={{ borderColor: '#E5E7EB' }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <input className="input" placeholder="Origem" value={t.origem} onChange={e => set(i, { origem: e.target.value.toUpperCase() })} />
              <input className="input" placeholder="Destino" value={t.destino} onChange={e => set(i, { destino: e.target.value.toUpperCase() })} />
              <input className="input" placeholder="Cia" value={t.cia} onChange={e => set(i, { cia: e.target.value })} />
              <input className="input" placeholder="Data 01/08/26" value={t.data} onChange={e => set(i, { data: e.target.value })} />
              <input className="input" placeholder="Partida 23:20" value={t.partida} onChange={e => set(i, { partida: e.target.value })} />
              <input className="input" placeholder="Chegada 16:35 +1" value={t.chegada} onChange={e => set(i, { chegada: e.target.value })} />
              <input className="input" placeholder="Direto" value={t.conexao} onChange={e => set(i, { conexao: e.target.value })} />
              <input className="input" placeholder="Economy" value={t.classe} onChange={e => set(i, { classe: e.target.value })} />
            </div>
            {o.trechos.length > 1 && (
              <button className="text-xs text-slate-400 hover:text-red-600 mt-1 flex items-center gap-1" onClick={() => del(i)}>
                <X size={12} /> remover trecho
              </button>
            )}
          </div>
        ))}
      </div>
      <button className="text-sm mt-2 flex items-center gap-1" style={{ color: '#C0186A' }} onClick={add}>
        <Plus size={14} /> adicionar trecho
      </button>
    </div>
  )
}

function FormRF({ o, onChange, onCliente }) {
  const parcelas = useMemo(() => {
    if (!o.cia) return null
    return parcelasSemJuros(o.cia, { origemBrasil: o.origem_brasil, ndc: o.ndc, fidelidade: o.fidelidade, nacional: o.nacional })
  }, [o.cia, o.origem_brasil, o.ndc, o.fidelidade, o.nacional])
  const cia = o.cia ? buscarCia(o.cia) : null

  return (
    <>
      <div className="mb-3">
        <PrintDropzone onCampos={campos => { onChange(patchDeCampos(campos, 'rf', true)); onCliente && onCliente(campos) }} />
      </div>
      <CampoRotaTipo o={o} onChange={onChange} />
      <Trechos o={o} onChange={onChange} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        <div>
          <label className="label">Tarifa (US$)</label>
          <input className="input" placeholder="18000" value={o.tarifa} onChange={e => onChange({ tarifa: e.target.value })} />
        </div>
        <div>
          <label className="label">Taxas (US$)</label>
          <input className="input" placeholder="1200" value={o.taxas} onChange={e => onChange({ taxas: e.target.value })} />
        </div>
        <div>
          <label className="label">RAV %</label>
          <input className="input" placeholder="5" value={o.rav_pct} onChange={e => onChange({ rav_pct: e.target.value })} />
        </div>
        <div>
          <label className="label">Câmbio</label>
          <input className="input" placeholder="1" value={o.cambio} onChange={e => onChange({ cambio: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <div>
          <label className="label">Companhia (parcelamento)</label>
          <input className="input" placeholder="LATAM / LA" value={o.cia} onChange={e => onChange({ cia: e.target.value })} />
          {o.cia && (
            <p className="text-xs mt-1" style={{ color: cia ? '#15803D' : '#B91C1C' }}>
              {cia ? `${cia.nome} · Cartão ${parcelas}x sem juros` : 'Companhia não encontrada na tabela'}
            </p>
          )}
        </div>
        <div>
          <label className="label">Bagagem</label>
          <input className="input" placeholder="2 peças (executiva)" value={o.bagagem} onChange={e => onChange({ bagagem: e.target.value })} />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mt-3 text-sm">
        {[['origem_brasil', 'Origem Brasil'], ['ndc', 'NDC'], ['fidelidade', 'Fidelidade'], ['nacional', 'Nacional']].map(([k, l]) => (
          <label key={k} className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={!!o[k]} onChange={e => onChange({ [k]: e.target.checked })} />
            <span>{l}</span>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
        <div>
          <label className="label">Multa remarcação</label>
          <input className="input" placeholder="US$" value={o.remarcacao_multa} onChange={e => onChange({ remarcacao_multa: e.target.value })} />
        </div>
        <div>
          <label className="label">Margem agência</label>
          <input className="input" placeholder="US$" value={o.remarcacao_agencia} onChange={e => onChange({ remarcacao_agencia: e.target.value })} />
        </div>
        <div>
          <label className="label">Multa reembolso</label>
          <input className="input" placeholder="US$" value={o.reembolso_multa} onChange={e => onChange({ reembolso_multa: e.target.value })} />
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
        <Info size={12} /> Valores em dólar (× câmbio). Remarcação = (multa + margem + USD 40) × câmbio. Reembolso = % do total pago.
      </p>
    </>
  )
}

function FormMilhas({ o, onChange, onCliente }) {
  return (
    <>
      <div className="mb-3">
        <PrintDropzone onCampos={campos => { onChange(patchDeCampos(campos, 'milhas', true)); onCliente && onCliente(campos) }} />
      </div>
      <CampoRotaTipo o={o} onChange={onChange} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
        <div>
          <label className="label">Pix (à vista)</label>
          <input className="input" placeholder="8000" value={o.pix} onChange={e => onChange({ pix: e.target.value })} />
        </div>
        <div>
          <label className="label">Cartão 3x</label>
          <input className="input" placeholder="8000" value={o.cartao} onChange={e => onChange({ cartao: e.target.value })} />
        </div>
        <div>
          <label className="label">Reembolso %</label>
          <input className="input" placeholder="70" value={o.reembolso_pct} onChange={e => onChange({ reembolso_pct: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <div>
          <label className="label">Remarcação</label>
          <input className="input" placeholder="Ex.: R$ 300 ou Sem multa" value={o.remarcacao} onChange={e => onChange({ remarcacao: e.target.value })} />
        </div>
        <div>
          <label className="label">Bagagem</label>
          <input className="input" placeholder="1 peça" value={o.bagagem} onChange={e => onChange({ bagagem: e.target.value })} />
        </div>
      </div>
    </>
  )
}

function FormAdicional({ o, onChange }) {
  const setLinha = (i, v) => onChange({ linhas: o.linhas.map((l, k) => k === i ? v : l) })
  const add = () => onChange({ linhas: [...o.linhas, ''] })
  const del = (i) => onChange({ linhas: o.linhas.filter((_, k) => k !== i) })
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Título</label>
          <input className="input" placeholder="ASSENTO LATAM+" value={o.titulo} onChange={e => onChange({ titulo: e.target.value })} />
        </div>
        <div>
          <label className="label">Total geral</label>
          <input className="input" placeholder="R$ 2.400,00" value={o.total} onChange={e => onChange({ total: e.target.value })} />
        </div>
      </div>
      <div className="mt-3">
        <label className="label">Linhas descritivas</label>
        <div className="space-y-2">
          {o.linhas.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input className="input" placeholder="Ex.: Maria (ida, LATAM)" value={l} onChange={e => setLinha(i, e.target.value)} />
              {o.linhas.length > 1 && (
                <button className="p-2 text-slate-400 hover:text-red-600" onClick={() => del(i)}><X size={16} /></button>
              )}
            </div>
          ))}
        </div>
        <button className="text-sm mt-2 flex items-center gap-1" style={{ color: '#C0186A' }} onClick={add}>
          <Plus size={14} /> adicionar linha
        </button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- Multi-emissão
function FormMulti({ o, onChange, onCliente }) {
  const setEmis = (i, patch) => onChange({ emissoes: o.emissoes.map((e, k) => k === i ? { ...e, ...patch } : e) })
  const addEmis = (tipo) => onChange({ emissoes: [...o.emissoes, emissaoVazia(tipo, '')] })
  const delEmis = (i) => onChange({ emissoes: o.emissoes.filter((_, k) => k !== i) })
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Rota</label>
          <input className="input" placeholder="GRU ⇄ LHR" value={o.rota} onChange={e => onChange({ rota: e.target.value })} />
        </div>
        <div>
          <label className="label">Descrição <span className="text-slate-400 font-normal">(vira o selo da opção)</span></label>
          <input className="input" placeholder="Opção 1" value={o.titulo} onChange={e => onChange({ titulo: e.target.value })} />
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {o.emissoes.map((e, i) => (
          <EmissaoEditor key={e._eid} e={e} idx={i} onChange={p => setEmis(i, p)} onDel={() => delEmis(i)} canDel={o.emissoes.length > 1} onCliente={onCliente} />
        ))}
      </div>
      <div className="flex gap-3 mt-3">
        <button className="text-sm flex items-center gap-1" style={{ color: '#C0186A' }} onClick={() => addEmis('rf')}>
          <Plus size={14} /> emissão RF
        </button>
        <button className="text-sm flex items-center gap-1" style={{ color: '#C0186A' }} onClick={() => addEmis('milhas')}>
          <Plus size={14} /> emissão milhas
        </button>
      </div>
    </>
  )
}

function EmissaoEditor({ e, idx, onChange, onDel, canDel, onCliente }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: '#E5E7EB', background: '#FAFAFA' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Emissão {idx + 1}</span>
          <div className="flex gap-1">
            {[['rf', 'RF'], ['milhas', 'Milhas']].map(([tp, l]) => (
              <button key={tp} onClick={() => onChange({ tipo: tp })}
                className={`px-2 py-0.5 text-xs rounded-md border transition-colors ${e.tipo === tp ? 'text-white' : 'bg-white'}`}
                style={e.tipo === tp ? { background: 'linear-gradient(135deg,#5B2D8E,#C0186A)', borderColor: 'transparent' } : { borderColor: '#E5E7EB' }}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {canDel && <button className="p-1 text-slate-400 hover:text-red-600" onClick={onDel}><X size={14} /></button>}
      </div>
      <div className="mb-2">
        <PrintDropzone onCampos={campos => { onChange(patchDeCampos(campos, e.tipo, false)); onCliente && onCliente(campos) }} />
      </div>
      <div className="mb-2">
        <label className="label">Rótulo</label>
        <input className="input" placeholder="Ida / Volta" value={e.rotulo} onChange={ev => onChange({ rotulo: ev.target.value })} />
      </div>
      <Trechos o={e} onChange={onChange} />
      {e.tipo === 'rf' ? <CamposRF e={e} onChange={onChange} /> : <CamposMilhas e={e} onChange={onChange} />}
      <div className="mt-2">
        <label className="label">Bagagem</label>
        <input className="input" placeholder="1 peça" value={e.bagagem} onChange={ev => onChange({ bagagem: ev.target.value })} />
      </div>
    </div>
  )
}

function CamposRF({ e, onChange }) {
  const parcelas = useMemo(() => e.cia
    ? parcelasSemJuros(e.cia, { origemBrasil: e.origem_brasil, ndc: e.ndc, fidelidade: e.fidelidade, nacional: e.nacional })
    : null, [e.cia, e.origem_brasil, e.ndc, e.fidelidade, e.nacional])
  const cia = e.cia ? buscarCia(e.cia) : null
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
        <div><label className="label">Tarifa (US$)</label><input className="input" placeholder="3300" value={e.tarifa} onChange={ev => onChange({ tarifa: ev.target.value })} /></div>
        <div><label className="label">Taxas (US$)</label><input className="input" placeholder="220" value={e.taxas} onChange={ev => onChange({ taxas: ev.target.value })} /></div>
        <div><label className="label">RAV %</label><input className="input" placeholder="5" value={e.rav_pct} onChange={ev => onChange({ rav_pct: ev.target.value })} /></div>
        <div><label className="label">Câmbio</label><input className="input" placeholder="5,40" value={e.cambio} onChange={ev => onChange({ cambio: ev.target.value })} /></div>
      </div>
      <div className="mt-2">
        <label className="label">Companhia (parcelamento)</label>
        <input className="input" placeholder="LATAM / LA" value={e.cia} onChange={ev => onChange({ cia: ev.target.value })} />
        {e.cia && (
          <p className="text-xs mt-1" style={{ color: cia ? '#15803D' : '#B91C1C' }}>
            {cia ? `${cia.nome} · Cartão ${parcelas}x sem juros` : 'Companhia não encontrada'}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-3 mt-2 text-sm">
        {[['origem_brasil', 'Origem Brasil'], ['ndc', 'NDC'], ['fidelidade', 'Fidelidade'], ['nacional', 'Nacional']].map(([k, l]) => (
          <label key={k} className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={!!e[k]} onChange={ev => onChange({ [k]: ev.target.checked })} />
            <span>{l}</span>
          </label>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
        <div><label className="label">Multa remarc. (US$)</label><input className="input" placeholder="US$" value={e.remarcacao_multa} onChange={ev => onChange({ remarcacao_multa: ev.target.value })} /></div>
        <div><label className="label">Margem (US$)</label><input className="input" placeholder="US$" value={e.remarcacao_agencia} onChange={ev => onChange({ remarcacao_agencia: ev.target.value })} /></div>
        <div><label className="label">Multa reemb. (US$)</label><input className="input" placeholder="US$" value={e.reembolso_multa} onChange={ev => onChange({ reembolso_multa: ev.target.value })} /></div>
      </div>
    </>
  )
}

function CamposMilhas({ e, onChange }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
        <div><label className="label">Pix</label><input className="input" placeholder="8000" value={e.pix} onChange={ev => onChange({ pix: ev.target.value })} /></div>
        <div><label className="label">Cartão 3x</label><input className="input" placeholder="8000" value={e.cartao} onChange={ev => onChange({ cartao: ev.target.value })} /></div>
        <div><label className="label">Reembolso %</label><input className="input" placeholder="70" value={e.reembolso_pct} onChange={ev => onChange({ reembolso_pct: ev.target.value })} /></div>
      </div>
      <div className="mt-2">
        <label className="label">Remarcação</label>
        <input className="input" placeholder="Ex.: R$ 300 ou Sem multa" value={e.remarcacao} onChange={ev => onChange({ remarcacao: ev.target.value })} />
      </div>
    </>
  )
}
