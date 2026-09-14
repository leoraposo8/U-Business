import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import StatusBadge from '../../components/ui/StatusBadge'
import TipoBadge from '../../components/ui/TipoBadge'
import { Loader2, Send, Plus, X, Image, MapPin, Calendar, MessageSquare, Wand2 } from 'lucide-react'
import { fmtTs, fmtData, fmtDataCurta } from '../../lib/datetime'
import { resolverAprovador } from '../../lib/aprovador'

// Config do proxy da IA de interpretacao de print (mesma da NovaProposta).
const API_BASE = import.meta.env.VITE_PROPOSTA_API_URL || '/proposta-api'
const API_KEY  = import.meta.env.VITE_PROPOSTA_API_KEY || ''

// Converte "dd/mm/aa" ou "dd/mm/aaaa" -> "yyyy-mm-dd". Vazio se falhar.
function ddmmaaToIso(s) {
  if (!s) return ''
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return ''
  let [_, d, mo, y] = m
  if (y.length === 2) y = '20' + y
  return `${y.padStart(4, '0')}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}
// Limpa "23:45 +1" -> "23:45"
function hhmmClean(s) {
  if (!s) return ''
  const m = String(s).match(/(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''
}
// Converte "18.000,00" ou "18000.50" -> number.
function parseNum(s) {
  if (s === '' || s == null) return null
  const n = parseFloat(String(s).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
  return Number.isNaN(n) ? null : n
}

// Componente que le o print via IA e devolve os campos (mesmo padrao da NovaProposta).
function PrintDropzone({ onCampos }) {
  const [lendo, setLendo] = useState(false)
  const [erro, setErro]   = useState('')
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
    } catch (e) { setErro(e.message || 'falhou') }
    finally { setLendo(false) }
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
        className="rounded-lg border border-dashed text-center text-xs py-3 px-3 cursor-pointer flex items-center justify-center gap-2"
        style={{ borderColor: '#E5C4D6', color: '#9A6B85', background: '#FDF6FA' }}>
        <Wand2 size={13} />
        {lendo ? 'Lendo o print…' : 'Ler print da reserva (RF): clique aqui e cole, ou arraste a imagem'}
      </div>
      {erro && <p className="text-xs mt-1" style={{ color: '#B91C1C' }}>Print: {erro}</p>}
    </div>
  )
}

// Mapeia o retorno da IA (campos da NovaProposta) para o form do agente (opcao).
// Retorna um patch pra dar merge no state da opcao.
function campoParaOpcao(campos, temVolta) {
  const patch = {}
  if (campos.cia)     patch.companhia = campos.cia
  if (campos.bagagem) patch.descricao = `Bagagem: ${campos.bagagem}`

  const trechos = Array.isArray(campos.trechos) ? campos.trechos : []
  if (trechos.length > 0) {
    const primeiro = trechos[0]
    patch.saida_data   = ddmmaaToIso(primeiro.data)
    patch.saida_hora   = hhmmClean(primeiro.partida)
    // Se demanda so ida ou so 1 trecho: chegada = ultimo trecho
    // Se ida-e-volta: assume que a metade e ida e metade e volta.
    if (!temVolta || trechos.length === 1) {
      const ultimo = trechos[trechos.length - 1]
      patch.chegada_data = ddmmaaToIso(ultimo.data)
      patch.chegada_hora = hhmmClean(ultimo.chegada)
      // Escalas (se mais de 1 trecho)
      if (trechos.length > 1) {
        patch.escalas = trechos.slice(0, -1)
          .map(t => `${t.destino || ''}${t.conexao && t.conexao !== 'Direto' ? ` (${t.conexao})` : ''}`)
          .filter(Boolean).join(' → ')
      }
    } else {
      // ida = 1a metade; volta = 2a metade (heuristica)
      const meio = Math.ceil(trechos.length / 2)
      const idaFim  = trechos[meio - 1]
      patch.chegada_data = ddmmaaToIso(idaFim.data)
      patch.chegada_hora = hhmmClean(idaFim.chegada)
      const voltaIni = trechos[meio]
      const voltaFim = trechos[trechos.length - 1]
      if (voltaIni) {
        patch.volta_saida_data = ddmmaaToIso(voltaIni.data)
        patch.volta_saida_hora = hhmmClean(voltaIni.partida)
      }
      if (voltaFim) {
        patch.volta_chegada_data = ddmmaaToIso(voltaFim.data)
        patch.volta_chegada_hora = hhmmClean(voltaFim.chegada)
      }
      // Escalas: se ida tem mais de 1 trecho, ou volta idem, junta
      const escIda = trechos.slice(0, meio - 1).map(t => t.destino || '').filter(Boolean).join(' → ')
      const escVolta = trechos.slice(meio, -1).map(t => t.destino || '').filter(Boolean).join(' → ')
      const pedacos = [
        escIda   ? `Ida: ${escIda}`     : '',
        escVolta ? `Volta: ${escVolta}` : '',
      ].filter(Boolean)
      if (pedacos.length) patch.escalas = pedacos.join(' · ')
    }
  }

  // Preco em BRL: (tarifa + taxas) * cambio, ambos em USD (ou moeda original)
  const tarifa = parseNum(campos.tarifa)
  const taxas  = parseNum(campos.taxas)
  const cambio = parseNum(campos.cambio) || 1
  if (tarifa != null || taxas != null) {
    const totalBrl = ((tarifa || 0) + (taxas || 0)) * cambio
    if (totalBrl > 0) patch.preco_venda = totalBrl.toFixed(2).replace('.', ',')
  }

  return patch
}

// fmt -> use fmtData from lib/datetime

const OPCAO_VAZIA = () => ({
  descricao: '', companhia: '', escalas: '',
  trecho: 'ida_e_volta',   // 'ida' | 'volta' | 'ida_e_volta'
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
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [demandas, setDemandas] = useState([])
  const [loading, setLoading]   = useState(true)
  const [demandaAtiva, setDemandaAtiva] = useState(null)
  const [opcoes, setOpcoes]     = useState([OPCAO_VAZIA()])
  const [enviando, setEnviando] = useState(false)
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(false)

  useEffect(() => {
    const SELECT = `
      id, tipo, status, empresa_id, obra_id, origem, destino, data_ida, data_volta,
      cidade, checkin, checkout, observacoes, bagagem, created_at,
      solicitante_id, aprovador_id, proximo_aprovador_nivel,
      passageiros(nome, sobrenome),
      obras(nome),
      solicitante:perfis!solicitante_id(nome),
      empresas(nome)
    `
    async function load() {
      // Fila mostra só o que ainda está aguardando opções (enviadas saem da fila)
      const { data } = await supabase
        .from('demandas')
        .select(SELECT)
        .eq('status', 'aguardando_opcoes')
        .order('data_ida', { ascending: true, nullsFirst: false })

      // Sort: viagem by data_ida, hospedagem by checkin, nulls last
      const sorted = (data ?? []).sort((a, b) => {
        const da = a.data_ida || a.checkin || '9999'
        const db = b.data_ida || b.checkin || '9999'
        return da.localeCompare(db)
      })
      setDemandas(sorted)
      setLoading(false)

      // Se veio de "Revisar opções" no detalhe, abre aquela demanda no editor (mesmo já enviada)
      const alvoId = searchParams.get('demanda')
      if (alvoId) {
        const { data: alvo } = await supabase
          .from('demandas').select(SELECT).eq('id', alvoId).maybeSingle()
        if (alvo) selecionarDemanda(alvo)
      }
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
      escalas: row.escalas ?? '',
      trecho: row.trecho ?? 'ida_e_volta',
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
        .select('id, descricao, companhia, escalas, trecho, horario_ida, horario_volta, horario_volta_saida, horario_volta_chegada, preco_venda, preco_milha, reembolso, remarcacao, imagem_print_url')
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
      // Se a demanda e so ida, forca trecho='ida' — usuario nem viu o dropdown
      const temVolta = !!demandaAtiva.data_volta
      const trecho = temVolta ? (op.trecho || 'ida_e_volta') : 'ida'
      const querIda   = trecho === 'ida' || trecho === 'ida_e_volta'
      const querVolta = trecho === 'volta' || trecho === 'ida_e_volta'
      return {
        demanda_id: demandaAtiva.id,
        descricao: op.descricao || null,
        companhia: op.companhia || null,
        escalas: op.escalas || null,
        trecho,
        horario_ida:           querIda   && op.saida_data         ? `${op.saida_data} ${op.saida_hora || '00:00'}` : null,
        horario_volta:         querIda   && op.chegada_data       ? `${op.chegada_data} ${op.chegada_hora || '00:00'}` : null,
        horario_volta_saida:   querVolta && op.volta_saida_data   ? `${op.volta_saida_data} ${op.volta_saida_hora || '00:00'}` : null,
        horario_volta_chegada: querVolta && op.volta_chegada_data ? `${op.volta_chegada_data} ${op.volta_chegada_hora || '00:00'}` : null,
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
    // Aereo/rodo/hosp/pacote: saida e chegada (data+hora) sao obrigatorias
    // do lado que o trecho da opcao cobre (ida, volta, ou ambos). Se a demanda
    // e so ida (sem data_volta), forca trecho='ida' independente do state.
    if (!isPosvenda) {
      const temVolta = !!demandaAtiva.data_volta
      const faltando = validas.findIndex(o => {
        const trecho = temVolta ? (o.trecho || 'ida_e_volta') : 'ida'
        if (trecho === 'ida' || trecho === 'ida_e_volta') {
          if (!o.saida_data || !o.saida_hora || !o.chegada_data || !o.chegada_hora) return true
        }
        if (trecho === 'volta' || trecho === 'ida_e_volta') {
          if (!o.volta_saida_data || !o.volta_saida_hora || !o.volta_chegada_data || !o.volta_chegada_hora) return true
        }
        return false
      })
      if (faltando !== -1) {
        alert(`Opção ${faltando + 1}: preencha saída (data+hora) e chegada (data+hora) do(s) trecho(s) selecionado(s).`)
        return
      }

      // Regra de mistura em demanda ida-e-volta:
      // (a) combo (todas 'ida_e_volta') — o aprovador escolhe 1 opcao
      // (b) separadas (mix de 'ida' e 'volta', pelo menos 1 de cada) — aprovador escolhe par
      // Nao pode misturar combo com separadas.
      if (temVolta) {
        const trechos = validas.map(o => o.trecho || 'ida_e_volta')
        const temCombo = trechos.some(t => t === 'ida_e_volta')
        const temIda   = trechos.some(t => t === 'ida')
        const temVoltaOp = trechos.some(t => t === 'volta')
        const modoSeparado = (temIda || temVoltaOp) && !temCombo
        if (temCombo && (temIda || temVoltaOp)) {
          alert('Voce misturou opcoes "Ida e volta (combo)" com "so ida" / "so volta". Escolha um dos dois modos — nao mistura.')
          return
        }
        if (modoSeparado && !(temIda && temVoltaOp)) {
          alert('Modo separado precisa de pelo menos 1 opcao de "so ida" E 1 de "so volta". Complete os dois lados ou volte pra combo.')
          return
        }
      }
    }
    setEnviando(true)
    const editando = demandaAtiva.status === 'aguardando_aprovacao'
    try {
      const inserir = await montarPayload(validas)

      if (editando) {
        // Revisão: substitui as opções existentes; status/aprovador permanecem
        await supabase.from('opcoes').delete().eq('demanda_id', demandaAtiva.id)
        await supabase.from('opcoes').insert(inserir)
        await supabase.from('demanda_historico').insert({
          demanda_id: demandaAtiva.id, status_anterior: 'aguardando_aprovacao',
          status_novo: 'aguardando_aprovacao', usuario_id: perfil.id,
        })
        // Volta pra tela de detalhe da demanda revisada
        navigate(`/app/demandas/${demandaAtiva.id}`)
      } else {
        // Primeiro envio: se aprovador_id/nivel ainda nao foram setados
        // (demanda criada antes ou fluxo especial), roteia agora.
        let aprovadorId  = demandaAtiva.aprovador_id
        let proximoNivel = demandaAtiva.proximo_aprovador_nivel
        if (!aprovadorId || proximoNivel === null || proximoNivel === undefined) {
          const r = await resolverAprovador(supabase, {
            empresaId: demandaAtiva.empresa_id, obraId: demandaAtiva.obra_id,
            solicitanteId: demandaAtiva.solicitante_id,
          })
          aprovadorId  = aprovadorId  ?? r.aprovadorId
          proximoNivel = (proximoNivel !== null && proximoNivel !== undefined) ? proximoNivel : r.nivel
        }
        if (!aprovadorId) {
          alert(
            'Nao foi possivel enviar as opcoes: esta empresa nao tem aprovador ' +
            'compatível cadastrado. Cadastre pelo menos um aprovador do nível certo antes de enviar.'
          )
          setEnviando(false)
          return
        }

        await supabase.from('opcoes').insert(inserir)
        await supabase.from('demandas').update({
          status: 'aguardando_aprovacao',
          agente_id: perfil.id,
          aprovador_id: aprovadorId,
          proximo_aprovador_nivel: proximoNivel,
        }).eq('id', demandaAtiva.id)
        await supabase.from('demanda_historico').insert({
          demanda_id: demandaAtiva.id, status_anterior: 'aguardando_opcoes',
          status_novo: 'aguardando_aprovacao', usuario_id: perfil.id,
        })
        // Enviada: sai da fila
        setDemandas(prev => prev.filter(d => d.id !== demandaAtiva.id))
        setDemandaAtiva(null); setOpcoes([OPCAO_VAZIA()])
      }
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
            {demandas.length} aguardando opções
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
                  <>
                    {/* Leitor de print (RF): preenche companhia/horarios/preco automaticamente */}
                    <div className="mb-3">
                      <PrintDropzone onCampos={campos => {
                        const patch = campoParaOpcao(campos, !!demandaAtiva.data_volta)
                        setOpcoes(prev => prev.map((o, i) => i === idx ? { ...o, ...patch } : o))
                      }} />
                    </div>
                    <div>
                      <label className="label">Companhia *</label>
                      <input className="input" placeholder="Ex: LATAM, Gontijo..."
                        value={op.companhia} onChange={e => setOpcao(idx, 'companhia', e.target.value)} />
                    </div>
                  </>
                  )}

                  {/* Dropdown de trecho — so aparece se a demanda for ida-e-volta */}
                  {demandaAtiva.tipo !== 'posvenda' && demandaAtiva.data_volta && (
                    <div className="mt-3">
                      <label className="label">Trecho desta opção *</label>
                      <select className="input" value={op.trecho || 'ida_e_volta'}
                        onChange={e => setOpcao(idx, 'trecho', e.target.value)}>
                        <option value="ida_e_volta">Ida e volta (combo)</option>
                        <option value="ida">Só ida</option>
                        <option value="volta">Só volta</option>
                      </select>
                    </div>
                  )}

                  {/* Ida (mostra se trecho=ida ou ida_e_volta; sempre se demanda so tem ida) */}
                  {demandaAtiva.tipo !== 'posvenda' && (!demandaAtiva.data_volta || op.trecho === 'ida' || op.trecho === 'ida_e_volta' || !op.trecho) && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="label">Saída *</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" className="input" value={op.saida_data} onChange={e => setOpcao(idx, 'saida_data', e.target.value)} required />
                        <input type="time" className="input" value={op.saida_hora} onChange={e => setOpcao(idx, 'saida_hora', e.target.value)} required />
                      </div>
                      {op.saida_data && demandaAtiva.data_ida && op.saida_data !== demandaAtiva.data_ida && (
                        <p className="text-xs mt-1 font-medium" style={{ color: '#E8820C' }}>
                          ⚠️ Data diferente da solicitada ({new Date(demandaAtiva.data_ida+'T12:00:00').toLocaleDateString('pt-BR', {timeZone:'America/Sao_Paulo'})})
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="label">Chegada *</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" className="input" value={op.chegada_data} onChange={e => setOpcao(idx, 'chegada_data', e.target.value)} required />
                        <input type="time" className="input" value={op.chegada_hora} onChange={e => setOpcao(idx, 'chegada_hora', e.target.value)} required />
                      </div>
                      {op.chegada_data && demandaAtiva.data_ida && op.chegada_data !== demandaAtiva.data_ida && (
                        <p className="text-xs mt-1 font-medium" style={{ color: '#E8820C' }}>
                          ⚠️ Data diferente da solicitada ({new Date(demandaAtiva.data_ida+'T12:00:00').toLocaleDateString('pt-BR', {timeZone:'America/Sao_Paulo'})})
                        </p>
                      )}
                    </div>
                  </div>
                  )}

                  {/* Volta (mostra se trecho=volta ou ida_e_volta) */}
                  {demandaAtiva.tipo !== 'posvenda' && demandaAtiva.data_volta && (op.trecho === 'volta' || op.trecho === 'ida_e_volta' || !op.trecho) && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid #F3F4F6' }}>
                      <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#9CA3AF' }}>Trecho de volta</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label">Saída (volta) *</label>
                          <div className="grid grid-cols-2 gap-2">
                            <input type="date" className="input" value={op.volta_saida_data} onChange={e => setOpcao(idx, 'volta_saida_data', e.target.value)} required />
                            <input type="time" className="input" value={op.volta_saida_hora} onChange={e => setOpcao(idx, 'volta_saida_hora', e.target.value)} required />
                          </div>
                          {op.volta_saida_data && demandaAtiva.data_volta && op.volta_saida_data !== demandaAtiva.data_volta && (
                            <p className="text-xs mt-1 font-medium" style={{ color: '#E8820C' }}>
                              ⚠️ Data diferente da solicitada ({new Date(demandaAtiva.data_volta+'T12:00:00').toLocaleDateString('pt-BR', {timeZone:'America/Sao_Paulo'})})
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="label">Chegada (volta) *</label>
                          <div className="grid grid-cols-2 gap-2">
                            <input type="date" className="input" value={op.volta_chegada_data} onChange={e => setOpcao(idx, 'volta_chegada_data', e.target.value)} required />
                            <input type="time" className="input" value={op.volta_chegada_hora} onChange={e => setOpcao(idx, 'volta_chegada_hora', e.target.value)} required />
                          </div>
                          {op.volta_chegada_data && demandaAtiva.data_volta && op.volta_chegada_data !== demandaAtiva.data_volta && (
                            <p className="text-xs mt-1 font-medium" style={{ color: '#E8820C' }}>
                              ⚠️ Data diferente da solicitada ({new Date(demandaAtiva.data_volta+'T12:00:00').toLocaleDateString('pt-BR', {timeZone:'America/Sao_Paulo'})})
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {demandaAtiva.tipo !== 'posvenda' && (<>
                  <div className="mt-3">
                    <label className="label">Escalas / conexões <span className="text-gray-400 font-normal">(opcional)</span></label>
                    <input className="input" placeholder="Ex: 1 escala em GRU (2h) · direto na volta"
                      value={op.escalas} onChange={e => setOpcao(idx, 'escalas', e.target.value)} />
                  </div>
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
