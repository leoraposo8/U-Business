// POST /api/atualizar-usuario
// Body: { user_id, nome, telefone, perfil, limites?, obras? }
//   - Só admin_agencia pode chamar (agência centraliza cadastros).
//   - Não permite trocar email (isso é operação do Auth; se precisar, delete e recrie).
//   - perfil ∈ { admin_agencia, agente, aprovador_1, aprovador_2, solicitante }
//   - Se perfil = aprovador_1: limites + obras obrigatórios (mesma validação
//     do convite). Se perfil != aprovador_1: apaga eventuais linhas antigas
//     em aprovador_limites e aprovador_obras (usuário mudou de nível/tipo).
//
// Envs necessárias no Vercel: SUPABASE_SERVICE_ROLE_KEY, (VITE_)SUPABASE_URL

import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'nodejs', maxDuration: 30 }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

const PERFIS_VALIDOS = ['admin_agencia', 'agente', 'aprovador_1', 'aprovador_2', 'solicitante']
const TIPOS_ITEM     = ['aereo', 'rodoviario', 'hospedagem']

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
  const { user_id, nome, telefone, perfil, limites, obras } = body

  if (!user_id || !nome || !telefone || !perfil) {
    res.status(400).json({ detail: 'user_id, nome, telefone e perfil sao obrigatorios' }); return
  }
  if (!PERFIS_VALIDOS.includes(perfil)) {
    res.status(400).json({ detail: `perfil invalido (valores aceitos: ${PERFIS_VALIDOS.join(', ')})` }); return
  }

  // Carrega o usuário-alvo pra pegar empresa_id (obrigatório na validação de
  // obras) e pra confirmar que existe.
  const { data: alvo, error: alvoErr } = await admin
    .from('perfis').select('id, empresa_id').eq('id', user_id).single()
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
      res.status(400).json({ detail: 'obras deve ser um array nao vazio de uuids' }); return
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
  // Não há transação atômica via supabase-js; a estratégia é: atualiza perfis
  // primeiro, depois sincroniza tabelas dependentes. Se dependentes falharem
  // o perfis já foi atualizado — aceitável pq os dados divergentes não geram
  // dano (roteamento trata "sem linha" como bloqueado, escala pro N2).
  try {
    const { error: updErr } = await admin.from('perfis')
      .update({ nome, telefone, perfil }).eq('id', user_id)
    if (updErr) throw updErr

    // Se saiu de aprovador_1 (ou nunca foi, mas idempotente): limpa vínculos.
    if (perfil !== 'aprovador_1') {
      await admin.from('aprovador_limites').delete().eq('usuario_id', user_id)
      await admin.from('aprovador_obras').delete().eq('usuario_id', user_id)
    } else {
      // Sincroniza limites (delete + insert é mais simples que upsert por PK
      // composta quando o conjunto de tipo_item pode variar — aqui é sempre
      // os 3, mas mantenho o padrão pra ser trivial de estender).
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

    res.status(200).json({ ok: true, user_id, nome, telefone, perfil })
  } catch (err) {
    console.error('[atualizar-usuario] erro:', err)
    res.status(500).json({ detail: err.message || 'Falha ao atualizar usuario' })
  }
}
