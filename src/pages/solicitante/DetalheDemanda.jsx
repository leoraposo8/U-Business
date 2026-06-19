import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import StatusBadge from '../../components/ui/StatusBadge'
import TipoBadge from '../../components/ui/TipoBadge'
import {
  ChevronLeft, Luggage, Calendar, MapPin, User, Building2,
  Clock, CheckCircle, XCircle, Loader2, Upload, RotateCcw, Trash2,
  Plane, Bus, Hotel
} from 'lucide-react'
import { fmtTs, fmtData, fmtDataCurta } from '../../lib/datetime'

// fmt -> use fmtData from lib/datetime
// fmtTs imported from lib/datetime
function moeda(v) {
  if (!v && v !== 0) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3">
      <Icon size={15} className="mt-0.5 flex-shrink-0" style={{ color: '#9CA3AF' }} />
      <div>
        <p className="text-xs" style={{ color: '#9CA3AF' }}>{label}</p>
        <p className="text-sm font-medium" style={{ color: '#1A1614' }}>{value}</p>
      </div>
    </div>
  )
}

// Toggle switch component
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

// Formulário de revisão — replica o form de solicitação com dados editáveis
function FormRevisao({ demanda, perfil, onEnviar, onCancelar }) {
  const [form, setForm] = useState({
    origem:     demanda.origem ?? '',
    destino:    demanda.destino ?? '',
    data_ida:   demanda.data_ida ?? '',
    data_volta: demanda.data_volta ?? '',
    bagagem:    demanda.bagagem ?? false,
    cidade:     demanda.cidade ?? '',
    checkin:    demanda.checkin ?? '',
    checkout:   demanda.checkout ?? '',
    observacoes: demanda.observacoes ?? '',
    ida_flexivel:   false,
    data_ida_min:   '', data_ida_max: '',
    volta_flexivel: false,
    data_volta_min: '', data_volta_max: '',
  })
  const [comentario, setComentario] = useState('')
  const [salvando, setSalvando] = useState(false)
  function set(f, v) { setForm(p => ({ ...p, [f]: v })) }

  async function enviar() {
    setSalvando(true)
    try {
      // Build observacoes with flexible dates if set
      const partes = []
      if (form.ida_flexivel) partes.push(`Ida flexível: ${form.data_ida_min} a ${form.data_ida_max}`)
      if (form.volta_flexivel) partes.push(`Volta flexível: ${form.data_volta_min} a ${form.data_volta_max}`)
      if (comentario) partes.push(comentario)

      const updateData = {
        origem: form.origem, destino: form.destino, bagagem: form.bagagem,
        data_ida: form.ida_flexivel ? null : form.data_ida,
        data_volta: form.volta_flexivel ? null : form.data_volta,
        cidade: form.cidade, checkin: form.checkin, checkout: form.checkout,
        observacoes: partes.length ? partes.join(' · ') : form.observacoes,
      }
      await supabase.from('demandas').update(updateData).eq('id', demanda.id)
      await onEnviar(comentario || 'Revisão solicitada')
    } finally { setSalvando(false) }
  }

  const isViagem = demanda.tipo === 'aereo' || demanda.tipo === 'rodoviario'

  return (
    <div className="card p-5 mt-4" style={{ borderColor: '#FDE68A', background: '#FFFBEB' }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: '#92400E' }}>
        ✏️ Editar solicitação para revisão
      </h3>
      <div className="space-y-4">
        {isViagem && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Origem</label>
                <input className="input" value={form.origem} onChange={e => set('origem', e.target.value)} /></div>
              <div><label className="label">Destino</label>
                <input className="input" value={form.destino} onChange={e => set('destino', e.target.value)} /></div>
            </div>

            {/* Data ida com toggle flexível */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Data de ida</label>
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
                <input type="date" className="input" value={form.data_ida} onChange={e => set('data_ida', e.target.value)} />
              )}
            </div>

            {/* Data volta com toggle flexível */}
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
                <input type="date" className="input" value={form.data_volta} onChange={e => set('data_volta', e.target.value)} />
              )}
            </div>

            {demanda.tipo === 'aereo' && (
              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#F8F9FA', border: '1px solid #E5E7EB' }}>
                <input type="checkbox" id="bag_rev" checked={form.bagagem} onChange={e => set('bagagem', e.target.checked)}
                  className="w-4 h-4" style={{ accentColor: '#C0186A' }} />
                <label htmlFor="bag_rev" className="text-sm cursor-pointer" style={{ color: '#1A1614' }}>Bagagem despachada</label>
              </div>
            )}
          </>
        )}
        {demanda.tipo === 'hospedagem' && (
          <>
            <div><label className="label">Cidade</label>
              <input className="input" value={form.cidade} onChange={e => set('cidade', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Check-in</label>
                <input type="date" className="input" value={form.checkin} onChange={e => set('checkin', e.target.value)} /></div>
              <div><label className="label">Check-out</label>
                <input type="date" className="input" value={form.checkout} onChange={e => set('checkout', e.target.value)} /></div>
            </div>
          </>
        )}
        <div>
          <label className="label">Observações / motivo da revisão <span className="text-gray-400 font-normal">(opcional)</span></label>
          <textarea className="input resize-none" rows={3}
            placeholder="Explique o que precisa ser alterado..."
            value={comentario} onChange={e => setComentario(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button onClick={onCancelar} className="btn-secondary">Cancelar</button>
        <button onClick={enviar} disabled={salvando} className="btn-primary">
          {salvando ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
          Enviar para revisão
        </button>
      </div>
    </div>
  )
}

function OpcaoCard({ opcao, selecionada, onSelecionar, podeSel }) {
  return (
    <div className="rounded-xl border-2 p-4 transition-all cursor-pointer"
      style={{
        borderColor: selecionada ? '#C0186A' : '#E5E7EB',
        background: selecionada ? '#fdf2f8' : 'white',
      }}
      onClick={() => podeSel && onSelecionar(opcao.id)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {selecionada && <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#C0186A', color: 'white' }}>✓ Selecionado</span>}
            <p className="text-sm font-semibold" style={{ color: '#1A1614' }}>{opcao.companhia}</p>
          </div>
          {opcao.descricao && <p className="text-sm mb-1" style={{ color: '#6B7280' }}>{opcao.descricao}</p>}
          <div className="flex flex-wrap gap-3 text-xs" style={{ color: '#6B7280' }}>
            {opcao.horario_ida && <span>🛫 {opcao.horario_ida}</span>}
            {opcao.horario_volta && <span>🛬 {opcao.horario_volta}</span>}
          </div>
          {opcao.reembolso && <p className="text-xs mt-1" style={{ color: '#6B7280' }}>Reembolso: {opcao.reembolso}</p>}
          {opcao.remarcacao && <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>Remarcação: {opcao.remarcacao}</p>}
        </div>
        <div className="text-right flex-shrink-0">
          {opcao.preco_venda && (
            <div>
              <p className="text-xl font-bold" style={{ color: '#1A1614' }}>{moeda(opcao.preco_venda)}</p>
              <p className="text-xs" style={{ color: '#9CA3AF' }}>🎫 Tarifado</p>
            </div>
          )}
          {opcao.preco_milha && (
            <div className="mt-1">
              <p className="text-xl font-bold" style={{ color: '#5B2D8E' }}>{moeda(opcao.preco_milha)}</p>
              <p className="text-xs" style={{ color: '#5B2D8E' }}>✦ Com milha</p>
            </div>
          )}
        </div>
      </div>
      {opcao.imagem_print_url && (
        <a href={opcao.imagem_print_url} target="_blank" rel="noreferrer"
          className="mt-2 text-xs hover:underline block" style={{ color: '#C0186A' }}>
          Ver print da consolidadora →
        </a>
      )}
    </div>
  )
}

export default function DetalheDemanda() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { perfil, isAgencia, isAprovador } = useAuth()

  const [demanda, setDemanda]     = useState(null)
  const [historico, setHistorico] = useState([])
  const [opcoes, setOpcoes]       = useState([])
  const [aprovacao, setAprovacao] = useState(null)
  const [bilhete, setBilhete]     = useState(null)
  const [loading, setLoading]     = useState(true)

  // Aprovação
  const [opcaoSelecionada, setOpcaoSelecionada] = useState(null)
  const [tipoEmissaoSel, setTipoEmissaoSel]     = useState(null)
  const [showConfirmAprovar, setShowConfirmAprovar] = useState(false)

  // Reprovar
  const [showReprovar, setShowReprovar]   = useState(false)
  const [motivoReprovar, setMotivoReprovar] = useState('')

  // Revisão
  const [showRevisao, setShowRevisao] = useState(false)

  // Upload
  const [uploadando, setUploadando] = useState(false)
  const [uploadData, setUploadData] = useState('')
  const [uploadHora, setUploadHora] = useState('')

  // Excluir
  const [showExcluir, setShowExcluir] = useState(false)
  const [excluindo, setExcluindo]     = useState(false)

  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    const [{ data: d }, { data: h }, { data: o }, { data: a }, { data: b }] = await Promise.all([
      supabase.from('demandas').select(`
        *, passageiros(nome, sobrenome, cpf, contato),
        demanda_passageiros(passageiros(nome, sobrenome, cpf, contato)),
        obras(nome, codigo),
        solicitante:perfis!solicitante_id(nome),
        agente:perfis!agente_id(nome)
      `).eq('id', id).single(),
      supabase.from('demanda_historico').select('*, usuario:perfis!usuario_id(nome)').eq('demanda_id', id).order('created_at'),
      supabase.from('opcoes').select('*').eq('demanda_id', id).order('created_at'),
      supabase.from('aprovacoes').select('*, opcao:opcoes(*)').eq('demanda_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('bilhetes').select('*').eq('demanda_id', id).maybeSingle(),
    ])
    setDemanda(d); setHistorico(h ?? []); setOpcoes(o ?? [])
    setAprovacao(a); setBilhete(b)
    setLoading(false)
    const now = new Date()
    setUploadData(now.toISOString().split('T')[0])
    setUploadHora(now.toTimeString().slice(0,5))
  }

  useEffect(() => { carregar() }, [id])

  async function aprovar() {
    if (!opcaoSelecionada || !tipoEmissaoSel) return
    setSalvando(true)
    try {
      await supabase.from('aprovacoes').insert({ demanda_id: id, opcao_id: opcaoSelecionada, aprovador_id: perfil.id, decisao: 'aprovado', comentario: tipoEmissaoSel })
      await supabase.from('demandas').update({ status: 'aprovado', aprovador_id: perfil.id }).eq('id', id)
      await supabase.from('demanda_historico').insert({ demanda_id: id, status_anterior: demanda.status, status_novo: 'aprovado', usuario_id: perfil.id })
      setShowConfirmAprovar(false); setOpcaoSelecionada(null); setTipoEmissaoSel(null)
      await carregar()
    } finally { setSalvando(false) }
  }

  async function desaprovar() {
    if (demanda.status === 'emitido') return
    setSalvando(true)
    try {
      await supabase.from('aprovacoes').insert({ demanda_id: id, aprovador_id: perfil.id, decisao: 'desaprovado', comentario: 'Aprovação desfeita' })
      await supabase.from('demandas').update({ status: 'aguardando_aprovacao', aprovador_id: null }).eq('id', id)
      await supabase.from('demanda_historico').insert({ demanda_id: id, status_anterior: 'aprovado', status_novo: 'aguardando_aprovacao', usuario_id: perfil.id, comentario: 'Aprovação desfeita pelo aprovador' })
      await carregar()
    } finally { setSalvando(false) }
  }

  async function reprovar() {
    setSalvando(true)
    try {
      await supabase.from('aprovacoes').insert({ demanda_id: id, aprovador_id: perfil.id, decisao: 'rejeitado', comentario: motivoReprovar || null })
      await supabase.from('demandas').update({ status: 'rejeitado' }).eq('id', id)
      await supabase.from('demanda_historico').insert({ demanda_id: id, status_anterior: demanda.status, status_novo: 'rejeitado', usuario_id: perfil.id, comentario: motivoReprovar || null })
      setShowReprovar(false); setMotivoReprovar('')
      await carregar()
    } finally { setSalvando(false) }
  }

  async function pedirRevisao(comentario) {
    await supabase.from('demandas').update({ status: 'aguardando_opcoes' }).eq('id', id)
    await supabase.from('demanda_historico').insert({ demanda_id: id, status_anterior: demanda.status, status_novo: 'aguardando_opcoes', usuario_id: perfil.id, comentario: comentario ? `Revisão: ${comentario}` : 'Revisão solicitada' })
    setShowRevisao(false)
    await carregar()
  }

  async function uploadVoucher(file) {
    if (!file) return
    setUploadando(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `vouchers/${id}.${ext}`
      const { error } = await supabase.storage.from('prints').upload(path, file, { upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('prints').getPublicUrl(path)
      const emitidoEm = new Date(`${uploadData}T${uploadHora}:00`).toISOString()
      await supabase.from('bilhetes').upsert({ demanda_id: id, voucher_url: publicUrl, emitido_por: perfil.id, emitido_em: emitidoEm })
      await supabase.from('demandas').update({ status: 'emitido' }).eq('id', id)
      await supabase.from('demanda_historico').insert({ demanda_id: id, status_anterior: 'aprovado', status_novo: 'emitido', usuario_id: perfil.id })
      await carregar()
    } catch (err) { alert('Erro no upload: ' + err.message)
    } finally { setUploadando(false) }
  }

  async function excluirDemanda() {
    setExcluindo(true)
    await supabase.from('demanda_historico').delete().eq('demanda_id', id)
    await supabase.from('demandas').delete().eq('id', id)
    navigate('/app/demandas')
  }

  if (loading) return <div className="flex items-center justify-center h-full py-32"><Loader2 size={28} className="animate-spin text-gray-300" /></div>
  if (!demanda) return <div className="p-8 text-gray-500">Demanda não encontrada.</div>

  const pax = demanda.passageiros
  const podAprovar = isAprovador && demanda.status === 'aguardando_aprovacao'
  const podeExcluir = demanda.status === 'aguardando_opcoes' && (perfil?.id === demanda.solicitante_id || isAprovador)
  const podeDesaprovar = isAprovador && demanda.status === 'aprovado' && demanda.status !== 'emitido'

  const tsOpcoes   = historico.find(h => h.status_novo === 'aguardando_aprovacao')?.created_at
  const tsAprovado = historico.find(h => h.status_novo === 'aprovado')?.created_at
  const tsEmitido  = historico.find(h => h.status_novo === 'emitido')?.created_at

  return (
    <div className="p-8 max-w-3xl">
      {/* Confirm Aprovar Modal */}
      {showConfirmAprovar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold mb-2" style={{ color: '#1A1614' }}>Confirmar aprovação</h2>
            <p className="text-sm mb-1" style={{ color: '#6B7280' }}>
              Opção: <strong>{opcoes.find(o => o.id === opcaoSelecionada)?.companhia}</strong>
            </p>
            <p className="text-sm mb-5" style={{ color: '#6B7280' }}>
              Emissão: <strong>{tipoEmissaoSel === 'milha' ? '✦ Milha' : '🎫 Tarifado'}</strong>
            </p>
            <p className="text-xs p-3 rounded-lg mb-4" style={{ background: '#FEF3C7', color: '#92400E' }}>
              Após confirmar, a aprovação só poderá ser desfeita enquanto o bilhete não for emitido.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmAprovar(false)} className="btn-secondary flex-1">Voltar</button>
              <button onClick={aprovar} disabled={salvando} className="btn-primary flex-1 justify-center">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Excluir Modal */}
      {showExcluir && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold mb-2" style={{ color: '#1A1614' }}>Excluir solicitação</h2>
            <p className="text-sm mb-5" style={{ color: '#6B7280' }}>Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowExcluir(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={excluirDemanda} disabled={excluindo} className="btn-danger flex-1 justify-center">
                {excluindo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="btn-secondary px-2"><ChevronLeft size={16} /></button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <TipoBadge tipo={demanda.tipo} />
            <StatusBadge status={demanda.status} />
          </div>
          <h1 className="text-xl font-bold mt-1" style={{ color: '#1A1614' }}>
            {demanda.tipo === 'hospedagem' ? `Hospedagem em ${demanda.cidade}`
              : demanda.tipo === 'posvenda' ? 'Pós-venda'
              : `${demanda.origem} → ${demanda.destino}`}
          </h1>
        </div>
        {podeExcluir && (
          <button onClick={() => setShowExcluir(true)} className="btn-secondary flex items-center gap-2 text-red-500 hover:text-red-700">
            <Trash2 size={15} /> Excluir
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">

          {/* Dados da viagem */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-4" style={{ color: '#1A1614' }}>Dados da viagem</h2>
            <div className="grid grid-cols-2 gap-4">
              {demanda.tipo !== 'hospedagem' && demanda.tipo !== 'posvenda' ? (
                <>
                  <InfoRow icon={MapPin} label="Origem" value={demanda.origem} />
                  <InfoRow icon={MapPin} label="Destino" value={demanda.destino} />
                  <InfoRow icon={Calendar} label="Data de ida" value={fmtData(demanda.data_ida)} />
                  <InfoRow icon={Calendar} label="Data de volta" value={fmtData(demanda.data_volta) || 'Somente ida'} />
                  {demanda.tipo === 'aereo' && <InfoRow icon={Luggage} label="Bagagem despachada" value={demanda.bagagem ? 'Sim' : 'Não'} />}
                </>
              ) : demanda.tipo === 'hospedagem' ? (
                <>
                  <InfoRow icon={MapPin} label="Cidade" value={demanda.cidade} />
                  <InfoRow icon={Calendar} label="Check-in" value={fmtData(demanda.checkin)} />
                  <InfoRow icon={Calendar} label="Check-out" value={fmtData(demanda.checkout)} />
                </>
              ) : (
                <div className="col-span-2 text-sm" style={{ color: '#1A1614' }}>{demanda.observacoes}</div>
              )}
            </div>
            {demanda.observacoes && demanda.tipo !== 'posvenda' && (
              <div className="mt-4 p-3 rounded-lg text-sm" style={{ background: '#FEF3C7', color: '#E8820C' }}>
                💬 {demanda.observacoes}
              </div>
            )}
          </div>

          {/* Opções */}
          {opcoes.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold mb-4" style={{ color: '#1A1614' }}>
                Opções disponíveis
                <span className="ml-2 text-xs font-normal" style={{ color: '#9CA3AF' }}>{opcoes.length} opção(ões)</span>
              </h2>

              {/* Seleção de opção */}
              {podAprovar && (
                <p className="text-xs mb-3" style={{ color: '#6B7280' }}>
                  Clique em uma opção para selecioná-la, depois escolha o tipo de emissão.
                </p>
              )}

              <div className="space-y-3">
                {opcoes.map(op => (
                  <OpcaoCard key={op.id} opcao={op}
                    selecionada={opcaoSelecionada === op.id || aprovacao?.opcao_id === op.id}
                    podeSel={podAprovar}
                    onSelecionar={id => {
                      setOpcaoSelecionada(id === opcaoSelecionada ? null : id)
                      setTipoEmissaoSel(null)
                    }} />
                ))}
              </div>

              {/* Tipo emissão + Confirmar — aparece só quando opção está selecionada */}
              {podAprovar && opcaoSelecionada && (
                <div className="mt-4 p-4 rounded-xl border" style={{ borderColor: '#C0186A', background: '#fdf2f8' }}>
                  <p className="text-xs font-semibold mb-3" style={{ color: '#C0186A' }}>Como emitir?</p>
                  {(() => {
                    const op = opcoes.find(o => o.id === opcaoSelecionada)
                    const temMilha = !!op?.preco_milha
                    const temTarifado = !!op?.preco_venda
                    // If only one type exists, auto-select it
                    const tipoEfetivo = tipoEmissaoSel ?? (temTarifado && !temMilha ? 'tarifado' : temMilha && !temTarifado ? 'milha' : null)
                    return (
                      <>
                        <div className="flex gap-2 flex-wrap mb-3">
                          {temTarifado && (
                            <button onClick={() => setTipoEmissaoSel('tarifado')}
                              className="py-1.5 px-3 rounded-lg border text-sm font-medium transition-all"
                              style={{
                                borderColor: tipoEfetivo === 'tarifado' ? '#C0186A' : '#E5E7EB',
                                background: tipoEfetivo === 'tarifado' ? '#C0186A' : 'white',
                                color: tipoEfetivo === 'tarifado' ? 'white' : '#1A1614',
                              }}>
                              🎫 Tarifado — {moeda(op?.preco_venda)}
                            </button>
                          )}
                          {temMilha && (
                            <button onClick={() => setTipoEmissaoSel('milha')}
                              className="py-1.5 px-3 rounded-lg border text-sm font-medium transition-all"
                              style={{
                                borderColor: tipoEfetivo === 'milha' ? '#5B2D8E' : '#E5E7EB',
                                background: tipoEfetivo === 'milha' ? '#5B2D8E' : 'white',
                                color: tipoEfetivo === 'milha' ? 'white' : '#1A1614',
                              }}>
                              ✦ Milha — {moeda(op?.preco_milha)}
                            </button>
                          )}
                        </div>
                        <button onClick={() => { setTipoEmissaoSel(tipoEfetivo); setShowConfirmAprovar(true) }}
                          disabled={!tipoEfetivo}
                          className="btn-primary disabled:opacity-40">
                          <CheckCircle size={15} /> Aprovar solicitação
                        </button>
                      </>
                    )
                  })()}
                </div>
              )}

              {/* Ações secundárias */}
              {podAprovar && (
                <div className="mt-4 pt-4 flex gap-2 flex-wrap" style={{ borderTop: '1px solid #F3F4F6' }}>
                  <button onClick={() => { setShowRevisao(!showRevisao); setShowReprovar(false) }}
                    className="btn-secondary flex items-center gap-2">
                    <RotateCcw size={14} /> Pedir revisão
                  </button>
                  <button onClick={() => { setShowReprovar(!showReprovar); setShowRevisao(false) }}
                    className="btn-danger flex items-center gap-2">
                    <XCircle size={14} /> Reprovar
                  </button>
                </div>
              )}

              {/* Form Reprovar */}
              {showReprovar && (
                <div className="mt-3 p-4 rounded-xl border space-y-3" style={{ borderColor: '#FECACA', background: '#FEF2F2' }}>
                  <textarea className="input resize-none" rows={3} placeholder="Motivo da reprovação (opcional)"
                    value={motivoReprovar} onChange={e => setMotivoReprovar(e.target.value)} />
                  <div className="flex gap-2">
                    <button onClick={() => setShowReprovar(false)} className="btn-secondary">Cancelar</button>
                    <button onClick={reprovar} disabled={salvando} className="btn-danger">
                      {salvando ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Confirmar reprovação
                    </button>
                  </div>
                </div>
              )}

              {/* Form Revisão */}
              {showRevisao && (
                <FormRevisao demanda={demanda} perfil={perfil}
                  onEnviar={pedirRevisao}
                  onCancelar={() => setShowRevisao(false)} />
              )}
            </div>
          )}

          {/* Desaprovar */}
          {podeDesaprovar && (
            <div className="card p-4">
              <button onClick={desaprovar} disabled={salvando}
                className="btn-secondary flex items-center gap-2 text-sm" style={{ color: '#E8820C' }}>
                <RotateCcw size={14} /> Desfazer aprovação
              </button>
              <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>Disponível enquanto o bilhete não for emitido.</p>
            </div>
          )}

          {demanda.status === 'aguardando_opcoes' && (
            <div className="card p-5" style={{ borderStyle: 'dashed' }}>
              <p className="text-sm text-center py-4" style={{ color: '#9CA3AF' }}>Aguardando o agente enviar as opções de viagem...</p>
            </div>
          )}

          {/* Resultado da aprovação */}
          {aprovacao && (
            <div className="card p-4" style={{
              borderColor: aprovacao.decisao === 'aprovado' ? '#A7F3D0' : '#FECACA',
              background: aprovacao.decisao === 'aprovado' ? '#ECFDF5' : '#FEF2F2',
            }}>
              <div className="flex items-center gap-2 text-sm font-medium">
                {aprovacao.decisao === 'aprovado'
                  ? <CheckCircle size={16} style={{ color: '#059669' }} />
                  : <XCircle size={16} style={{ color: '#DC2626' }} />}
                <span style={{ color: aprovacao.decisao === 'aprovado' ? '#059669' : '#DC2626' }}>
                  {aprovacao.decisao === 'aprovado'
                    ? `Aprovado · ${aprovacao.comentario === 'milha' ? '✦ Milha' : '🎫 Tarifado'}`
                    : 'Reprovado'}
                </span>
              </div>
              {aprovacao.comentario && aprovacao.decisao !== 'aprovado' && (
                <p className="text-sm mt-1" style={{ color: '#6B7280' }}>{aprovacao.comentario}</p>
              )}
            </div>
          )}

          {/* Upload voucher */}
          {isAgencia && demanda.status === 'aprovado' && (
            <div className="card p-5" style={{ borderColor: '#A7F3D0', background: '#ECFDF5' }}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#D1FAE5' }}>
                  <Upload size={16} style={{ color: '#059669' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold mb-1" style={{ color: '#065F46' }}>
                    Aprovado · {aprovacao?.comentario === 'milha' ? '✦ Milha' : '🎫 Tarifado'} — faça o upload do voucher
                  </p>
                  <p className="text-xs mb-2" style={{ color: '#059669' }}>Data/hora de emissão:</p>
                  <div className="flex gap-2 mb-3">
                    <input type="date" className="input" style={{ maxWidth: 160 }}
                      value={uploadData} onChange={e => setUploadData(e.target.value)} />
                    <input type="time" className="input" style={{ maxWidth: 120 }}
                      value={uploadHora} onChange={e => setUploadHora(e.target.value)} />
                  </div>
                  <label className="cursor-pointer">
                    <div className={`btn-primary inline-flex ${uploadando ? 'opacity-60 pointer-events-none' : ''}`}>
                      {uploadando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      {uploadando ? 'Enviando...' : 'Selecionar voucher (PDF ou imagem)'}
                    </div>
                    <input type="file" accept=".pdf,image/*" className="hidden"
                      onChange={e => uploadVoucher(e.target.files[0])} />
                  </label>
                </div>
              </div>
            </div>
          )}

          {demanda.status === 'emitido' && bilhete && (
            <div className="card p-4" style={{ borderColor: '#E5E7EB' }}>
              <div className="flex items-center gap-2 text-sm font-medium mb-1" style={{ color: '#059669' }}>
                <CheckCircle size={16} /> Voucher emitido
              </div>
              <p className="text-xs" style={{ color: '#9CA3AF' }}>Emitido em {fmtTs(bilhete.emitido_em)}</p>
              {bilhete.voucher_url && (
                <a href={bilhete.voucher_url} target="_blank" rel="noreferrer"
                  className="text-xs mt-1 hover:underline block" style={{ color: '#C0186A' }}>
                  Ver voucher →
                </a>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {(() => {
            const todosOsPax = (demanda.demanda_passageiros ?? []).map(r => r.passageiros).filter(Boolean)
            const paxExibir = todosOsPax.length > 0 ? todosOsPax : pax ? [pax] : []
            if (paxExibir.length === 0) return null
            return (
              <div className="card p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#9CA3AF' }}>
                  Passageiro{paxExibir.length > 1 ? 's' : ''} ({paxExibir.length})
                </h3>
                <div className="space-y-3">
                  {paxExibir.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#fdf2f8' }}>
                        <User size={12} style={{ color: '#C0186A' }} />
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: '#1A1614' }}>{p.nome} {p.sobrenome}</p>
                        {p.cpf && <p className="text-xs" style={{ color: '#9CA3AF' }}>CPF: {p.cpf}</p>}
                        {p.contato && <p className="text-xs" style={{ color: '#6B7280' }}>{p.contato}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          <div className="card p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#9CA3AF' }}>Informações</h3>
            <InfoRow icon={User} label="Solicitante" value={demanda.solicitante?.nome} />
            {demanda.obras && <InfoRow icon={Building2} label="Centro de custo" value={demanda.obras.nome} />}
            {demanda.agente && <InfoRow icon={User} label="Agente" value={demanda.agente.nome} />}
            <InfoRow icon={Clock} label="Solicitação criada" value={fmtTs(demanda.created_at)} />
            {tsOpcoes   && <InfoRow icon={Clock} label="Opções enviadas"  value={fmtTs(tsOpcoes)} />}
            {tsAprovado && <InfoRow icon={CheckCircle} label="Aprovado em" value={fmtTs(tsAprovado)} />}
            {tsEmitido  && <InfoRow icon={CheckCircle} label="Emitido em"  value={fmtTs(tsEmitido)} />}
          </div>

          <div className="card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#9CA3AF' }}>Histórico</h3>
            <div className="space-y-3">
              {historico.map((h, i) => (
                <div key={h.id} className="flex gap-2">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#C0186A' }} />
                    {i < historico.length - 1 && <div className="w-px flex-1 mt-1" style={{ background: '#F3F4F6' }} />}
                  </div>
                  <div className="pb-3">
                    <p className="text-xs font-medium" style={{ color: '#1A1614' }}>{h.status_novo?.replace(/_/g, ' ')}</p>
                    <p className="text-xs" style={{ color: '#9CA3AF' }}>{h.usuario?.nome} · {fmtTs(h.created_at)}</p>
                    {h.comentario && <p className="text-xs mt-0.5 italic" style={{ color: '#6B7280' }}>"{h.comentario}"</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
