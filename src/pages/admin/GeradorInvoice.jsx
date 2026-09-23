import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Receipt, Loader2, Plus, Trash2, Download, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react'

// Mesma regra do _dec do modelo: o ultimo separador e decimal se tiver 1-2 digitos depois.
function parseValor(v) {
  let s = String(v ?? '').replace(/[^\d,.\-]/g, '')
  const m = s.match(/[.,](\d{1,2})$/)
  s = m ? s.slice(0, m.index).replace(/[.,]/g, '') + '.' + m[1] : s.replace(/[.,]/g, '')
  const n = Number(s || 0)
  return Number.isFinite(n) ? n : NaN
}

function moeda(n) {
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'
}

function isoParaBr(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Texto copiado do Excel: linhas separadas por quebra, celulas por tab. 1a linha = cabecalho.
function parseTabela(txt) {
  const linhas = String(txt || '').replace(/\r/g, '').split('\n').filter(l => l.trim() !== '')
  if (!linhas.length) return null
  const [colunas, ...resto] = linhas.map(l => l.split('\t').map(c => c.trim()))
  return { colunas, linhas: resto }
}

const PAG_VAZIO = { forma: '', data: '', parcelas: '', autorizacao: '', valor: '' }

export default function GeradorInvoice() {
  const { isAdmin } = useAuth()
  const hoje = new Date().toISOString().slice(0, 10)

  const [tipo, setTipo]               = useState('invoice')
  const [numero, setNumero]           = useState('')
  const [data, setData]               = useState(hoje)
  const [clienteNome, setClienteNome] = useState('')
  const [clienteDoc, setClienteDoc]   = useState('')
  const [tarifas, setTarifas]         = useState('')
  const [agenciamento, setAgenciamento] = useState('')
  const [mostrarComposicao, setMostrarComposicao] = useState(true)
  const [tabelaTxt, setTabelaTxt]     = useState('')
  const [formatoExcel, setFormatoExcel] = useState('')
  const [detalharPag, setDetalharPag] = useState(false)
  const [pagamentos, setPagamentos]   = useState([{ ...PAG_VAZIO }])
  const [observacoes, setObservacoes] = useState('')

  const [gerando, setGerando]   = useState(false)
  const [erro, setErro]         = useState(null)
  const [resultado, setResultado] = useState(null) // { arquivo, avisos, url }

  useEffect(() => () => { if (resultado?.url) URL.revokeObjectURL(resultado.url) }, [resultado?.url])

  const recibo = tipo === 'recibo'
  const tabela = parseTabela(tabelaTxt)
  const total = parseValor(tarifas) + parseValor(agenciamento)
  const linhasTortas = tabela ? tabela.linhas.filter(l => l.length !== tabela.colunas.length).length : 0

  function setPag(i, campo, valor) {
    setPagamentos(p => p.map((row, k) => (k === i ? { ...row, [campo]: valor } : row)))
  }

  async function gerar(e) {
    e.preventDefault()
    setGerando(true); setErro(null); setResultado(null)
    try {
      const doc = {
        tipo,
        numero: numero.trim(),
        data: isoParaBr(data),
        cliente: { nome: clienteNome.trim(), documento: clienteDoc.trim() },
        tarifas: tarifas.trim(),
        agenciamento: agenciamento.trim() || '0',
        mostrar_composicao: mostrarComposicao,
        observacoes: observacoes.split('\n').map(o => o.trim()).filter(Boolean),
        ...(tabela ? { tabela } : {}),
        ...(formatoExcel ? { formato_excel: formatoExcel } : {}),
        ...(recibo && detalharPag
          ? { pagamentos: pagamentos.filter(p => p.forma.trim() || p.valor.trim()).map(p => ({ ...p, data: isoParaBr(p.data) })) }
          : {}),
      }

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/gerar-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify(doc),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const d = json.detail
        throw new Error(Array.isArray(d) ? d.map(x => x.msg).join('; ') : (d || `Erro ${res.status}`))
      }

      const bytes = Uint8Array.from(atob(json.pdf_base64), c => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url; a.download = json.arquivo; a.click()
      setResultado({ arquivo: json.arquivo, avisos: json.avisos ?? [], url })
    } catch (err) {
      setErro(err.message)
    } finally {
      setGerando(false)
    }
  }

  if (!isAdmin) {
    return <div className="p-8 text-sm" style={{ color: '#6B7280' }}>Sem acesso a esta página.</div>
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#1A1614' }}>Invoice / Recibo</h1>
        <p className="text-sm" style={{ color: '#6B7280' }}>Gera o documento no modelo U Business, para qualquer cliente</p>
      </div>

      <form onSubmit={gerar} className="space-y-5">
        {/* Documento */}
        <div className="card p-5">
          <div className="flex gap-2 mb-4">
            {[['invoice', 'Invoice'], ['recibo', 'Recibo']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setTipo(v)}
                className="py-1.5 px-4 rounded-lg border text-sm font-medium"
                style={{
                  borderColor: tipo === v ? '#C0186A' : '#E5E7EB',
                  background: tipo === v ? '#C0186A' : 'white',
                  color: tipo === v ? 'white' : '#1A1614',
                }}>
                {l}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Número *</label>
              <input className="input" placeholder={recibo ? 'R022' : '238'} value={numero} onChange={e => setNumero(e.target.value)} />
            </div>
            <div>
              <label className="label">Data do documento *</label>
              <input type="date" className="input" value={data} onChange={e => setData(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Cliente */}
        <div className="card p-5">
          <p className="text-sm font-medium mb-3" style={{ color: '#1A1614' }}>{recibo ? 'Cliente / Pagador' : 'Comprador'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nome / Razão social *</label>
              <input className="input" value={clienteNome} onChange={e => setClienteNome(e.target.value)} />
            </div>
            <div>
              <label className="label">CPF ou CNPJ *</label>
              <input className="input" placeholder="com ou sem máscara" value={clienteDoc} onChange={e => setClienteDoc(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Valores */}
        <div className="card p-5">
          <p className="text-sm font-medium mb-3" style={{ color: '#1A1614' }}>Valores</p>
          <div className="grid grid-cols-3 gap-3 items-end">
            <div>
              <label className="label">Tarifas *</label>
              <input className="input" placeholder="9.058,87" value={tarifas} onChange={e => setTarifas(e.target.value)} />
            </div>
            <div>
              <label className="label">Serviço de agenciamento</label>
              <input className="input" placeholder="482,15" value={agenciamento} onChange={e => setAgenciamento(e.target.value)} />
            </div>
            <div className="pb-2">
              <p className="text-xs" style={{ color: '#9CA3AF' }}>Total</p>
              <p className="text-lg font-bold" style={{ color: '#1A1614' }}>{tarifas ? moeda(total) : '—'}</p>
            </div>
          </div>
          <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer" style={{ color: '#1A1614' }}>
            <input type="checkbox" checked={mostrarComposicao} onChange={e => setMostrarComposicao(e.target.checked)}
              className="w-4 h-4" style={{ accentColor: '#C0186A' }} />
            Mostrar a composição (tarifas + agenciamento) no documento
          </label>
        </div>

        {/* Tabela do Excel */}
        <div className="card p-5">
          <p className="text-sm font-medium mb-1" style={{ color: '#1A1614' }}>
            {recibo ? 'Detalhamento dos serviços' : 'Detalhamento da(s) reserva(s)'}
          </p>
          <p className="text-xs mb-3" style={{ color: '#6B7280' }}>
            Selecione as células no Excel (com a linha de cabeçalho), copie e cole aqui.
            {recibo && ' Para o recibo, inclua a coluna "Data Pgto".'}
          </p>
          <textarea className="input font-mono text-xs resize-y" rows={5} value={tabelaTxt}
            onChange={e => setTabelaTxt(e.target.value)}
            placeholder={'Voo\tFamília\tLocalizador\tOrigem\tDestino\tSaída\tChegada\nAF 443\tSTANDARD\tXYMFEF\tGIG\tCDG\t09/09/2026 22:00\t10/09/2026 14:15'} />
          <div className="flex items-center gap-2 mt-2">
            <label className="text-xs" style={{ color: '#6B7280' }}>Datas do Excel:</label>
            <select className="input py-1 text-xs" style={{ maxWidth: 220 }} value={formatoExcel} onChange={e => setFormatoExcel(e.target.value)}>
              <option value="">Detectar sozinho</option>
              <option value="br">Dia/mês (19/08/2026)</option>
              <option value="us">Mês/dia (8/19/2026)</option>
            </select>
          </div>

          {tabela && tabela.linhas.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>{tabela.colunas.map((c, i) => (
                    <th key={i} className="px-2 py-1.5 text-left font-semibold text-white whitespace-nowrap" style={{ background: '#5B2D8E' }}>{c}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {tabela.linhas.map((l, i) => (
                    <tr key={i} style={{ background: i % 2 ? '#F5F0F7' : 'white' }}>
                      {l.map((c, k) => <td key={k} className="px-2 py-1.5 whitespace-nowrap" style={{ borderBottom: '1px solid #E5E7EB' }}>{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {linhasTortas > 0 && (
            <p className="text-xs mt-2" style={{ color: '#B91C1C' }}>
              {linhasTortas} linha(s) com número de células diferente do cabeçalho ({tabela.colunas.length} colunas).
            </p>
          )}
        </div>

        {/* Pagamentos (recibo) */}
        {recibo && (
          <div className="card p-5">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: '#1A1614' }}>
              <input type="checkbox" checked={detalharPag} onChange={e => setDetalharPag(e.target.checked)}
                className="w-4 h-4" style={{ accentColor: '#C0186A' }} />
              Detalhar pagamentos por cartão
              <span className="text-xs font-normal" style={{ color: '#9CA3AF' }}>(só quando o cliente pedir)</span>
            </label>
            {detalharPag && (
              <div className="mt-3 space-y-2">
                {pagamentos.map((p, i) => (
                  <div key={i} className="grid gap-2 items-center" style={{ gridTemplateColumns: '2fr 1.2fr 0.7fr 1fr 1.1fr auto' }}>
                    <input className="input" placeholder="Cartão Visa final 8403" value={p.forma} onChange={e => setPag(i, 'forma', e.target.value)} />
                    <input type="date" className="input" value={p.data} onChange={e => setPag(i, 'data', e.target.value)} />
                    <input className="input" placeholder="4x" value={p.parcelas} onChange={e => setPag(i, 'parcelas', e.target.value)} />
                    <input className="input" placeholder="Autorização" value={p.autorizacao} onChange={e => setPag(i, 'autorizacao', e.target.value)} />
                    <input className="input" placeholder="14.250,00" value={p.valor} onChange={e => setPag(i, 'valor', e.target.value)} />
                    <button type="button" onClick={() => setPagamentos(ps => ps.length > 1 ? ps.filter((_, k) => k !== i) : [{ ...PAG_VAZIO }])}
                      className="p-2 rounded hover:bg-gray-100" style={{ color: '#9CA3AF' }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setPagamentos(ps => [...ps, { ...PAG_VAZIO }])}
                  className="btn-secondary text-xs flex items-center gap-1">
                  <Plus size={13} /> Adicionar pagamento
                </button>
              </div>
            )}
          </div>
        )}

        {/* Observacoes */}
        <div className="card p-5">
          <label className="label">Observações <span className="font-normal" style={{ color: '#9CA3AF' }}>(opcional, uma por linha)</span></label>
          <textarea className="input resize-none" rows={2} value={observacoes} onChange={e => setObservacoes(e.target.value)} />
        </div>

        {erro && (
          <div className="flex items-start gap-2 text-sm rounded-md px-3 py-2" style={{ background: '#FEF2F2', color: '#991B1B' }}>
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> <span>{erro}</span>
          </div>
        )}

        {resultado && (
          <div className="rounded-md px-3 py-2 text-sm" style={{ background: '#ECFDF5', color: '#065F46' }}>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} /> <span>{resultado.arquivo}</span>
              <a href={resultado.url} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 font-medium hover:underline">
                <Download size={14} /> Abrir PDF
              </a>
            </div>
            {resultado.avisos.map((a, i) => (
              <p key={i} className="flex items-start gap-2 mt-1.5" style={{ color: '#92400E' }}>
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> {a}
              </p>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          {gerando && <span className="text-xs" style={{ color: '#9CA3AF' }}>A primeira geração do dia pode levar até 1 minuto.</span>}
          <button type="submit" disabled={gerando || !numero.trim() || !clienteNome.trim() || !clienteDoc.trim() || !tarifas.trim()}
            className="btn-primary disabled:opacity-40">
            {gerando ? <Loader2 size={15} className="animate-spin" /> : <Receipt size={15} />}
            {gerando ? 'Gerando...' : `Gerar ${recibo ? 'recibo' : 'invoice'}`}
          </button>
        </div>
      </form>
    </div>
  )
}
