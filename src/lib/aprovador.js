// Roteamento inicial de aprovador.
// Dado (empresaId, obraId), decide qual aprovador deve receber a demanda.
//
// Regras (na ordem):
//   1. Se obraId, procura aprovador_1 vinculado a essa obra (via aprovador_obras).
//      Se achar mais de um, pega o primeiro por ordem de nome (determinístico).
//   2. Se não achou, procura aprovador_2 ativo da empresa. Primeiro por nome.
//   3. Se nem N2 existe, retorna null.
//
// Regra de produto: CC é sempre obrigatório na demanda (validado em NovaDemanda),
// e aprovador_1 sempre vinculado a pelo menos 1 CC (validado em UsuarioModal).
// Empresas sem divisão devem ter o CC padrão "Viagens" criado com a empresa.
//
// Retorna: { aprovadorId, motivo }.

export async function resolverAprovador(supabase, { empresaId, obraId }) {
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
