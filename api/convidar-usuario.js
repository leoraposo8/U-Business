// POST /api/convidar-usuario  { email, nome, perfil, empresa_id }
// Cria user no Supabase Auth via Admin API e envia convite pra definir senha.
// Precisa das envs no Vercel: SUPABASE_SERVICE_ROLE_KEY e (VITE_)SUPABASE_URL.

import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'nodejs', maxDuration: 30 }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

const PERFIS_ADMIN_AGENCIA = ['admin_agencia', 'agente', 'admin_cliente', 'aprovador', 'solicitante']
const PERFIS_ADMIN_CLIENTE = ['aprovador', 'solicitante']

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    res.status(500).json({ detail: 'Envs SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao configuradas no Vercel' })
    return
  }

  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) { res.status(401).json({ detail: 'Nao autenticado' }); return }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user) { res.status(401).json({ detail: 'Token invalido' }); return }
  const callerId = userData.user.id

  const { data: caller, error: perfilErr } = await admin
    .from('perfis').select('perfil, empresa_id').eq('id', callerId).single()
  if (perfilErr || !caller) { res.status(403).json({ detail: 'Perfil do usuario nao encontrado' }); return }

  const permitidos = caller.perfil === 'admin_agencia' ? PERFIS_ADMIN_AGENCIA
                    : caller.perfil === 'admin_cliente' ? PERFIS_ADMIN_CLIENTE
                    : null
  if (!permitidos) { res.status(403).json({ detail: 'Sem permissao para convidar usuarios' }); return }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
  const { email, nome, perfil, empresa_id } = body
  if (!email || !nome || !perfil) { res.status(400).json({ detail: 'email, nome e perfil sao obrigatorios' }); return }
  if (!permitidos.includes(perfil)) { res.status(400).json({ detail: 'Perfil nao permitido para quem esta convidando' }); return }

  // admin_cliente sempre convida pra propria empresa
  const empresaFinal = caller.perfil === 'admin_cliente' ? caller.empresa_id : empresa_id
  if (!empresaFinal && perfil !== 'admin_agencia' && perfil !== 'agente') {
    res.status(400).json({ detail: 'empresa_id obrigatorio para este perfil' }); return
  }

  const origin = req.headers.origin || (req.headers.host ? `https://${req.headers.host}` : '')
  const redirectTo = origin ? `${origin}/redefinir-senha` : undefined

  try {
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { nome },
      redirectTo,
    })
    if (inviteErr) throw inviteErr

    const { error: insertErr } = await admin.from('perfis').insert({
      id: invited.user.id,
      empresa_id: empresaFinal || null,
      nome,
      perfil,
    })
    if (insertErr) {
      // se falhou o insert do perfil, apagar o user recem-criado pra nao ficar orfao
      await admin.auth.admin.deleteUser(invited.user.id).catch(() => {})
      throw insertErr
    }

    res.status(200).json({ ok: true, user_id: invited.user.id, email, nome, perfil })
  } catch (err) {
    console.error('[convidar-usuario] erro:', err)
    res.status(500).json({ detail: err.message || 'Falha ao convidar usuario' })
  }
}
