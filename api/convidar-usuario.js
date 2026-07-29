// POST /api/convidar-usuario
// Body: { email, nome, telefone, perfil, empresa_id, limites?, obras? }
//   - perfil ∈ { admin_agencia, agente, aprovador_1, aprovador_2, solicitante }
//   - limites (obrigatório se perfil = aprovador_1):
//       [{ tipo_item: 'aereo'|'rodoviario'|'hospedagem', valor_limite: number|null }]
//     valor_limite null = ilimitado pra esse tipo
//   - obras (obrigatório se perfil = aprovador_1):
//       [uuid, ...] — ids de obras da mesma empresa
//
// Cria user no Supabase Auth via Admin API, envia convite pra definir senha,
// insere linha em `perfis` (+ `aprovador_limites` e `aprovador_obras` quando
// aprovador_1). Rollback total (deleta auth user, cascata apaga o resto) se
// qualquer passo falhar.
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
    .from('perfis').select('perfil, empresa_id').eq('id', callerId).single()
  if (perfilErr || !caller) { res.status(403).json({ detail: 'Perfil do usuario nao encontrado' }); return }

  // Só admin_agencia convida (agência centraliza cadastros — decisão de produto 2026-07-28).
  if (caller.perfil !== 'admin_agencia') {
    res.status(403).json({ detail: 'Sem permissao para convidar usuarios' }); return
  }

  // ─── VALIDAÇÃO DO BODY ───────────────────────────────────────────────────
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
  const { email, nome, telefone, perfil, empresa_id, limites, obras } = body

  if (!email || !nome || !telefone || !perfil) {
    res.status(400).json({ detail: 'email, nome, telefone e perfil sao obrigatorios' }); return
  }
  if (!PERFIS_VALIDOS.includes(perfil)) {
    res.status(400).json({ detail: `perfil invalido (valores aceitos: ${PERFIS_VALIDOS.join(', ')})` }); return
  }
  // Perfis de empresa cliente precisam de empresa_id; admin_agencia/agente não.
  const precisaEmpresa = !['admin_agencia', 'agente'].includes(perfil)
  if (precisaEmpresa && !empresa_id) {
    res.status(400).json({ detail: 'empresa_id obrigatorio para este perfil' }); return
  }

  // ─── VALIDAÇÃO ESPECÍFICA DE APROVADOR_1 ─────────────────────────────────
  let limitesLimpos = null
  let obrasLimpas   = null
  if (perfil === 'aprovador_1') {
    if (!Array.isArray(limites) || limites.length !== TIPOS_ITEM.length) {
      res.status(400).json({ detail: `limites deve conter exatamente ${TIPOS_ITEM.length} entradas (uma por tipo_item)` }); return
    }
    const tiposRecebidos = new Set(limites.map(l => l?.tipo_item))
    if (TIPOS_ITEM.some(t => !tiposRecebidos.has(t))) {
      res.status(400).json({ detail: `limites deve cobrir todos os tipos: ${TIPOS_ITEM.join(', ')}` }); return
    }
    limitesLimpos = limites.map(l => {
      if (!TIPOS_ITEM.includes(l.tipo_item)) throw new Error(`tipo_item invalido: ${l.tipo_item}`)
      const v = l.valor_limite
      if (v !== null && (typeof v !== 'number' || !isFinite(v) || v < 0)) {
        throw new Error(`valor_limite invalido para ${l.tipo_item}`)
      }
      return { tipo_item: l.tipo_item, valor_limite: v }
    })

    if (!Array.isArray(obras) || obras.length === 0) {
      res.status(400).json({ detail: 'obras deve ser um array nao vazio de uuids' }); return
    }
    // Todas as obras precisam pertencer à mesma empresa (isolamento multi-tenant).
    const { data: obrasCheck, error: obrasErr } = await admin
      .from('obras').select('id').in('id', obras).eq('empresa_id', empresa_id)
    if (obrasErr) { res.status(500).json({ detail: 'Falha ao validar obras' }); return }
    if ((obrasCheck?.length ?? 0) !== obras.length) {
      res.status(400).json({ detail: 'uma ou mais obras nao pertencem a esta empresa' }); return
    }
    obrasLimpas = obras
  }

  // ─── CRIAÇÃO ─────────────────────────────────────────────────────────────
  const origin = req.headers.origin || (req.headers.host ? `https://${req.headers.host}` : '')
  const redirectTo = origin ? `${origin}/redefinir-senha` : undefined

  let novoUserId = null
  try {
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { nome },
      redirectTo,
    })
    if (inviteErr) throw inviteErr
    novoUserId = invited.user.id

    const { error: insertErr } = await admin.from('perfis').insert({
      id:         novoUserId,
      empresa_id: precisaEmpresa ? empresa_id : null,
      nome,
      telefone,
      perfil,
    })
    if (insertErr) throw insertErr

    if (perfil === 'aprovador_1') {
      const { error: limErr } = await admin.from('aprovador_limites').insert(
        limitesLimpos.map(l => ({ usuario_id: novoUserId, ...l }))
      )
      if (limErr) throw limErr

      const { error: obrErr } = await admin.from('aprovador_obras').insert(
        obrasLimpas.map(obra_id => ({ usuario_id: novoUserId, obra_id }))
      )
      if (obrErr) throw obrErr
    }

    res.status(200).json({ ok: true, user_id: novoUserId, email, nome, telefone, perfil })
  } catch (err) {
    // Rollback: apagar o auth user (cascata apaga perfis e todas as tabelas
    // ligadas por ON DELETE CASCADE — aprovador_limites, aprovador_obras).
    if (novoUserId) {
      await admin.auth.admin.deleteUser(novoUserId).catch(() => {})
    }
    console.error('[convidar-usuario] erro:', err)
    res.status(500).json({ detail: err.message || 'Falha ao convidar usuario' })
  }
}
