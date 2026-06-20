import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtTs, fmtData } from '../../lib/datetime'
import { Loader2, Plus, FileText, ChevronRight, X, Check, Filter, Download } from 'lucide-react'

function moeda(v) {
  if (!v && v !== 0) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function StatusBadgeInv({ status }) {
  const cfg = {
    rascunho: { label: 'Rascunho', bg: '#F3F4F6', color: '#6B7280' },
    enviado:  { label: 'Enviado',  bg: '#FEF3C7', color: '#E8820C' },
    pago:     { label: 'Pago',     bg: '#ECFDF5', color: '#059669' },
  }
  const { label, bg, color } = cfg[status] ?? cfg.rascunho
  return <span className="badge" style={{ background: bg, color }}>{label}</span>
}

function NovaInvoiceModal({ empresas, onSalvar, onFechar }) {
  const [form, setForm] = useState({
    empresa_id: '',
    periodo_inicio: '',
    periodo_fim: '',
    obra_id: '',
  })
  const [obras, setObras] = useState([])
  const [bilhetes, setBilhetes] = useState([])
  const [selecionados, setSelecionados] = useState([])
  const [loading, setLoading] = useState(false)
  const [salvando, setSalvando] = useState(false)

  async function buscarBilhetes() {
    if (!form.empresa_id || !form.periodo_inicio || !form.periodo_fim) return
    setLoading(true)

    // Step 1: demandas da empresa
    const { data: demList } = await supabase
      .from('demandas')
      .select('id, tipo, origem, destino, cidade, obra_id, passageiros(nome, sobrenome), obras(nome)')
      .eq('empresa_id', form.empresa_id)

    if (!demList || demList.length === 0) { setBilhetes([]); setSelecionados([]); setLoading(false); return }
    const demIds = demList.map(d => d.id)
    const demMap = Object.fromEntries(demList.map(d => [d.id, d]))

    // Step 2: bilhetes no período
    const { data: bils } = await supabase
      .from('bilhetes')
      .select('id, emitido_em, voucher_url, demanda_id')
      .in('demanda_id', demIds)
      .gte('emitido_em', form.periodo_inicio + 'T00:00:00-03:00')
      .lte('emitido_em', form.periodo_fim + 'T23:59:59-03:00')

    if (!bils || bils.length === 0) { setBilhetes([]); setSelecionados([]); setLoading(false); return }

    // Step 3: aprovacoes
    const { data: aprs } = await supabase
      .from('aprovacoes')
      .select('demanda_id, comentario, opcoes(preco_venda, preco_milha)')
      .in('demanda_id', demIds)
      .eq('decisao', 'aprovado')

    const aprMap = Object.fromEntries((aprs ?? []).map(a => [a.demanda_id, a]))

    // Merge
    const merged = bils.map(b => ({
      ...b,
      demandas: demMap[b.demanda_id],
      aprovacao: aprMap[b.demanda_id],
    }))

    setBilhetes(merged)
    setSelecionados(merged.map(b => b.id))
    setLoading(false)
  }


  async function carregarObras() {
    if (!form.empresa_id) return
    const { data } = await supabase.from('obras').select('id, nome').eq('empresa_id', form.empresa_id).eq('ativo', true)
    setObras(data ?? [])
  }

  useEffect(() => { carregarObras() }, [form.empresa_id])
  useEffect(() => { buscarBilhetes() }, [form.empresa_id, form.periodo_inicio, form.periodo_fim])

  function set(f, v) { setForm(p => ({ ...p, [f]: v })) }
  function toggleSel(id) {
    setSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function getValor(b) {
    const tipo = b.aprovacao?.comentario
    const op = b.aprovacao?.opcoes
    if (!op) return 0
    return tipo === 'milha' ? (op.preco_milha || 0) : (op.preco_venda || 0)
  }

  function getDescricao(b) {
    const d = b.demandas
    if (!d) return '—'
    const pax = d.passageiros ? `${d.passageiros.nome} ${d.passageiros.sobrenome}` : '—'
    if (d.tipo === 'hospedagem') return `Hospedagem - ${d.cidade} - ${pax}`
    return `${d.tipo === 'aereo' ? 'Aéreo' : 'Rodoviário'} - ${d.origem} → ${d.destino} - ${pax}`
  }

  const bilhetesFiltrados = bilhetes.filter(b =>
    !form.obra_id || b.demandas?.obra_id === form.obra_id
  )

  const totalSelecionado = bilhetesFiltrados
    .filter(b => selecionados.includes(b.id))
    .reduce((s, b) => s + getValor(b), 0)

  async function salvar() {
    if (!form.empresa_id || selecionados.length === 0) return
    setSalvando(true)
    try {
      const { data: inv, error } = await supabase.from('invoices').insert({
        empresa_id: form.empresa_id,
        obra_id: form.obra_id || null,
        periodo_inicio: form.periodo_inicio,
        periodo_fim: form.periodo_fim,
        status: 'rascunho',
      }).select().single()
      if (error) throw error

      const itens = bilhetesFiltrados
        .filter(b => selecionados.includes(b.id))
        .map(b => ({
          invoice_id: inv.id,
          bilhete_id: b.id,
          descricao: getDescricao(b),
          valor: getValor(b),
        }))
      await supabase.from('invoice_itens').insert(itens)
      onSalvar(inv)
    } catch (err) {
      alert('Erro: ' + err.message)
    } finally { setSalvando(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: '#E5E7EB' }}>
          <h2 className="text-lg font-semibold" style={{ color: '#1A1614' }}>Nova Invoice</h2>
          <button onClick={onFechar}><X size={20} className="text-gray-400" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Empresa + Período */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Empresa *</label>
              <select className="input" value={form.empresa_id} onChange={e => set('empresa_id', e.target.value)}>
                <option value="">Selecione a empresa</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Período início *</label>
              <input type="date" className="input" value={form.periodo_inicio} onChange={e => set('periodo_inicio', e.target.value)} />
            </div>
            <div>
              <label className="label">Período fim *</label>
              <input type="date" className="input" min={form.periodo_inicio} value={form.periodo_fim} onChange={e => set('periodo_fim', e.target.value)} />
            </div>
            {obras.length > 0 && (
              <div className="col-span-2">
                <label className="label">Filtrar por centro de custo <span className="text-gray-400 font-normal">(opcional)</span></label>
                <select className="input" value={form.obra_id} onChange={e => set('obra_id', e.target.value)}>
                  <option value="">Todos</option>
                  {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Bilhetes */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-gray-300" />
            </div>
          ) : bilhetesFiltrados.length === 0 && form.empresa_id && form.periodo_inicio && form.periodo_fim ? (
            <div className="py-8 text-center text-sm" style={{ color: '#9CA3AF' }}>
              Nenhum bilhete emitido neste período para esta empresa.
            </div>
          ) : bilhetesFiltrados.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Bilhetes emitidos ({bilhetesFiltrados.length})</label>
                <button type="button" className="text-xs" style={{ color: '#C0186A' }}
                  onClick={() => setSelecionados(
                    selecionados.length === bilhetesFiltrados.length ? [] : bilhetesFiltrados.map(b => b.id)
                  )}>
                  {selecionados.length === bilhetesFiltrados.length ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
              </div>
              <div className="border rounded-xl overflow-hidden" style={{ borderColor: '#E5E7EB' }}>
                {bilhetesFiltrados.map((b, i) => (
                  <div key={b.id}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
                    style={{ borderBottom: i < bilhetesFiltrados.length - 1 ? '1px solid #F3F4F6' : 'none' }}
                    onClick={() => toggleSel(b.id)}>
                    <input type="checkbox" checked={selecionados.includes(b.id)} onChange={() => toggleSel(b.id)}
                      className="w-4 h-4 flex-shrink-0" style={{ accentColor: '#C0186A' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: '#1A1614' }}>{getDescricao(b)}</p>
                      <p className="text-xs" style={{ color: '#9CA3AF' }}>
                        Emitido em {fmtTs(b.emitido_em)}
                        {b.demandas?.obras && ` · ${b.demandas.obras.nome}`}
                      </p>
                    </div>
                    <span className="text-sm font-semibold flex-shrink-0" style={{ color: '#1A1614' }}>
                      {moeda(getValor(b))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-6 border-t" style={{ borderColor: '#E5E7EB' }}>
          {selecionados.length > 0 && (
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm" style={{ color: '#6B7280' }}>{selecionados.length} item(ns) selecionado(s)</span>
              <span className="text-lg font-bold" style={{ color: '#1A1614' }}>Total: {moeda(totalSelecionado)}</span>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={onFechar} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={salvar} disabled={!form.empresa_id || selecionados.length === 0 || salvando}
              className="btn-primary flex-1 justify-center">
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Criar invoice
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function InvoiceDetalhe({ invoice, onVoltar, onAtualizar }) {
  const [itens, setItens] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('invoice_itens')
        .select('*, bilhetes(voucher_url, emitido_em)')
        .eq('invoice_id', invoice.id)
      setItens(data ?? [])
      setLoading(false)
    }
    load()
  }, [invoice.id])

  async function mudarStatus(status) {
    await supabase.from('invoices').update({ status }).eq('id', invoice.id)
    onAtualizar({ ...invoice, status })
  }

  function gerarPDF() {
    const empresa = invoice.empresas?.nome ?? '—'
    const cnpj = invoice.empresas?.cnpj ?? ''
    const numero = invoice.id.slice(0, 8).toUpperCase()
    const periodo = `${fmtData(invoice.periodo_inicio)} a ${fmtData(invoice.periodo_fim)}`
    const emitida_em = new Date().toLocaleDateString('pt-BR')

    function moedaFmt(v) {
      return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    }

    const itensHtml = itens.map((item, i) => {
      const bg = i % 2 === 0 ? '#FAFAFA' : '#FFFFFF'
      const b = item.bilhetes ?? {}
      const d = b.demandas ?? {}
      const pax = d.passageiros ? `${d.passageiros.nome} ${d.passageiros.sobrenome ?? ''}` : '—'
      const tipo = d.tipo === 'aereo' ? 'Aéreo' : d.tipo === 'hospedagem' ? 'Hospedagem' : d.tipo === 'rodoviario' ? 'Rodoviário' : (d.tipo ?? '—')
      const rota = d.tipo === 'hospedagem' ? (d.cidade ?? '—') : `${d.origem ?? '—'} → ${d.destino ?? '—'}`
      const dataIda = d.tipo === 'hospedagem' ? (d.checkin ?? '—') : (d.data_ida ?? '—')
      const dataVolta = d.tipo === 'hospedagem' ? (d.checkout ?? '') : (d.data_volta ?? '')
      const datas = dataVolta ? `${dataIda}<br><span style="color:#9CA3AF;font-size:7.5pt">→ ${dataVolta}</span>` : dataIda
      const emitidoEm = b.emitido_em ? new Date(b.emitido_em).toLocaleDateString('pt-BR') : '—'
      return `<tr style="background:${bg}">
        <td class="td">${pax}</td>
        <td class="td"><span style="font-weight:600;color:#5B2D8E">${tipo}</span> · <span style="color:#6B7280">${rota}</span></td>
        <td class="td center">${datas}</td>
        <td class="td center">${emitidoEm}</td>
        <td class="td right valor">${moedaFmt(item.valor)}</td>
      </tr>`
    }).join('')

    const total = itens.reduce((s, i) => s + (i.valor || 0), 0)

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <style>
      @page { size: A4; margin: 28px 36px; }
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: Arial, sans-serif; color:#1A1614; font-size:9pt; }
      .header { display:flex; align-items:center; justify-content:space-between; border:1.5px solid #D1D5DB; border-radius:6px; padding:12px 16px; margin-bottom:16px; }
      .brand { display:flex; align-items:center; gap:12px; }
      .logo { width:56px; height:56px; }
      .brand-name { font-size:10pt; font-weight:700; color:#1A1614; }
      .brand-details { font-size:8pt; color:#4B5563; margin-top:4px; line-height:1.6; }
      .brand-details em { font-style:italic; }
      .invoice-badge { text-align:right; }
      .invoice-title { font-size:16pt; font-weight:700; color:#1A1614; }
      .invoice-num-label { font-size:7pt; color:#9CA3AF; text-transform:uppercase; letter-spacing:1px; margin-bottom:1px; }
      .client-block { margin-bottom:10px; }
      .client-label { font-size:7pt; color:#9CA3AF; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:2px; }
      .client-name { font-size:10pt; font-weight:600; }
      .client-cnpj { font-size:8pt; color:#6B7280; }
      .info-row { display:flex; gap:24px; margin-bottom:14px; }
      .info-label { font-size:7pt; color:#9CA3AF; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:1px; }
      .info-value { font-size:9pt; font-weight:600; }
      .divider { height:2px; background:linear-gradient(135deg,#5B2D8E,#C0186A); border-radius:2px; margin-bottom:14px; }
      .section-title { font-size:8pt; font-weight:700; color:#5B2D8E; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:6px; }
      table { width:100%; border-collapse:collapse; }
      .th { background:linear-gradient(135deg,#5B2D8E,#C0186A); color:#fff; font-size:7pt; font-weight:600; padding:7px 8px; text-transform:uppercase; }
      .th.center { text-align:center; } .th.right { text-align:right; }
      .td { padding:7px 8px; font-size:8.5pt; color:#374151; border-bottom:1px solid #F3F4F6; vertical-align:middle; }
      .td.center { text-align:center; } .td.right { text-align:right; }
      .td.valor { font-weight:700; color:#1A1614; white-space:nowrap; }
      .bottom { margin-top:14px; display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
      .pag-block { flex:1; background:#F8F9FA; border-radius:6px; padding:10px 12px; border-left:3px solid #5B2D8E; }
      .pag-title { font-size:7.5pt; font-weight:700; color:#5B2D8E; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:4px; }
      .pag-text { font-size:8.5pt; color:#374151; line-height:1.7; }
      .total-box { background:linear-gradient(135deg,#5B2D8E,#C0186A); border-radius:8px; padding:12px 20px; text-align:right; min-width:200px; }
      .total-label { font-size:7pt; color:rgba(255,255,255,0.75); text-transform:uppercase; letter-spacing:1px; }
      .total-value { font-size:16pt; font-weight:700; color:#fff; margin-top:2px; }
      .footer { margin-top:14px; padding-top:10px; border-top:1px solid #E5E7EB; display:flex; justify-content:space-between; }
      .footer-text { font-size:7.5pt; color:#9CA3AF; }
      .footer-cnpj { font-weight:600; color:#6B7280; }
    </style></head><body>
    <div class="header">
      <div class="brand">
        <div>
          <div class="brand-name">U BUSINESS AGÊNCIA DE VIAGENS LTDA.</div>
          <div class="brand-details"><em>CNPJ: 44.058.861/0001-04</em><br>(11) 99963-4001<br>e-mail: ubusinessbr@gmail.com<br>São Paulo/SP – Brasil</div>
        </div>
      </div>
      <div class="invoice-badge">
        <div class="invoice-num-label">Invoice</div>
        <div class="invoice-title">No: ${numero}</div>
      </div>
    </div>
    <div class="client-block">
      <div class="client-label">Comprador</div>
      <div class="client-name">${empresa}</div>
      ${cnpj ? `<div class="client-cnpj">CNPJ: ${cnpj}</div>` : ''}
    </div>
    <div class="info-row">
      <div><div class="info-label">Período de referência</div><div class="info-value">${periodo}</div></div>
      <div><div class="info-label">Data de emissão</div><div class="info-value">${emitida_em}</div></div>
    </div>
    <div class="divider"></div>
    <div class="section-title">Detalhamento dos serviços</div>
    <table>
      <thead><tr>
        <th class="th" style="width:20%">Passageiro</th>
        <th class="th" style="width:34%">Serviço / Rota</th>
        <th class="th center" style="width:16%">Ida / Volta</th>
        <th class="th center" style="width:13%">Emissão</th>
        <th class="th right" style="width:17%">Valor</th>
      </tr></thead>
      <tbody>${itensHtml}</tbody>
    </table>
    <div class="bottom">
      <div class="pag-block">
        <div class="pag-title">Dados para Pagamento</div>
        <div class="pag-text">Banco Itaú &nbsp;|&nbsp; Ag: 8422 &nbsp;|&nbsp; CC: 99565-7<br>U Business Agência de Viagens LTDA &nbsp;|&nbsp; CNPJ: 44.058.861/0001-04 <em>(Pix)</em></div>
      </div>
      <div class="total-box">
        <div class="total-label">Valor total</div>
        <div class="total-value">${moedaFmt(total)}</div>
      </div>
    </div>
    <div class="footer">
      <div class="footer-text"><span class="footer-cnpj">U Business Agência de Viagens LTDA</span> · CNPJ 44.058.861/0001-04</div>
      <div class="footer-text">São Paulo, ${emitida_em}</div>
    </div>
    </body></html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.onload = () => win.print()
  }

  const total = itens.reduce((s, i) => s + (i.valor || 0), 0)

  return (
    <div className="p-8 max-w-3xl">
      <button onClick={onVoltar} className="text-sm mb-6 flex items-center gap-1" style={{ color: '#6B7280' }}>
        ← Voltar para invoices
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1A1614' }}>
            Invoice #{invoice.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="text-sm mt-1" style={{ color: '#9CA3AF' }}>
            {fmtData(invoice.periodo_inicio)} a {fmtData(invoice.periodo_fim)}
          </p>
        </div>
        <StatusBadgeInv status={invoice.status} />
      </div>

      <div className="card overflow-hidden mb-4">
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E7EB', background: '#F8F9FA' }}>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase" style={{ color: '#6B7280' }}>Descrição</th>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase" style={{ color: '#6B7280' }}>Emitido em</th>
                <th className="text-right px-5 py-3 text-xs font-medium uppercase" style={{ color: '#6B7280' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item, i) => (
                <tr key={item.id} style={{ borderBottom: i < itens.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                  <td className="px-5 py-3 text-sm" style={{ color: '#1A1614' }}>{item.descricao}</td>
                  <td className="px-5 py-3 text-sm" style={{ color: '#6B7280' }}>{fmtTs(item.bilhetes?.emitido_em)}</td>
                  <td className="px-5 py-3 text-sm font-semibold text-right" style={{ color: '#1A1614' }}>{moeda(item.valor)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #E5E7EB', background: '#F8F9FA' }}>
                <td colSpan={2} className="px-5 py-3 text-sm font-semibold" style={{ color: '#1A1614' }}>Total</td>
                <td className="px-5 py-3 text-right font-bold text-lg" style={{ color: '#C0186A' }}>{moeda(total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Ações de status */}
      <div className="flex gap-3 flex-wrap">
        <button onClick={gerarPDF} className="btn-secondary">
          <Download size={15} /> Gerar PDF
        </button>
        {invoice.status === 'rascunho' && (
          <button onClick={() => mudarStatus('enviado')} className="btn-primary">
            <FileText size={15} /> Marcar como enviado
          </button>
        )}
        {invoice.status === 'enviado' && (
          <button onClick={() => mudarStatus('pago')} className="btn-primary">
            <Check size={15} /> Marcar como pago
          </button>
        )}
        {invoice.status !== 'rascunho' && (
          <button onClick={() => mudarStatus('rascunho')} className="btn-secondary">
            Voltar para rascunho
          </button>
        )}
      </div>
    </div>
  )
}

export default function Invoices() {
  const [invoices, setInvoices] = useState([])
  const [empresas, setEmpresas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalNova, setModalNova] = useState(false)
  const [invoiceAtiva, setInvoiceAtiva] = useState(null)
  const [filtroStatus, setFiltroStatus] = useState('')

  useEffect(() => {
    async function load() {
      const [{ data: inv }, { data: emp }] = await Promise.all([
        supabase.from('invoices').select('*, empresas(nome), obras(nome)').order('created_at', { ascending: false }),
        supabase.from('empresas').select('id, nome').order('nome'),
      ])
      setInvoices(inv ?? [])
      setEmpresas(emp ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const filtradas = invoices.filter(i => !filtroStatus || i.status === filtroStatus)

  if (invoiceAtiva) return (
    <InvoiceDetalhe
      invoice={invoiceAtiva}
      onVoltar={() => setInvoiceAtiva(null)}
      onAtualizar={inv => {
        setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, ...inv } : i))
        setInvoiceAtiva(inv)
      }} />
  )

  return (
    <div className="p-8">
      {modalNova && (
        <NovaInvoiceModal
          empresas={empresas}
          onFechar={() => setModalNova(false)}
          onSalvar={inv => {
            setInvoices(prev => [inv, ...prev])
            setModalNova(false)
            setInvoiceAtiva(inv)
          }} />
      )}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1A1614' }}>Invoices</h1>
          <p className="text-sm mt-1" style={{ color: '#6B7280' }}>{filtradas.length} invoice{filtradas.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setModalNova(true)} className="btn-primary">
          <Plus size={16} /> Nova invoice
        </button>
      </div>

      {/* Filtro status */}
      <div className="flex gap-3 mb-6">
        {['', 'rascunho', 'enviado', 'pago'].map(s => (
          <button key={s} onClick={() => setFiltroStatus(s)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: filtroStatus === s ? '#C0186A' : '#F3F4F6',
              color: filtroStatus === s ? 'white' : '#6B7280',
            }}>
            {s === '' ? 'Todas' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-gray-300" />
          </div>
        ) : filtradas.length === 0 ? (
          <div className="py-16 text-center">
            <FileText size={32} className="mx-auto mb-3" style={{ color: '#E5E7EB' }} />
            <p className="text-sm" style={{ color: '#9CA3AF' }}>Nenhuma invoice ainda</p>
            <button onClick={() => setModalNova(true)} className="btn-primary mt-4">
              <Plus size={15} /> Criar primeira invoice
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase" style={{ color: '#6B7280' }}>Invoice</th>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase" style={{ color: '#6B7280' }}>Empresa</th>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase" style={{ color: '#6B7280' }}>Período</th>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase" style={{ color: '#6B7280' }}>Centro custo</th>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase" style={{ color: '#6B7280' }}>Criada em</th>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase" style={{ color: '#6B7280' }}>Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtradas.map(inv => (
                <tr key={inv.id} onClick={() => setInvoiceAtiva(inv)}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                  style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td className="px-5 py-4 text-sm font-mono font-medium" style={{ color: '#1A1614' }}>
                    #{inv.id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="px-5 py-4 text-sm" style={{ color: '#1A1614' }}>{inv.empresas?.nome}</td>
                  <td className="px-5 py-4 text-sm" style={{ color: '#6B7280' }}>
                    {fmtData(inv.periodo_inicio)} – {fmtData(inv.periodo_fim)}
                  </td>
                  <td className="px-5 py-4 text-sm" style={{ color: '#6B7280' }}>{inv.obras?.nome || '—'}</td>
                  <td className="px-5 py-4 text-sm" style={{ color: '#6B7280' }}>{fmtTs(inv.created_at)}</td>
                  <td className="px-5 py-4"><StatusBadgeInv status={inv.status} /></td>
                  <td className="px-5 py-4"><ChevronRight size={16} style={{ color: '#D1D5DB' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
