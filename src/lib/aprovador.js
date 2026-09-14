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

  // debug: veja no DevTools -> Console
  console.log('[resolverAprovador]',
    JSON.stringify({ empresaId, obraId, solicitanteId, modelo, perfilSol, adId,
      solRes_error: solRes.error?.message, solRes_data: solRes.data }))

  if (modelo === 'organograma') {
    // Nivel_2 criando: auto-aprova
    if (perfilSol === 'aprovador_2') {
      return { aprovadorId: solicitanteId, nivel: null, autoAprovar: true, motivo: 'auto_nivel_2' }
    }
    // Nivel_1 criando: vai direto pra nivel_2 (qualquer)
    if (perfilSol === 'aprovador_1') {
      const id = await primeiroDoNivel(supabase, empresaId, 2)
      return { aprovadorId: id, nivel: 2, motivo: 'nivel_1_pra_nivel_2' }
    }
    // Solicitante ou nivel_0: usa aprovador_direto do proprio requisitante
    if (adId) {
      const adRes = await supabase
        .from('perfis').select('perfil').eq('id', adId).maybeSingle()
      console.log('[resolverAprovador.ad]', JSON.stringify({ adId, adData: adRes.data, adError: adRes.error?.message }))
      const nivelAd = NIVEL_POR_PERFIL[adRes.data?.perfil]
      if (nivelAd !== undefined) {
        return { aprovadorId: adId, nivel: nivelAd, motivo: `aprovador_direto_${adRes.data.perfil}` }
      }
    }
    // Fallback: primeiro nivel_0 (pra solicitante) ou primeiro nivel_1 (pra nivel_0)
    const nivelFallback = perfilSol === 'aprovador_nivel_0' ? 1 : 0
    const idFallback = await primeiroDoNivel(supabase, empresaId, nivelFallback)
    if (idFallback) {
      return { aprovadorId: idFallback, nivel: nivelFallback, motivo: `fallback_nivel_${nivelFallback}` }
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
