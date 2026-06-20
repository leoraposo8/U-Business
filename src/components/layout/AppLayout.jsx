import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  LayoutDashboard, PlusCircle, List, Users, Building2,
  FileText, LogOut, ChevronRight, Plane, BarChart2
} from 'lucide-react'

function NavItem({ to, icon: Icon, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
          isActive
            ? 'font-medium text-white'
            : 'text-white/70 hover:text-white'
        }`
      }
      style={({ isActive }) => isActive ? { backgroundColor: 'rgba(255,255,255,0.20)' } : {}}
    >
      {({ isActive }) => (
        <>
          <Icon size={18} style={{ opacity: isActive ? 1 : 0.7 }} />
          {children}
        </>
      )}
    </NavLink>
  )
}

export default function AppLayout() {
  const { perfil, logout, isAgencia } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen" style={{ background: '#F8F9FA' }}>
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col" style={{ backgroundColor: '#C0186A' }}>
        {/* Logo */}
        <div className="px-4 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Plane size={16} className="text-white" />
            </div>
            <div>
              <p className="text-white text-sm font-semibold leading-none">U Business</p>
              <p className="text-xs leading-none mt-0.5" style={{ color: '#F9C0D8' }}>Agência de Viagens</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <NavItem to="/app/dashboard" icon={LayoutDashboard}>Dashboard</NavItem>
          <NavItem to="/app/nova-demanda" icon={PlusCircle}>Nova solicitação</NavItem>
          <NavItem to="/app/demandas" icon={List}>Solicitações</NavItem>

          {isAgencia && (
            <>
              <div className="pt-3 pb-1">
                <p className="px-3 text-xs font-medium uppercase tracking-wider"
                   style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em' }}>
                  Agência
                </p>
              </div>
              <NavItem to="/app/fila" icon={ChevronRight}>Demandas</NavItem>
              <NavItem to="/app/clientes" icon={Building2}>Clientes</NavItem>
              <NavItem to="/app/invoices" icon={FileText}>Invoices</NavItem>
            </>
          )}

          {(perfil?.perfil === 'aprovador' || perfil?.perfil === 'admin_cliente') && (
            <>
              <div className="pt-3 pb-1">
                <p className="px-3 text-xs font-medium uppercase tracking-wider"
                   style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em' }}>
                  Relatórios
                </p>
              </div>
              <NavItem to="/app/relatorio" icon={BarChart2}>Gastos</NavItem>
            </>
          )}

          {perfil?.perfil === 'admin_cliente' && (
            <>
              <div className="pt-3 pb-1">
                <p className="px-3 text-xs font-medium uppercase tracking-wider"
                   style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Empresa
                </p>
              </div>
              <NavItem to="/app/usuarios" icon={Users}>Usuários</NavItem>
            </>
          )}
        </nav>

        {/* User footer */}
        <div className="px-3 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
          <div className="px-3 py-2 mb-2">
            <p className="text-white text-sm font-medium truncate">{perfil?.nome}</p>
            <p className="text-sm truncate" style={{ color: '#F9C0D8' }}>
              {perfil?.empresas?.nome ?? 'U Business'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-all"
            style={{ color: 'rgba(255,255,255,0.7)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
          >
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto" style={{ background: '#F8F9FA' }}>
        <Outlet />
      </main>
    </div>
  )
}
