// POST /api/atualizar-usuario
// Body: {
//   user_id, nome, telefone, perfil,
//   cpf?, sobrenome?, nascimento?,
//   azul_tudoazul?, latam_latampass?, smiles_gol?,
//   limites?, obras?
// }
//
// - Só admin_agencia pode chamar.
// - Não permite trocar email (operação do Auth; delete e recrie se precisar).
// - Se perfil = aprovador_1: limites + obras obrigatórios. Se != aprovador_1:
//   apaga eventuais linhas antigas em aprovador_limites e aprovador_obras.
//
// Passageiro:
//   - Se cpf vier no payload:
//       (a) User já tem passageiro_id → atualiza os campos desse passageiro
//           (cpf, nome, sobrenome, contato, nascimento, milhas).
//       (b) User NÃO tem passageiro_id → lookup por (empresa_id, cpf).
//           Se acha, vincula. Se não acha, cria novo + vincula.
//   - Se cpf NÃO vier: não mexe em passageiro nenhum.
//
// Envs: SUPABASE_SERVICE_ROLE_KEY, (VITE_)SUPABASE_URL

import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'nodejs', maxDuration: 30 }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

const PERFIS_VALIDOS = ['admin_agencia', 'agente', 'aprovador_1', 'aprovador_2', 'solicitante']
const TIPOS_ITEM     = ['aereo', 'rodoviario', 'hospedagem']

