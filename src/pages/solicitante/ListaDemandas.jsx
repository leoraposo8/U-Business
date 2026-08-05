import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import StatusBadge from '../../components/ui/StatusBadge'
import TipoBadge from '../../components/ui/TipoBadge'
import { Loader2, Search, PlusCircle, ChevronRight } from 'lucide-react'
import { fmtTs, fmtData, fmtDataCurta } from '../../lib/datetime'

const STATUS_OPTS = [
  { value: '', label: 'Todos os status' },
  { value: 'aguardando_opcoes',      label: 'Aguardando opções' },
  { value: 'aguardando_aprovacao',   label: 'Aguardando aprovação N1' },
  { value: 'aguardando_aprovacao_2', label: 'Aguardando aprovação N2' },
  { value: 'aprovado',               label: 'Aprovado' },
  { value: 'emitido',                label: 'Emitido' },
  { value: 'rejeitado',              label: 'Rejeitado' },
]

// fmt -> use fmtData from lib/datetime
// fmtTs imported from lib/datetime

function dataEmbarque(d) {
  return d.data_ida || d.checkin || null
}

function PaxCell({ demanda_passageiros: dp, passageiro }) {
  const [show, setShow] = useState(false)
  // Use demanda_passageiros if available, fallback to single passageiro
  const dpList = (dp ?? []).map(r => r.passageiros).filter(Boolean)
  const paxList = dpList.length > 0 ? dpList : passageiro ? [passageiro] : []
  if (paxList.length === 0) return <span style={{ color: '#9CA3AF' }}>—</span>

  const primeiroNomes = paxList.map(p => p.nome.split(' ')[0])
  const resumo = primeiroNomes.slice(0, 2).join(', ') + (paxList.length > 2 ? ` +${paxList.length - 2}` : '')

  return (
    <div className="relative inline-block"
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span className="cursor-default border-b border-dashed text-sm font-medium"
        style={{ color: '#1A1614', borderColor: '#C0186A' }}>
        {resumo}
      </span>
      {show && (
        <div className="absolute z-20 left-0 top-6 bg-white border rounded-xl shadow-lg p-3 min-w-48"
          style={{ borderColor: '#E5E7EB' }}>
          {paxList.map((p, i) => (
            <p key={i} className="text-xs py-1" style={{ color: '#1A1614' }}>
              {p.nome} {p.sobrenome}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ListaDemandas() {
  const { perfil, isAgencia, isAprovador1, isAprovador2 } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [demandas, setDemandas] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState(searchParams.get('status') ?? '')

  useEffect(() => {
    async function load() {
      setLoading(true)
      let q = supabase.from('demandas').select(`
        id, tipo, status, origem, destino, data_ida, data_volta,
        cidade, checkin, checkout, observacoes, created_at, updated_at, pacote_id,
        passageiro:passageiros(nome, sobrenome),
        passageiros(nome, sobrenome),
        demanda_passageiros(passageiros(nome, sobrenome)),
        obras(nome),
        empresas(nome),
        perfis!solicitante_id(nome)
      `).order('created_at', { ascending: false })
      if (filtroStatus) q = q.eq('status', filtroStatus)

      // Fase 3.3 — Filtro por role no client (RLS ainda protege multi-tenant):
      //   - admin_agencia / agente: veem tudo
      //   - aprovador (N1 ou N2): só demandas onde é aprovador OU solicitante
      //   - solicitante: só as suas
      if (perfil?.id && !isAgencia) {
        if (isAprovador1 || isAprovador2) {
          q = q.or(`aprovador_id.eq.${perfil.id},solicitante_id.eq.${perfil.id}`)
        } else {
          q = q.eq('solicitante_id', perfil.id)
        }
      }

      const { data } = await q
      const demList = data ?? []

      // Busca o último historico de cada demanda que teve mudança de status
      if (demList.length > 0) {
        const ids = demList.map(d => d.id)
        const { data: hist } = await supabase
          .from('demanda_historico')
          .select('demanda_id, created_at, status_novo, status_anterior')
          .in('demanda_id', ids)
          .order('created_at', { ascending: false })

        const lastUpdate = {}
        const opcoesEnv = {}
        ;(hist ?? []).forEach(h => {
          if (h.status_anterior !== null && !lastUpdate[h.demanda_id]) lastUpdate[h.demanda_id] = h.created_at
          if (h.status_novo === 'aguardando_aprovacao' && !opcoesEnv[h.demanda_id]) opcoesEnv[h.demanda_id] = h.created_at
        })
        setDemandas(demList.map(d => ({
          ...d,
          _ultimo_status: lastUpdate[d.id] ?? null,
          _opcoes_enviadas: opcoesEnv[d.id] ?? null,
        })))
      } else {
        setDemandas([])
      }
      setLoading(false)
    }
    load()
  }, [filtroStatus, perfil?.id, isAgencia, isAprovador1, isAprovador2])

  const filtradas = demandas.filter(d => {
    if (!busca) return true
    const s = busca.toLowerCase()
    return (
      d.passageiros?.nome?.toLowerCase().includes(s) ||
      d.origem?.toLowerCase().includes(s) ||
      d.destino?.toLowerCase().includes(s) ||
      d.cidade?.toLowerCase().includes(s)
    )
  })

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6 gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: '#1A1614' }}>Solicitações</h1>
          <p className="text-xs md:text-sm mt-1" style={{ color: '#6B7280' }}>{filtradas.length} resultado{filtradas.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => navigate('/app/nova-demanda')} className="btn-primary flex-shrink-0">
          <PlusCircle size={16} /> <span className="hidden sm:inline">Nova solicitação</span><span className="sm:hidden">Nova</span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar rota, cidade..."
            value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <select className="input sm:max-w-xs" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="card flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-300" />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="card py-16 text-center">
          <p className="text-sm text-gray-400">Nenhuma solicitação encontrada.</p>
          <button onClick={() => navigate('/app/nova-demanda')} className="btn-primary mt-4">
            <PlusCircle size={15} /> Criar primeira solicitação
          </button>
        </div>
      ) : (
        <>
          {/* MOBILE: cards */}
          <div className="md:hidden space-y-3">
            {filtradas.map(d => {
              const paxN = (d.demanda_passageiros ?? []).filter(r => r.passageiros).length || (d.passageiros ? 1 : 0)
              const detalhe = d.tipo === 'hospedagem' ? d.cidade
                : d.tipo === 'posvenda' ? 'Pós-venda'
                : `${d.origem ?? '—'} → ${d.destino ?? '—'}`
              const paxNome = d.passageiros ? `${d.passageiros.nome ?? ''} ${d.passageiros.sobrenome ?? ''}`.trim() : '—'
              return (
                <button key={d.id} onClick={() => navigate(`/app/demandas/${d.id}`)}
                  className="card p-4 w-full text-left hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate" style={{ color: '#1A1614' }}>{paxNome}</p>
                      {paxN > 1 && <p className="text-[11px]" style={{ color: '#9CA3AF' }}>+{paxN - 1} passageiro{paxN > 2 ? 's' : ''}</p>}
                    </div>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <TipoBadge tipo={d.tipo} />
                    <span className="text-sm" style={{ color: '#1A1614' }}>{detalhe}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-2 border-t" style={{ borderColor: '#F3F4F6', color: '#9CA3AF' }}>
                    <span>Solicitado {fmtTs(d.created_at)}</span>
                    {isAgencia && d.empresas?.nome && (
                      <span className="font-medium truncate ml-2" style={{ color: '#6B7280' }}>{d.empresas.nome}</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* DESKTOP: tabela */}
          <div className="hidden md:block card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#6B7280' }}>Passageiros</th>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#6B7280' }}>Qtd</th>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#6B7280' }}>Tipo</th>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#6B7280' }}>Detalhe do Pedido</th>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#6B7280' }}>Pacote</th>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#6B7280' }}>Solicitado em</th>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#6B7280' }}>Último status</th>
                {isAgencia && <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#6B7280' }}>Empresa</th>}
                {isAgencia && <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#6B7280' }}>Solicitante</th>}
                <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#6B7280' }}>Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtradas.map(d => (
                <tr key={d.id} onClick={() => navigate(`/app/demandas/${d.id}`)}
                  className="cursor-pointer transition-colors hover:bg-gray-50"
                  style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td className="px-5 py-4">
                    <PaxCell demanda_passageiros={d.demanda_passageiros} passageiro_principal={d.passageiros} />
                  </td>
                  <td className="px-5 py-4 text-sm" style={{ color: '#6B7280' }}>
                    {(() => {
                      const n = (d.demanda_passageiros ?? []).filter(r => r.passageiros).length
                      return n > 0 ? n : d.passageiros ? 1 : '—'
                    })()}
                  </td>
                  <td className="px-5 py-4"><TipoBadge tipo={d.tipo} /></td>
                  <td className="px-5 py-4 text-sm max-w-xs" style={{ color: '#6B7280' }}>
                    {d.tipo === 'hospedagem'
                      ? d.cidade
                      : d.tipo === 'posvenda'
                        ? (() => {
                            const obs = d.observacoes ?? ''
                            const partes = obs.split('|').map(p => p.trim())
                            const tipoStr = partes[0] || 'PÓS-VENDA'
                            const locParte = partes.find(p => p.startsWith('Localizador:'))
                            const loc = locParte ? locParte.replace('Localizador:', '').trim() : ''
                            return loc ? `${loc} · ${tipoStr}` : tipoStr
                          })()
                      : `${d.origem} → ${d.destino}`}
                  </td>
                  <td className="px-5 py-4 text-sm">
                    {d.pacote_id ? (
                      <span className="badge" style={{ background: '#F3F0FF', color: '#5B2D8E', fontSize: 10 }}>
                        {d.pacote_id.slice(0,6)}
                      </span>
                    ) : <span style={{ color: '#D1D5DB' }}>—</span>}
                  </td>
                  <td className="px-5 py-4 text-sm" style={{ color: '#6B7280' }}>
                    {fmtTs(d.created_at)}
                  </td>
                  <td className="px-5 py-4 text-sm" style={{ color: d._ultimo_status ? '#6B7280' : '#D1D5DB' }}>
                    {d._ultimo_status ? fmtTs(d._ultimo_status) : '—'}
                  </td>
                  {isAgencia && <td className="px-5 py-4 text-sm font-medium" style={{ color: '#1A1614' }}>{d.empresas?.nome ?? '—'}</td>}
                  {isAgencia && <td className="px-5 py-4 text-sm" style={{ color: '#6B7280' }}>{d.perfis?.nome ?? '—'}</td>}
                  <td className="px-5 py-4"><StatusBadge status={d.status} /></td>
                  <td className="px-5 py-4"><ChevronRight size={16} style={{ color: '#D1D5DB' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  )
}
