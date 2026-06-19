import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { fmtTs, fmtData } from '../../lib/datetime'
import TipoBadge from '../../components/ui/TipoBadge'
import { Loader2, TrendingUp, Plane, Bus, Hotel, Filter } from 'lucide-react'

function moeda(v) {
  if (!v && v !== 0) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function CardStat({ label, value, icon: Icon, color }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: '#9CA3AF' }}>{label}</p>
          <p className="text-2xl font-bold" style={{ color: '#1A1614' }}>{value}</p>
        </div>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: color + '20' }}>
          <Icon size={18} style={{ color }} />
        </div>
      </div>
    </div>
  )
}

export default function Relatorio() {
  const { perfil } = useAuth()
  const [bilhetes, setBilhetes] = useState([])
  const [obras, setObras] = useState([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const now = new Date()
  const [inicio, setInicio] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`)
  const [fim, setFim] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()).padStart(2,'0')}`)
  const [obraFiltro, setObraFiltro] = useState('')

  useEffect(() => {
    async function load() {
      if (!perfil?.empresa_id) return
      const [{ data: obs }] = await Promise.all([
        supabase.from('obras').select('id, nome').eq('empresa_id', perfil.empresa_id).eq('ativo', true),
      ])
      setObras(obs ?? [])
    }
    load()
  }, [perfil])

  useEffect(() => {
    async function load() {
      if (!perfil?.empresa_id || !inicio || !fim) return
      setLoading(true)

      // Step 1: demandas da empresa
      const { data: demList } = await supabase
        .from('demandas')
        .select('id, tipo, origem, destino, cidade, obra_id, passageiros(nome, sobrenome), obras(nome)')
        .eq('empresa_id', perfil.empresa_id)

      if (!demList || demList.length === 0) { setBilhetes([]); setLoading(false); return }
      const demIds = demList.map(d => d.id)
      const demMap = Object.fromEntries(demList.map(d => [d.id, d]))

      // Step 2: bilhetes no período
      const { data: bils } = await supabase
        .from('bilhetes')
        .select('id, emitido_em, demanda_id')
        .in('demanda_id', demIds)
        .gte('emitido_em', inicio + 'T00:00:00-03:00')
        .lte('emitido_em', fim + 'T23:59:59-03:00')

      if (!bils || bils.length === 0) { setBilhetes([]); setLoading(false); return }

      // Step 3: aprovacoes com opcao (valor + tipo emissao)
      const { data: aprs } = await supabase
        .from('aprovacoes')
        .select('demanda_id, comentario, opcoes(preco_venda, preco_milha)')
        .in('demanda_id', demIds)
        .eq('decisao', 'aprovado')

      const aprMap = Object.fromEntries((aprs ?? []).map(a => [a.demanda_id, a]))

      // Merge
      const merged = bils.map(b => ({
        ...b,
        demanda: demMap[b.demanda_id],
        aprovacao: aprMap[b.demanda_id],
      }))

      setBilhetes(merged)
      setLoading(false)
    }
    load()
  }, [perfil, inicio, fim])

  function getValor(b) {
    const tipo = b.aprovacao?.comentario
    const op = b.aprovacao?.opcoes
    if (!op) return 0
    return tipo === 'milha' ? (op.preco_milha || 0) : (op.preco_venda || 0)
  }

  function getTipoEmissao(b) {
    return b.aprovacao?.comentario === 'milha' ? 'milha' : 'tarifado'
  }

  const filtrados = bilhetes.filter(b =>
    !obraFiltro || b.demanda?.obra_id === obraFiltro
  )

  const total = filtrados.reduce((s, b) => s + getValor(b), 0)
  const totalAereo = filtrados.filter(b => b.demanda?.tipo === 'aereo').reduce((s, b) => s + getValor(b), 0)
  const totalRodo = filtrados.filter(b => b.demanda?.tipo === 'rodoviario').reduce((s, b) => s + getValor(b), 0)
  const totalHosp = filtrados.filter(b => b.demanda?.tipo === 'hospedagem').reduce((s, b) => s + getValor(b), 0)

  function getDescricao(b) {
    const d = b.demanda
    if (!d) return '—'
    if (d.tipo === 'hospedagem') return d.cidade
    return `${d.origem} → ${d.destino}`
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: '#1A1614' }}>Relatório de Gastos</h1>
        <p className="text-sm mt-1" style={{ color: '#6B7280' }}>Visão geral das emissões da empresa</p>
      </div>

      {/* Filtros */}
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="label">Período início</label>
            <input type="date" className="input" value={inicio} onChange={e => setInicio(e.target.value)} />
          </div>
          <div>
            <label className="label">Período fim</label>
            <input type="date" className="input" min={inicio} value={fim} onChange={e => setFim(e.target.value)} />
          </div>
          {obras.length > 0 && (
            <div>
              <label className="label">Centro de custo</label>
              <select className="input" value={obraFiltro} onChange={e => setObraFiltro(e.target.value)}>
                <option value="">Todos</option>
                {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </div>
          )}
          {/* Atalhos de período */}
          <div className="flex gap-2 pb-0.5">
            {[
              { label: 'Este mês', fn: () => {
                const n = new Date()
                setInicio(`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-01`)
                setFim(`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(new Date(n.getFullYear(), n.getMonth()+1, 0).getDate()).padStart(2,'0')}`)
              }},
              { label: 'Mês passado', fn: () => {
                const n = new Date()
                const m = n.getMonth() === 0 ? 12 : n.getMonth()
                const y = n.getMonth() === 0 ? n.getFullYear() - 1 : n.getFullYear()
                setInicio(`${y}-${String(m).padStart(2,'0')}-01`)
                setFim(`${y}-${String(m).padStart(2,'0')}-${String(new Date(y, m, 0).getDate()).padStart(2,'0')}`)
              }},
              { label: 'Este ano', fn: () => {
                const y = new Date().getFullYear()
                setInicio(`${y}-01-01`)
                setFim(`${y}-12-31`)
              }},
            ].map(s => (
              <button key={s.label} type="button" onClick={s.fn}
                className="px-3 py-2 rounded-lg text-xs font-medium border transition-colors hover:bg-gray-50"
                style={{ borderColor: '#E5E7EB', color: '#6B7280' }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-300" />
        </div>
      ) : (
        <>
          {/* Cards de totais */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <CardStat label="Total gasto" value={moeda(total)} icon={TrendingUp} color="#C0186A" />
            <CardStat label="Aéreo" value={moeda(totalAereo)} icon={Plane} color="#1D4ED8" />
            <CardStat label="Rodoviário" value={moeda(totalRodo)} icon={Bus} color="#C2410C" />
            <CardStat label="Hospedagem" value={moeda(totalHosp)} icon={Hotel} color="#7E22CE" />
          </div>

          {/* Tabela de emissões */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b" style={{ borderColor: '#E5E7EB' }}>
              <h2 className="text-sm font-semibold" style={{ color: '#1A1614' }}>
                Emissões ({filtrados.length})
              </h2>
            </div>
            {filtrados.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm" style={{ color: '#9CA3AF' }}>
                  Nenhuma emissão encontrada neste período.
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                    {['Passageiro', 'Tipo', 'Rota / Destino', 'Centro custo', 'Emitido em', 'Emissão', 'Valor'].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#6B7280' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((b, i) => (
                    <tr key={b.id}
                      style={{ borderBottom: i < filtrados.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                      <td className="px-5 py-3 text-sm font-medium" style={{ color: '#1A1614' }}>
                        {b.demanda?.passageiros
                          ? `${b.demanda.passageiros.nome} ${b.demanda.passageiros.sobrenome}`
                          : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <TipoBadge tipo={b.demanda?.tipo} />
                      </td>
                      <td className="px-5 py-3 text-sm" style={{ color: '#6B7280' }}>
                        {getDescricao(b)}
                      </td>
                      <td className="px-5 py-3 text-sm" style={{ color: '#6B7280' }}>
                        {b.demanda?.obras?.nome || '—'}
                      </td>
                      <td className="px-5 py-3 text-sm" style={{ color: '#6B7280' }}>
                        {fmtTs(b.emitido_em)}
                      </td>
                      <td className="px-5 py-3">
                        <span className="badge text-xs"
                          style={{
                            background: getTipoEmissao(b) === 'milha' ? '#F5F3FF' : '#FEF3C7',
                            color: getTipoEmissao(b) === 'milha' ? '#5B2D8E' : '#E8820C',
                          }}>
                          {getTipoEmissao(b) === 'milha' ? '✦ Milha' : '🎫 Tarifado'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm font-semibold" style={{ color: '#C0186A' }}>
                        {moeda(getValor(b))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #E5E7EB', background: '#F8F9FA' }}>
                    <td colSpan={6} className="px-5 py-3 text-sm font-semibold" style={{ color: '#1A1614' }}>
                      Total ({filtrados.length} emissões)
                    </td>
                    <td className="px-5 py-3 font-bold text-base" style={{ color: '#C0186A' }}>
                      {moeda(total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
