// Sempre formata no fuso de Brasília, independente do fuso do usuário
const TIMEZONE = 'America/Sao_Paulo'

export function fmtTs(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('pt-BR', {
    timeZone: TIMEZONE,
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

export function fmtData(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', {
    timeZone: TIMEZONE,
    day: '2-digit', month: '2-digit', year: 'numeric'
  })
}

export function fmtDataCurta(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', {
    timeZone: TIMEZONE,
    day: '2-digit', month: '2-digit'
  })
}

// Formata "yyyy-mm-dd hh:mm" -> "dd/mm · hh:mm" (compacto pro card de opcao).
export function fmtDataHoraCompacta(s) {
  if (!s) return '—'
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return String(s)
  const [_, y, mo, d, hh, mm] = m
  return `${d}/${mo} · ${hh}:${mm}`
}
