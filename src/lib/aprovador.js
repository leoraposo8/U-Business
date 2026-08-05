// Roteamento inicial de aprovador (Fase 3.2 + 3.3.1).
// Dado (empresaId, obraId), decide qual aprovador deve receber a demanda.
//
// Regras (na ordem):
//   1. Se obraId, procura aprovador_1 vinculado a essa obra (via aprovador_obras).
//      Se achar mais de um, pega o primeiro por ordem de nome (determinístico).
//   2. Se não achou, procura aprovador_1 SEM nenhuma obra vinculada
//      ("N1 global" — cobre tudo da empresa). Primeiro por nome.
//   3. Se não achou, procura aprovador_2 ativo da empresa. Primeiro por nome.
//   4. Se nem N2 existe, retorna null.
//
// Retorna: { aprovadorId, motivo } — motivo é útil pra logs/UI.

export async function resolverAprovador(supabase, { empresaId, obraId }) {
  // Regra 1: N1 vinculado à obra
  if (obraId) {
    const { data: n1s } = await supabase
      .from('aprovador_obras')
      .select('usuario_id, perfis!inner(id, nome, perfil, ativo)')
      .eq('obra_id', obraId)
      .eq('perfis.perfil', 'aprovador_1')
      .eq('perfis.ativo', true)
      .order('nome', { referencedTable: 'perfis', ascending: true })
    if (n1s && n1s.length > 0) {
      return { aprovadorId: n1s[0].usuario_id, motivo: 'n1_do_cc' }
    }
  }

  // Regra 2: N1 global (sem NENHUMA obra vinculada) da mesma empresa
  const { data: n1sGlobais } = await supabase
    .from('perfis')
    .select('id, nome')
    .eq('empresa_id', empresaId)
    .eq('perfil', 'aprovador_1')
    .eq('ativo', true)
    .order('nome', { ascending: true })
  if (n1sGlobais && n1sGlobais.length > 0) {
    // Filtra apenas os que não têm NENHUMA vinculação em aprovador_obras
    const ids = n1sGlobais.map(p => p.id)
    const { data: comVinculo } = await supabase
      .from('aprovador_obras')
      .select('usuario_id')
      .in('usuario_id', ids)
    const idsComVinculo = new Set((comVinculo ?? []).map(r => r.usuario_id))
    const globais = n1sGlobais.filter(p => !idsComVinculo.has(p.id))
    if (globais.length > 0) {
      return { aprovadorId: globais[0].id, motivo: 'n1_global' }
    }
  }

  // Regra 3: N2 da empresa
  const { data: n2s } = await supabase
    .from('perfis')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('perfil', 'aprovador_2')
    .eq('ativo', true)
    .order('nome', { ascending: true })
    .limit(1)
  if (n2s && n2s.length > 0) {
    return { aprovadorId: n2s[0].id, motivo: 'n2' }
  }

  return { aprovadorId: null, motivo: 'nenhum' }
}
