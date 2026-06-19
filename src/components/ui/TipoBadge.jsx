import { Plane, Bus, Hotel, Package, Headphones } from 'lucide-react'

const config = {
  aereo:      { label: 'Aéreo',      icon: Plane,       bg: '#EFF6FF', color: '#1D4ED8' },
  rodoviario: { label: 'Rodoviário', icon: Bus,         bg: '#FFF7ED', color: '#C2410C' },
  hospedagem: { label: 'Hospedagem', icon: Hotel,       bg: '#FAF5FF', color: '#7E22CE' },
  pacote:     { label: 'Pacote',     icon: Package,     bg: '#F0FDF4', color: '#15803D' },
  posvenda:   { label: 'Pós-venda', icon: Headphones,  bg: '#FFF1F2', color: '#BE123C' },
}

export default function TipoBadge({ tipo }) {
  const { label, icon: Icon, bg, color } = config[tipo] ?? { label: tipo, icon: null, bg: '#F3F4F6', color: '#6B7280' }
  return (
    <span className="badge gap-1" style={{ backgroundColor: bg, color }}>
      {Icon && <Icon size={11} />}
      {label}
    </span>
  )
}
