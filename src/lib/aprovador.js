// Roteamento inicial de aprovador.
// Dado (empresaId, obraId, solicitanteId), decide qual aprovador deve receber
// a demanda e em que nivel ela entra.
//
// Modelos de aprovacao suportados (empresas.modelo_aprovacao):
//
//   'alcada' (padrao): fluxo por alcada financeira.
//     - Tenta aprovador_1 vinculado ao CC. Se nao houver, cai pro aprovador_2.
//     - Nivel inicial = 1 (ou 2 no fallback).
//
//   'organograma': fluxo por hierarquia (independe de valor).
//     Escolhe o nivel INICIAL de aprovacao baseado no perfil do proprio
//     solicitante — porque o "ele mesmo aprova" da hierarquia significa
//     que o pedido pula quem esta no nivel do solicitante:
//       solicitante         -> nivel 0 (skip nivel 1 depois -> vai pro 2)
//       aprovador_nivel_0   -> nivel 1
//       aprovador_1         -> nivel 2
//       aprovador_2         -> auto-aprova (aprovadorId = ele mesmo, nivel=null)
//     Qualquer aprovador do nivel escolhido serve — pega o 1o por nome.
//
// Retorna: { aprovadorId, nivel, motivo, autoAprovar }
//   - aprovadorId: uuid do aprovador designado (ou solicitante em auto-aprovar)
//   - nivel: 0/1/2 quando ha aprovacao pendente; null quando auto-aprovar
//   - autoAprovar: true quando o proprio solicitante aprova (nivel_2 no organograma)

const NIVEL_INICIAL_ORGANOGRAMA = {
  solicitante:        0,
  aprovador_nivel_0:  1,
  aprovador_1:        2,
  aprovador_2:        null, // auto-aprova
}

const PERFIL_POR_NIVEL = {
  0: 'aprovador_nivel_0',
  1: 'aprovador_1',
  2: 'aprovador_2',
}

async function pegaPrimeiroDoNivel(supabase, empresaId, nivel) {
  const perfilTarget = PERFIL_POR_NIVEL[nivel]
  const { data } = await supabase
    .from('perfis')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('perfil', perfilTarget)
    .eq('ativo', true)
    .order('nome', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

export async function resolverAprovador(supabase, { empresaId, obraId, solicitanteId }) {
  // Carrega modelo da empresa e perfil do solicitante em paralelo.
  const [empRes, solRes] = await Promise.all([
    supabase.from('empresas').select('modelo_aprovacao').eq('id', empresaId).maybeSingle(),
    solicitanteId
      ? supabase.from('perfis').select('perfil').eq('id', solicitanteId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const modelo = empRes.data?.modelo_aprovacao || 'alcada'
  const perfilSol = solRes.data?.perfil

  if (modelo === 'organograma') {
    const nivel = NIVEL_INICIAL_ORGANOGRAMA[perfilSol] ?? 0
    if (nivel === null) {
      // Auto-aprovacao: aprovador_2 pedindo pra si mesmo
      return { aprovadorId: solicitanteId, nivel: null, autoAprovar: true, motivo: 'auto_nivel_2' }
    }
    const aprovadorId = await pegaPrimeiroDoNivel(supabase, empresaId, nivel)
    if (aprovadorId) {
      return { aprovadorId, nivel, motivo: `organograma_nivel_${nivel}` }
    }
    // Fallback: se nao acha alguem do nivel, sobe pro proximo disponivel
    for (const n of [1, 2]) {
      if (n <= nivel) continue
      const alt = await pegaPrimeiroDoNivel(supabase, empresaId, n)
      if (alt) return { aprovadorId: alt, nivel: n, motivo: `organograma_fallback_${n}` }
    }
    return { aprovadorId: null, nivel: null, motivo: 'organograma_sem_aprovador' }
  }

  // Modelo alcada (padrao)
  if (obraId) {
    const { data: n1s } = await supabase
      .from('aprovador_obras')
      .select('usuario_id, perfis!inner(id, nome, perfil, ativo)')
      .eq('obra_id', obraId)
      .eq('perfis.perfil', 'aprovador_1')
      .eq('perfis.ativo', true)
      .order('nome', { referencedTable: 'perfis', ascending: true })
    if (n1s && n1s.length > 0) {
      return { aprovadorId: n1s[0].usuario_id, nivel: 1, motivo: 'n1_do_cc' }
    }
  }

  const { data: n2s } = await supabase
    .from('perfis')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('perfil', 'aprovador_2')
    .eq('ativo', true)
    .order('nome', { ascending: true })
    .limit(1)
  if (n2s && n2s.length > 0) {
    return { aprovadorId: n2s[0].id, nivel: 2, motivo: 'n2' }
  }

  return { aprovadorId: null, nivel: null, motivo: 'nenhum' }
}
