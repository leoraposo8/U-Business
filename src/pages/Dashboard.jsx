import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PlusCircle, Clock, CheckCircle, Ticket, AlertCircle, Loader2 } from 'lucide-react'

function StatCard({ label, value, icon: Icon, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className="card p-5 text-left hover:shadow-md transition-shadow w-full"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">{value ?? '—'}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={20} />
        </div>
      </div>
    </button>
  )
}

export default function Dashboard() {
  const { perfil, isAgencia } = useAuth()
  const navigate = useNavigate()
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('demandas')
        .select('status')
      if (data) {
        const c = {}
        data.forEach(d => { c[d.status] = (c[d.status] ?? 0) + 1 })
        setCounts(c)
      }
      setLoading(false)
    }
    load()
  }, [])

  const stats = isAgencia
    ? [
        { label: 'Aguardando opções',    key: 'aguardando_opcoes',     icon: Clock,        color: 'bg-blue-100 text-blue-600' },
        { label: 'Aguardando aprovação', key: 'aguardando_aprovacao',  icon: AlertCircle,  color: 'bg-amber-100 text-amber-600' },
        { label: 'Aprovados p/ emitir',  key: 'aprovado',              icon: CheckCircle,  color: 'bg-green-100 text-green-600' },
        { label: 'Emitidos',             key: 'emitido',               icon: Ticket,       color: 'bg-brand-100 text-brand-600' },
      ]
    : [
        { label: 'Minhas solicitações',  key: 'rascunho',              icon: Clock,        color: 'bg-slate-100 text-slate-600' },
        { label: 'Aguardando aprovação', key: 'aguardando_aprovacao',  icon: AlertCircle,  color: 'bg-amber-100 text-amber-600' },
        { label: 'Aprovados',            key: 'aprovado',              icon: CheckCircle,  color: 'bg-green-100 text-green-600' },
        { label: 'Emitidos',             key: 'emitido',               icon: Ticket,       color: 'bg-brand-100 text-brand-600' },
      ]

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Olá, {perfil?.nome?.split(' ')[0]} 👋
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {perfil?.empresas?.nome ?? 'U Business'} · {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button
          onClick={() => navigate('/app/nova-demanda')}
          className="btn-primary"
        >
          <PlusCircle size={16} />
          Nova solicitação
        </button>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map(s => (
            <StatCard
              key={s.key}
              label={s.label}
              value={counts[s.key] ?? 0}
              icon={s.icon}
              color={s.color}
              onClick={() => navigate(`/app/demandas?status=${s.key}`)}
            />
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Ações rápidas</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => navigate('/app/nova-demanda')} className="btn-secondary">
            <PlusCircle size={15} /> Nova solicitação
          </button>
          <button onClick={() => navigate('/app/demandas')} className="btn-secondary">
            Ver todas as solicitações
          </button>
          {isAgencia && (
            <button onClick={() => navigate('/app/fila')} className="btn-secondary">
              Fila de opções pendentes
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
