import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import StatusBadge from '../../components/ui/StatusBadge'
import TipoBadge from '../../components/ui/TipoBadge'
import { Loader2, Send, Plus, X, Image, MapPin, Calendar, MessageSquare } from 'lucide-react'
import { fmtTs, fmtData, fmtDataCurta } from '../../lib/datetime'

// fmt -> use fmtData from lib/datetime

const OPCAO_VAZIA = () => ({
  descricao: '', companhia: '',
  saida_data: '', saida_hora: '',
  chegada_data: '', chegada_hora: '',
  volta_saida_data: '', volta_saida_hora: '',
  volta_chegada_data: '', volta_chegada_hora: '',
  preco_venda: '', preco_milha: '',
  reembolso: '', remarcacao: '',
  imagem_file: null, imagem_preview: null, imagem_print_url: null,
})


function PostVendaOpcaoForm({ op, idx, setOpcao, demanda }) {
  // Detect posvenda subtype from observacoes
  const obs = (demanda.observacoes ?? '').toLowerCase()
  const isBagagem    = obs.includes('bagagem')
  const isRemarcacao = obs.includes('remarca')
  const isReembolso  = obs.includes('reembolso')
  const isAssento    = obs.includes('assento')

  if (isBagagem || isAssento) {
    return (
      <div className="space-y-3">
        <div>
          <label className="label">Valor *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#9CA3AF' }}>R$</span>
            <input className="input pl-8" placeholder="0,00"
              value={op.preco_venda} onChange={e => setOpcao(idx, 'preco_venda', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Descrição <span className="font-normal" style={{ color: '#9CA3AF' }}>(opcional)</span></label>
          <input className="input" placeholder={isBagagem ? "Ex: 23kg, porão" : "Ex: poltrona 12A, corredor"}
            value={op.descricao} onChange={e => setOpcao(idx, 'descricao', e.target.value)} />
        </div>
      </div>
    )
  }

  if (isRemarcacao) {
    return (
      <div className="space-y-3">
        <div>
          <label className="label">Companhia</label>
          <input className="input" placeholder="Ex: LATAM, Gontijo..."
            value={op.companhia} onChange={e => setOpcao(idx, 'companhia', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Nova saída</label>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="input" value={op.saida_data} onChange={e => setOpcao(idx, 'saida_data', e.target.value)} />
              <input type="time" className="input" value={op.saida_hora} onChange={e => setOpcao(idx, 'saida_hora', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Nova chegada</label>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="input" value={op.chegada_data} onChange={e => setOpcao(idx, 'chegada_data', e.target.value)} />
              <input type="time" className="input" value={op.chegada_hora} onChange={e => setOpcao(idx, 'chegada_hora', e.target.value)} />
            </div>
          </div>
        </div>
        <div>
          <label className="label">Valor da remarcação *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#9CA3AF' }}>R$</span>
            <input className="input pl-8" placeholder="0,00 ou Não remarcável"
              value={op.preco_venda} onChange={e => setOpcao(idx, 'preco_venda', e.target.value)} />
          </div>
        </div>
      </div>
    )
  }

  if (isReembolso) {
    return (
      <div className="space-y-3">
        <div>
          <label className="label">Valor total do reembolso *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#9CA3AF' }}>R$</span>
            <input className="input pl-8" placeholder="0,00 ou Não reembolsável"
              value={op.preco_venda} onChange={e => setOpcao(idx, 'preco_venda', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Observação <span className="font-normal" style={{ color: '#9CA3AF' }}>(opcional)</span></label>
          <input className="input" placeholder="Ex: prazo 30 dias, reembolso parcial..."
            value={op.descricao} onChange={e => setOpcao(idx, 'descricao', e.target.value)} />
        </div>
      </div>
    )
  }

  // Outros / genérico
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Valor <span className="font-normal" style={{ color: '#9CA3AF' }}>(se aplicável)</span></label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#9CA3AF' }}>R$</span>
          <input className="input pl-8" placeholder="0,00"
            value={op.preco_venda} onChange={e => setOpcao(idx, 'preco_venda', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Descrição *</label>
        <textarea className="input resize-none" rows={3} placeholder="Descreva a resposta/solução..."
          value={op.descricao} onChange={e => setOpcao(idx, 'descricao', e.target.value)} />
      </div>
    </div>
  )
}

export default function FilaOpcoes() {
  const { perfil } = useAuth()
  const [demandas, setDemandas] = useState([])
  const [loading, setLoading]   = useState(true)
  const [demandaAtiva, setDemandaAtiva] = useState(null)
  const [opcoes, setOpcoes]     = useState([OPCAO_VAZIA()])
  const [enviando, setEnviando] = useState(false)
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('demandas')
        .select(`
          id, tipo, status, origem, destino, data_ida, data_volta,
          cidade, checkin, checkout, observacoes, bagagem, created_at,
          passageiros(nome, sobrenome),
          obras(nome),
          solicitante:perfis!solicitante_id(nome),
          empresas(nome)
        `)
        .in('status', ['aguardando_opcoes', 'aguardando_aprovacao'])
        .order('data_ida', { ascending: true, nullsFirst: false })

      // Existing options reload happens lazily on selection (only for already-submitted demandas)

      // Sort: viagem by data_ida, hospedagem by checkin, nulls last
      const sorted = (data ?? []).sort((a, b) => {
        const da = a.data_ida || a.checkin || '9999'
        const db = b.data_ida || b.checkin || '9999'
        return da.localeCompare(db)
      })
      setDemandas(sorted)
      setLoading(false)
    }
    load()
  }, [])

  function setOpcao(idx, field, value) {
    setOpcoes(prev => prev.map((o, i) => i === idx ? { ...o, [field]: value } : o))
  }
  function adicionarOpcao() { setOpcoes(prev => [...prev, OPCAO_VAZIA()]) }
  function removerOpcao(idx) { setOpcoes(prev => prev.filter((_, i) => i !== idx)) }

  function handleImagem(idx, file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => setOpcao(idx, 'imagem_preview', e.target.result)
    reader.readAsDataURL(file)
    setOpcao(idx, 'imagem_file', file)
  }

  // Converte uma linha do banco (tabela opcoes) de volta para o formato do formulário
  function dbToForm(row) {
    const split = (ts) => {
      if (!ts) return ['', '']
      const [d, t] = ts.split(' ')
      return [d || '', (t || '').slice(0, 5)]
    }
    const [saida_data, saida_hora]               = split(row.horario_ida)
    const [chegada_data, chegada_hora]           = split(row.horario_volta)
    const [volta_saida_data, volta_saida_hora]   = split(row.horario_volta_saida)
    const [volta_chegada_data, volta_chegada_hora] = split(row.horario_volta_chegada)
    return {
      descricao: row.descricao ?? '', companhia: row.companhia ?? '',
      saida_data, saida_hora,
      chegada_data, chegada_hora,
      volta_saida_data, volta_saida_hora,
      volta_chegada_data, volta_chegada_hora,
      preco_venda: row.preco_venda != null ? String(row.preco_venda) : '',
      preco_milha: row.preco_milha != null ? String(row.preco_milha) : '',
      reembolso: row.reembolso ?? '', remarcacao: row.remarcacao ?? '',
      imagem_file: null,
      imagem_preview: row.imagem_print_url ?? null,
      imagem_print_url: row.imagem_print_url ?? null,
    }
  }

  // Seleciona a demanda; se já estiver enviada, carrega as opções existentes para edição
  async function selecionarDemanda(d) {
    setDemandaAtiva(d)
    if (d.status === 'aguardando_aprovacao') {
      setCarregandoOpcoes(true)
      const { data } = await supabase
        .from('opcoes')
        .select('id, descricao, companhia, horario_ida, horario_volta, horario_volta_saida, horario_volta_chegada, preco_venda, preco_milha, reembolso, remarcacao, imagem_print_url')
        .eq('demanda_id', d.id)
        .order('id', { ascending: true })
      const mapeadas = (data ?? []).map(dbToForm)
      setOpcoes(mapeadas.length ? mapeadas : [OPCAO_VAZIA()])
      setCarregandoOpcoes(false)
    } else {
      setOpcoes([OPCAO_VAZIA()])
    }
  }

  // Monta o payload das opções (faz upload de prints novos, preserva os já existentes)
  async function montarPayload(lista) {
    return Promise.all(lista.map(async op => {
      let imagem_print_url = op.imagem_print_url || null
      if (op.imagem_file) {
        const ext = op.imagem_file.name.split('.').pop()
        const path = `opcoes/${demandaAtiva.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
        const { error } = await supabase.storage.from('prints').upload(path, op.imagem_file)
        if (!error) {
          const { data: { publicUrl } } = supabase.storage.from('prints').getPublicUrl(path)
          imagem_print_url = publicUrl
        }
      }
      return {
        demanda_id: demandaAtiva.id,
        descricao: op.descricao || null,
        companhia: op.companhia || null,
        horario_ida: op.saida_data ? `${op.saida_data} ${op.saida_hora || '00:00'}` : null,
        horario_volta: op.chegada_data ? `${op.chegada_data} ${op.chegada_hora || '00:00'}` : null,
        horario_volta_saida: op.volta_saida_data ? `${op.volta_saida_data} ${op.volta_saida_hora || '00:00'}` : null,
        horario_volta_chegada: op.volta_chegada_data ? `${op.volta_chegada_data} ${op.volta_chegada_hora || '00:00'}` : null,
        preco_venda: op.preco_venda ? parseFloat(op.preco_venda.toString().replace(',', '.')) : null,
        preco_milha: op.preco_milha ? parseFloat(op.preco_milha.toString().replace(',', '.')) : null,
        reembolso: op.reembolso || null,
        remarcacao: op.remarcacao || null,
        imagem_print_url,
      }
    }))
  }

  async function enviarOpcoes() {
    if (!demandaAtiva) return
    const isPosvenda = demandaAtiva.tipo === 'posvenda'
    const validas = opcoes.filter(o => isPosvenda ? (o.preco_venda || o.descricao) : o.companhia)
    if (validas.length === 0) {
      alert(isPosvenda
        ? 'Preencha ao menos uma opção (valor ou descrição).'
        : 'Adicione ao menos uma opção com companhia.')
      return
    }
    setEnviando(true)
    const editando = demandaAtiva.status === 'aguardando_aprovacao'
    try {
      const inserir = await montarPayload(validas)

      if (editando) {
        // Substitui as opções existentes; status permanece aguardando_aprovacao
        await supabase.from('opcoes').delete().eq('demanda_id', demandaAtiva.id)
        await supabase.from('opcoes').insert(inserir)
        await supabase.from('demanda_historico').insert({
          demanda_id: demandaAtiva.id, status_anterior: 'aguardando_aprovacao',
          status_novo: 'aguardando_aprovacao', usuario_id: perfil.id,
        })
      } else {
        await supabase.from('opcoes').insert(inserir)
        await supabase.from('demandas').update({ status: 'aguardando_aprovacao', agente_id: perfil.id }).eq('id', demandaAtiva.id)
        await supabase.from('demanda_historico').insert({
          demanda_id: demandaAtiva.id, status_anterior: 'aguardando_opcoes',
          status_novo: 'aguardando_aprovacao', usuario_id: perfil.id,
        })
        // Mantém na fila (agora editável) com o status local atualizado
        setDemandas(prev => prev.map(d => d.id === demandaAtiva.id ? { ...d, status: 'aguardando_aprovacao' } : d))
      }
      setDemandaAtiva(null); setOpcoes([OPCAO_VAZIA()])
    } catch (err) { alert('Erro ao salvar: ' + err.message)
    } finally { setEnviando(false) }
  }

  const dataEmbarque = (d) => d.data_ida || d.checkin

  return (
    <div className="flex h-full">
      {/* Lista */}
      <div className="w-80 border-r flex flex-col bg-white" style={{ borderColor: '#E5E7EB' }}>
        <div className="px-4 py-4 border-b" style={{ borderColor: '#E5E7EB' }}>
          <h1 className="text-base font-semibold" style={{ color: '#1A1614' }}>Demandas</h1>
          <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>
            {demandas.length} na fila
            {demandas.some(d => d.status === 'aguardando_aprovacao') &&
              ` · ${demandas.filter(d => d.status === 'aguardando_aprovacao').length} enviada(s)`}
          </p>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-gray-200" />
          </div>
        ) : demandas.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <p className="text-sm text-center" style={{ color: '#9CA3AF' }}>Nenhuma demanda aguardando.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {demandas.map(d => (
              <button key={d.id}
                onClick={() => selecionarDemanda(d)}
                className="w-full text-left px-4 py-3 border-b transition-colors hover:bg-gray-50"
                style={{
                  borderColor: '#F3F4F6',
                  borderLeft: demandaAtiva?.id === d.id ? '3px solid #C0186A' : '3px solid transparent',
                  background: demandaAtiva?.id === d.id ? '#fdf2f8' : 'white',
                }}>
                <div className="flex items-center justify-between mb-1">
                  <TipoBadge tipo={d.tipo} />
                  <span className="text-xs font-medium" style={{ color: '#C0186A' }}>
                    {dataEmbarque(d) ? `✈ ${fmtData(dataEmbarque(d))}` : ''}
                  </span>
                </div>
                <p className="text-sm font-medium truncate" style={{ color: '#1A1614' }}>
                  {d.passageiros?.nome} {d.passageiros?.sobrenome}
                </p>
                <p className="text-xs truncate" style={{ color: '#6B7280' }}>
                  {d.tipo === 'hospedagem' ? d.cidade 
                    : d.tipo === 'posvenda' ? (d.observacoes?.substring(0,30) ?? 'Pós-venda')
                    : `${d.origem ?? '?'} → ${d.destino ?? '?'}`}
                </p>
                {d.status === 'aguardando_aprovacao' && (
                  <span className="inline-block mt-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{ background: '#FEF3C7', color: '#E8820C' }}>
                    enviada · editável
                  </span>
                )}
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs" style={{ color: '#9CA3AF' }}>{d.empresas?.nome}</p>
                  <p className="text-xs" style={{ color: '#9CA3AF' }}>
                    {new Date(d.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Painel */}
      <div className="flex-1 overflow-y-auto" style={{ background: '#F8F9FA' }}>
        {!demandaAtiva ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: '#9CA3AF' }}>Selecione uma demanda para enviar opções</p>
          </div>
        ) : (
          <div className="p-6 max-w-2xl">
            {/* Info demanda */}
            <div className="card p-4 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <TipoBadge tipo={demandaAtiva.tipo} />
                <span className="text-sm font-semibold" style={{ color: '#1A1614' }}>
                  {demandaAtiva.passageiros?.nome} {demandaAtiva.passageiros?.sobrenome}
                </span>
                <span className="text-xs ml-auto" style={{ color: '#9CA3AF' }}>{demandaAtiva.empresas?.nome}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {demandaAtiva.tipo !== 'hospedagem' ? (
                  <>
                    <div className="flex gap-2" style={{ color: '#6B7280' }}>
                      <MapPin size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#9CA3AF' }} />
                      {demandaAtiva.origem} → {demandaAtiva.destino}
                    </div>
                    <div className="flex gap-2" style={{ color: '#6B7280' }}>
                      <Calendar size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#9CA3AF' }} />
                      {fmtData(demandaAtiva.data_ida)}{demandaAtiva.data_volta ? ` ↩ ${fmtData(demandaAtiva.data_volta)}` : ''}
                    </div>
                    {demandaAtiva.tipo === 'aereo' && (
                      <p className="text-xs" style={{ color: '#6B7280' }}>Bagagem: {demandaAtiva.bagagem ? 'Sim' : 'Não'}</p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex gap-2" style={{ color: '#6B7280' }}>
                      <MapPin size={14} className="mt-0.5" style={{ color: '#9CA3AF' }} />{demandaAtiva.cidade}
                    </div>
                    <div className="flex gap-2" style={{ color: '#6B7280' }}>
                      <Calendar size={14} className="mt-0.5" style={{ color: '#9CA3AF' }} />
                      {fmtData(demandaAtiva.checkin)} → {fmtData(demandaAtiva.checkout)}
                    </div>
                  </>
                )}
              </div>
              {demandaAtiva.observacoes && (
                <div className="mt-3 flex gap-2 text-sm p-2 rounded-lg" style={{ background: '#FEF3C7', color: '#E8820C' }}>
                  <MessageSquare size={14} className="mt-0.5 flex-shrink-0" />{demandaAtiva.observacoes}
                </div>
              )}
            </div>

            {demandaAtiva.status === 'aguardando_aprovacao' && (
              <div className="mb-4 flex gap-2 text-sm p-3 rounded-lg" style={{ background: '#FEF3C7', color: '#92610A' }}>
                <MessageSquare size={14} className="mt-0.5 flex-shrink-0" />
                Esta demanda já foi enviada para aprovação. Você pode ajustar as opções abaixo e salvar; as opções anteriores serão substituídas.
              </div>
            )}

            <h2 className="text-sm font-semibold mb-3" style={{ color: '#1A1614' }}>Opções de viagem</h2>

            {carregandoOpcoes ? (
              <div className="flex items-center gap-2 text-sm py-8 justify-center" style={{ color: '#9CA3AF' }}>
                <Loader2 size={16} className="animate-spin" /> Carregando opções enviadas...
              </div>
            ) : (
            <>
            <div className="space-y-4">
              {opcoes.map((op, idx) => (
                <div key={idx} className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium" style={{ color: '#1A1614' }}>Opção {idx + 1}</span>
                    {opcoes.length > 1 && (
                      <button onClick={() => removerOpcao(idx)} className="text-gray-300 hover:text-red-400">
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  {/* Para pós-venda: form adaptativo por tipo */}
                  {demandaAtiva.tipo === 'posvenda' ? (
                    <PostVendaOpcaoForm op={op} idx={idx} setOpcao={setOpcao} demanda={demandaAtiva} />
                  ) : (
                  <div>
                    <label className="label">Companhia *</label>
                    <input className="input" placeholder="Ex: LATAM, Gontijo..."
                      value={op.companhia} onChange={e => setOpcao(idx, 'companhia', e.target.value)} />
                  </div>
                  )}

                  {demandaAtiva.tipo !== 'posvenda' && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="label">Saída</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" className="input" value={op.saida_data} onChange={e => setOpcao(idx, 'saida_data', e.target.value)} />
                        <input type="time" className="input" value={op.saida_hora} onChange={e => setOpcao(idx, 'saida_hora', e.target.value)} />
                      </div>
                      {op.saida_data && demandaAtiva.data_ida && op.saida_data !== demandaAtiva.data_ida && (
                        <p className="text-xs mt-1 font-medium" style={{ color: '#E8820C' }}>
                          ⚠️ Data diferente da solicitada ({new Date(demandaAtiva.data_ida+'T12:00:00').toLocaleDateString('pt-BR', {timeZone:'America/Sao_Paulo'})})
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="label">Chegada</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" className="input" value={op.chegada_data} onChange={e => setOpcao(idx, 'chegada_data', e.target.value)} />
                        <input type="time" className="input" value={op.chegada_hora} onChange={e => setOpcao(idx, 'chegada_hora', e.target.value)} />
                      </div>
                    </div>
                  </div>

                  )} {/* end !posvenda saída/chegada */}

                  {/* Volta */}
                  {demandaAtiva.tipo !== 'posvenda' && demandaAtiva.data_volta && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid #F3F4F6' }}>
                      <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#9CA3AF' }}>Trecho de volta</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label">Saída (volta)</label>
                          <div className="grid grid-cols-2 gap-2">
                            <input type="date" className="input" value={op.volta_saida_data} onChange={e => setOpcao(idx, 'volta_saida_data', e.target.value)} />
                            <input type="time" className="input" value={op.volta_saida_hora} onChange={e => setOpcao(idx, 'volta_saida_hora', e.target.value)} />
                          </div>
                        </div>
                        <div>
                          <label className="label">Chegada (volta)</label>
                          <div className="grid grid-cols-2 gap-2">
                            <input type="date" className="input" value={op.volta_chegada_data} onChange={e => setOpcao(idx, 'volta_chegada_data', e.target.value)} />
                            <input type="time" className="input" value={op.volta_chegada_hora} onChange={e => setOpcao(idx, 'volta_chegada_hora', e.target.value)} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {demandaAtiva.tipo !== 'posvenda' && (<>
                  <div className="mt-3">
                    <label className="label">Descrição <span className="text-gray-400 font-normal">(opcional)</span></label>
                    <input className="input" placeholder="Ex: Voo direto, sem escala"
                      value={op.descricao} onChange={e => setOpcao(idx, 'descricao', e.target.value)} />
                  </div>

                  {/* Preços */}
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div>
                      <label className="label">Valor tarifado</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#9CA3AF' }}>R$</span>
                        <input className="input pl-8" placeholder="0,00"
                          value={op.preco_venda} onChange={e => setOpcao(idx, 'preco_venda', e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="label">Valor c/ milha <span className="font-normal" style={{ color: '#9CA3AF' }}>(opcional)</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#5B2D8E' }}>R$</span>
                        <input className="input pl-8" placeholder="0,00" style={{ borderColor: '#E5E7EB' }}
                          value={op.preco_milha} onChange={e => setOpcao(idx, 'preco_milha', e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="label">Print consolidadora</label>
                      <div
                        tabIndex={0}
                        onPaste={e => {
                          const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))
                          if (item) { e.preventDefault(); handleImagem(idx, item.getAsFile()) }
                        }}
                        className="relative rounded-lg border text-sm transition-colors cursor-pointer focus:outline-none"
                        style={{ borderColor: op.imagem_preview ? '#C0186A' : '#E5E7EB', background: op.imagem_preview ? '#fdf2f8' : 'white' }}
                      >
                        {op.imagem_preview ? (
                          <div className="relative">
                            <img src={op.imagem_preview} alt="preview"
                              className="w-full h-24 object-cover rounded-lg" />
                            <button type="button"
                              onClick={() => { setOpcao(idx, 'imagem_preview', null); setOpcao(idx, 'imagem_file', null) }}
                              className="absolute top-1 right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow"
                              style={{ color: '#C0186A' }}>
                              <X size={11} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-1 py-3 px-2 text-center">
                            <Image size={16} style={{ color: '#9CA3AF' }} />
                            <span className="text-xs" style={{ color: '#9CA3AF' }}>Ctrl+V para colar</span>
                            <label className="text-xs cursor-pointer hover:underline" style={{ color: '#C0186A' }}>
                              ou clique para anexar
                              <input type="file" accept="image/*" className="hidden"
                                onChange={e => handleImagem(idx, e.target.files[0])} />
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  </> )} {/* end descrição+preços */}

                  {demandaAtiva.tipo !== 'posvenda' && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="label">Reembolso <span className="font-normal" style={{ color: '#9CA3AF' }}>(opcional)</span></label>
                      <input className="input" placeholder="Ex: Não reembolsável / R$ 50"
                        value={op.reembolso} onChange={e => setOpcao(idx, 'reembolso', e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Remarcação <span className="font-normal" style={{ color: '#9CA3AF' }}>(opcional)</span></label>
                      <input className="input" placeholder="Ex: Não remarcável / multa 20%"
                        value={op.remarcacao} onChange={e => setOpcao(idx, 'remarcacao', e.target.value)} />
                    </div>
                  </div>
                  )}
                </div>
              ))}
            </div>

            <button onClick={adicionarOpcao}
              className="btn-secondary w-full justify-center mt-3">
              <Plus size={15} /> Adicionar outra opção
            </button>

            <div className="flex justify-end mt-5">
              <button onClick={enviarOpcoes} disabled={enviando} className="btn-primary px-6">
                {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {enviando
                  ? 'Salvando...'
                  : demandaAtiva.status === 'aguardando_aprovacao'
                    ? 'Salvar alterações'
                    : 'Enviar opções para aprovação'}
              </button>
            </div>
            </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
