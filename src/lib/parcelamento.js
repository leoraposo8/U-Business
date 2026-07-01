import TABELA from './parcelamento.json'

// Encontra a companhia pela sigla IATA, id ou nome (busca tolerante)
export function buscarCia(termo) {
  if (!termo) return null
  const t = String(termo).trim().toLowerCase()
  if (!t) return null
  return (
    // 1) match exato por IATA (mais confiavel a partir do print)
    TABELA.cias.find(c => c.iata.some(code => code.toLowerCase() === t)) ||
    // 2) match exato por id ou nome
    TABELA.cias.find(c => c.id === t || c.nome.toLowerCase() === t) ||
    // 3) match parcial por nome (ex.: "latam airlines" -> "LATAM")
    TABELA.cias.find(c => c.nome.toLowerCase().includes(t) || t.includes(c.nome.toLowerCase())) ||
    null
  )
}

// Numero de parcelas SEM JUROS aplicavel, considerando as excecoes.
// opcoes: { origemBrasil=true, nacional=false, fidelidade=false, ndc=false }
export function parcelasSemJuros(termo, opcoes = {}) {
  const { origemBrasil = true, nacional = false, fidelidade = false, ndc = false } = opcoes
  const cia = buscarCia(termo)
  if (!cia) return null
  if (fidelidade && cia.fidelidade) return cia.fidelidade.parcelas
  if (ndc && cia.ndc != null) return cia.ndc
  if (!origemBrasil && cia.parcelas_origem_fora != null) return cia.parcelas_origem_fora
  if (nacional && cia.parcelas_nacional != null) return cia.parcelas_nacional
  return cia.parcelas
}

export default TABELA
