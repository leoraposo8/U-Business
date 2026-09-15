// Roteamento inicial de aprovador.
// Modelos de aprovacao suportados (empresas.modelo_aprovacao):
//
//   'alcada' (padrao): fluxo por alcada financeira.
//     - Tenta aprovador_1 vinculado ao CC. Se nao houver, cai pro aprovador_2.
//
//   'organograma': fluxo por hierarquia com aprovador direto por pessoa.
//     - Se quem cria e SOLICITANTE ou APROVADOR_NIVEL_0: usa o
//       `aprovador_direto_id` do proprio solicitante. Nivel = do perfil desse
//       aprovador direto. Fallback (se null): primeiro aprovador do proximo
//       nivel por nome ASC.
//     - Se quem cria e APROVADOR_1: vai direto pra nivel 2 (qualquer nivel_2).
//     - Se quem cria e APROVADOR_2: auto-aprova (aprovadorId = ele mesmo, nivel=null).
//
// Retorna: { aprovadorId, nivel, motivo, autoAprovar }

const PERFIL_POR_NIVEL = { 0: 'aprovador_nivel_0', 1: 'aprovador_1', 2: 'aprovador_2' }
const NIVEL_POR_PERFIL = { aprovador_nivel_0: 0, aprovador_1: 1, aprovador_2: 2 }

async function primeiroDoNivel(supabase, empresaId, nivel) {
  const perfilTarget = PERFIL_POR_NIVEL[nivel]
  if (!perfilTarget) return null
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
  const [empRes, solRes] = await Promise.all([
    supabase.from('empresas').select('modelo_aprovacao').eq('id', empresaId).maybeSingle(),
    solicitanteId
      ? supabase.from('perfis').select('perfil, aprovador_direto_id').eq('id', solicitanteId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const modelo    = empRes.data?.modelo_aprovacao || 'alcada'
  const perfilSol = solRes.data?.perfil
  const adId      = solRes.data?.aprovador_direto_id

  if (modelo === 'organograma') {
    // Se o proprio solicitante e aprovador, ele mesmo endossa/aprova antes de escalar.
    if (perfilSol === 'aprovador_2') {
      return { aprovadorId: solicitanteId, nivel: 2, motivo: 'auto_nivel_2' }
    }
    if (perfilSol === 'aprovador_1') {
      return { aprovadorId: solicitanteId, nivel: 1, motivo: 'auto_nivel_1' }
    }
    if (perfilSol === 'aprovador_nivel_0') {
      return { aprovadorId: solicitanteId, nivel: 0, motivo: 'auto_nivel_0' }
    }
    // Solicitante regular: usa aprovador_direto configurado
    if (adId) {
      const { data: ad } = await supabase
        .from('perfis').select('perfil').eq('id', adId).maybeSingle()
      const nivelAd = NIVEL_POR_PERFIL[ad?.perfil]
      if (nivelAd !== undefined) {
        return { aprovadorId: adId, nivel: nivelAd, motivo: `aprovador_direto_${ad.perfil}` }
      }
    }
    // Fallback pra solicitante sem aprovador_direto: primeiro nivel_0 por nome
    const idFallback = await primeiroDoNivel(supabase, empresaId, 0)
    if (idFallback) {
      return { aprovadorId: idFallback, nivel: 0, motivo: 'fallback_nivel_0' }
    }
    // Ultimo recurso: qualquer nivel_2
    const n2 = await primeiroDoNivel(supabase, empresaId, 2)
    if (n2) return { aprovadorId: n2, nivel: 2, motivo: 'fallback_final_nivel_2' }
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
