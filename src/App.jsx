import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AppLayout from './components/layout/AppLayout'
import Login from './pages/auth/Login'
import Dashboard from './pages/Dashboard'
import NovaDemanda from './pages/solicitante/NovaDemanda'
import ListaDemandas from './pages/solicitante/ListaDemandas'
import DetalheDemanda from './pages/solicitante/DetalheDemanda'
import FilaOpcoes from './pages/agente/FilaOpcoes'
import Clientes from './pages/admin/Clientes'
import Invoices from './pages/admin/Invoices'
import Relatorio from './pages/aprovador/Relatorio'
import { Loader2 } from 'lucide-react'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Loader2 size={28} className="animate-spin text-slate-400" />
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/app" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route path="dashboard"    element={<Dashboard />} />
        <Route path="nova-demanda" element={<NovaDemanda />} />
        <Route path="demandas"     element={<ListaDemandas />} />
        <Route path="demandas/:id" element={<DetalheDemanda />} />
        <Route path="fila"         element={<FilaOpcoes />} />
        <Route path="clientes"     element={<Clientes />} />
        <Route path="invoices"     element={<Invoices />} />
        <Route path="relatorio"    element={<Relatorio />} />
        {/* <Route path="invoices"   element={<Invoices />} /> */}
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