function normalizaCpf(cpf) {
  if (!cpf) return null
  const digits = String(cpf).replace(/\D/g, '')
  return digits.length ? digits : null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    res.status(500).json({ detail: 'Envs SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao configuradas no Vercel' })
    return
  }

  const auth  = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) { res.status(401).json({ detail: 'Nao autenticado' }); return }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ─── AUTENTICAÇÃO ────────────────────────────────────────────────────────
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user) { res.status(401).json({ detail: 'Token invalido' }); return }
  const callerId = userData.user.id

  const { data: caller, error: perfilErr } = await admin
    .from('perfis').select('perfil').eq('id', callerId).single()
  if (perfilErr || !caller) { res.status(403).json({ detail: 'Perfil do usuario nao encontrado' }); return }
  if (caller.perfil !== 'admin_agencia') {
    res.status(403).json({ detail: 'Sem permissao para atualizar usuarios' }); return
  }

  // ─── VALIDAÇÃO DO BODY ───────────────────────────────────────────────────
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
  const {
    user_id, nome, telefone, perfil,
    cpf: cpfRaw, sobrenome, nascimento,
    azul_tudoazul, latam_latampass, smiles_gol,
    limites, obras,
  } = body

  if (!user_id || !nome || !telefone || !perfil) {
    res.status(400).json({ detail: 'user_id, nome, telefone e perfil sao obrigatorios' }); return
  }
  if (!PERFIS_VALIDOS.includes(perfil)) {
    res.status(400).json({ detail: `perfil invalido (valores aceitos: ${PERFIS_VALIDOS.join(', ')})` }); return
  }

  const cpf = normalizaCpf(cpfRaw)
  if (cpf && cpf.length !== 11) {
    res.status(400).json({ detail: 'cpf deve ter 11 digitos' }); return
  }

  // Carrega o usuário-alvo (empresa_id + passageiro_id atual).
  const { data: alvo, error: alvoErr } = await admin
    .from('perfis').select('id, empresa_id, passageiro_id').eq('id', user_id).single()
  if (alvoErr || !alvo) { res.status(404).json({ detail: 'Usuario nao encontrado' }); return }

  // ─── VALIDAÇÃO ESPECÍFICA DE APROVADOR_1 ─────────────────────────────────
  let limitesLimpos = null
  let obrasLimpas   = null
  if (perfil === 'aprovador_1') {
    if (!alvo.empresa_id) {
      res.status(400).json({ detail: 'aprovador_1 precisa pertencer a uma empresa' }); return
    }
    if (!Array.isArray(limites) || limites.length !== TIPOS_ITEM.length) {
      res.status(400).json({ detail: `limites deve conter exatamente ${TIPOS_ITEM.length} entradas (uma por tipo_item)` }); return
    }
    const tiposRecebidos = new Set(limites.map(l => l?.tipo_item))
    if (TIPOS_ITEM.some(t => !tiposRecebidos.has(t))) {
      res.status(400).json({ detail: `limites deve cobrir todos os tipos: ${TIPOS_ITEM.join(', ')}` }); return
    }
    try {
      limitesLimpos = limites.map(l => {
        if (!TIPOS_ITEM.includes(l.tipo_item)) throw new Error(`tipo_item invalido: ${l.tipo_item}`)
        const v = l.valor_limite
        if (v !== null && (typeof v !== 'number' || !isFinite(v) || v < 0)) {
          throw new Error(`valor_limite invalido para ${l.tipo_item}`)
        }
        return { tipo_item: l.tipo_item, valor_limite: v }
      })
    } catch (e) { res.status(400).json({ detail: e.message }); return }

    if (!Array.isArray(obras) || obras.length === 0) {
      res.status(400).json({ detail: 'obras deve ser um array nao vazio de uuids (pelo menos 1 CC)' }); return
    }
    const { data: obrasCheck, error: obrasErr } = await admin
      .from('obras').select('id').in('id', obras).eq('empresa_id', alvo.empresa_id)
    if (obrasErr) { res.status(500).json({ detail: 'Falha ao validar obras' }); return }
    if ((obrasCheck?.length ?? 0) !== obras.length) {
      res.status(400).json({ detail: 'uma ou mais obras nao pertencem a esta empresa' }); return
    }
    obrasLimpas = obras
  }

  // ─── ATUALIZAÇÃO ─────────────────────────────────────────────────────────
  try {
    let passageiroIdFinal = alvo.passageiro_id

    // 1. Sincronia passageiro (só se cpf veio no payload)
    if (cpf && alvo.empresa_id) {
      const camposPassageiro = {
        nome,
        sobrenome:       sobrenome        ?? null,
        cpf,
        nascimento:      nascimento       || null,
        contato:         telefone,
        azul_tudoazul:   azul_tudoazul    || null,
        latam_latampass: latam_latampass  || null,
        smiles_gol:      smiles_gol       || null,
      }

      if (alvo.passageiro_id) {
        // (a) Atualiza o passageiro já linkado.
        const { error: paxUpdErr } = await admin.from('passageiros')
          .update(camposPassageiro).eq('id', alvo.passageiro_id)
        if (paxUpdErr) throw paxUpdErr
        passageiroIdFinal = alvo.passageiro_id
      } else {
        // (b) User sem passageiro — lookup por CPF na empresa.
        const { data: existente, error: paxErr } = await admin
          .from('passageiros').select('id')
          .eq('empresa_id', alvo.empresa_id).eq('cpf', cpf)
          .maybeSingle()
        if (paxErr) throw paxErr

        if (existente) {
          passageiroIdFinal = existente.id
        } else {
          const { data: novoPax, error: paxInsErr } = await admin.from('passageiros').insert({
            empresa_id: alvo.empresa_id, ...camposPassageiro,
          }).select('id').single()
          if (paxInsErr) throw paxInsErr
          passageiroIdFinal = novoPax.id
        }
      }
    }

    // 2. Atualiza perfil (com passageiro_id se mudou).
    const perfilUpdate = { nome, telefone, perfil }
    if (passageiroIdFinal !== alvo.passageiro_id) {
      perfilUpdate.passageiro_id = passageiroIdFinal
    }
    const { error: updErr } = await admin.from('perfis')
      .update(perfilUpdate).eq('id', user_id)
    if (updErr) throw updErr

    // 3. Sincronia alçadas / obras.
    if (perfil !== 'aprovador_1') {
      await admin.from('aprovador_limites').delete().eq('usuario_id', user_id)
      await admin.from('aprovador_obras').delete().eq('usuario_id', user_id)
    } else {
      const { error: delLimErr } = await admin.from('aprovador_limites').delete().eq('usuario_id', user_id)
      if (delLimErr) throw delLimErr
      const { error: insLimErr } = await admin.from('aprovador_limites').insert(
        limitesLimpos.map(l => ({ usuario_id: user_id, ...l }))
      )
      if (insLimErr) throw insLimErr

      const { error: delObrErr } = await admin.from('aprovador_obras').delete().eq('usuario_id', user_id)
      if (delObrErr) throw delObrErr
      const { error: insObrErr } = await admin.from('aprovador_obras').insert(
        obrasLimpas.map(obra_id => ({ usuario_id: user_id, obra_id }))
      )
      if (insObrErr) throw insObrErr
    }

    res.status(200).json({
      ok: true, user_id, nome, telefone, perfil,
      passageiro_id: passageiroIdFinal,
    })
  } catch (err) {
    console.error('[atualizar-usuario] erro:', err)
    res.status(500).json({ detail: err.message || 'Falha ao atualizar usuario' })
  }
}
