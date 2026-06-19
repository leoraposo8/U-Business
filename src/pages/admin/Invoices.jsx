import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtTs, fmtData } from '../../lib/datetime'
import { Loader2, Plus, FileText, ChevronRight, X, Check, Filter } from 'lucide-react'

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
    // Busca bilhetes emitidos no período para a empresa
    const { data } = await supabase
      .from('bilhetes')
      .select(`
        id, emitido_em, voucher_url,
        demandas!inner(
          id, tipo, origem, destino, cidade, data_ida, checkin,
          empresa_id, obra_id,
          passageiros(nome, sobrenome),
          obras(nome),
          opcoes!inner(preco_venda, preco_milha, tipo_emissao)
        ),
        aprovacoes(comentario)
      `)
      .eq('demandas.empresa_id', form.empresa_id)
      .gte('emitido_em', form.periodo_inicio + 'T00:00:00')
      .lte('emitido_em', form.periodo_fim + 'T23:59:59')
    setBilhetes(data ?? [])
    setSelecionados((data ?? []).map(b => b.id))
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
    const tipoEmissao = b.aprovacoes?.[0]?.comentario
    const op = b.demandas?.opcoes?.[0]
    if (!op) return 0
    return tipoEmissao === 'milha' ? (op.preco_milha || 0) : (op.preco_venda || 0)
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
      <div className="flex gap-3">
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
