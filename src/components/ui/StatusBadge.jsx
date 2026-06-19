const config = {
  rascunho:             { label: 'Rascunho',             bg: '#F3F4F6', color: '#6B7280' },
  aguardando_opcoes:    { label: 'Aguardando opções',    bg: '#F5F3FF', color: '#5B2D8E' },
  aguardando_aprovacao: { label: 'Aguardando aprovação', bg: '#FEF3C7', color: '#E8820C' },
  aprovado:             { label: 'Aprovado',             bg: '#ECFDF5', color: '#059669' },
  emitido:              { label: 'Emitido',              bg: '#F3F4F6', color: '#6B7280' },
  rejeitado:            { label: 'Rejeitado',            bg: '#FEF2F2', color: '#DC2626' },
  cancelado:            { label: 'Cancelado',            bg: '#F3F4F6', color: '#9CA3AF' },
}

export default function StatusBadge({ status }) {
  const { label, bg, color } = config[status] ?? { label: status, bg: '#F3F4F6', color: '#6B7280' }
  return (
    <span className="badge" style={{ backgroundColor: bg, color }}>
      {label}
    </span>
  )
}
