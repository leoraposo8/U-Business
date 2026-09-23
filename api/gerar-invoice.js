// POST /api/gerar-invoice  Body: DOC do modelo de invoice/recibo (ver proposta-api/invoice.py)
// So admin_agencia. Repassa pra API no Render com a PROPOSTA_API_KEY (fica so no server).
// Resposta: { ok, arquivo, avisos, pdf_base64 } ou { detail } com o erro da conferencia.

import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'nodejs', maxDuration: 60 }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const API_URL = process.env.PROPOSTA_API_URL || 'https://ubusiness-proposta-api.onrender.com'
const API_KEY = process.env.PROPOSTA_API_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return }
  if (!API_KEY) { res.status(500).json({ detail: 'PROPOSTA_API_KEY nao configurada no Vercel' }); return }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    res.status(500).json({ detail: 'Envs SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao configuradas no Vercel' }); return
  }

  const auth  = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) { res.status(401).json({ detail: 'Nao autenticado' }); return }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user) { res.status(401).json({ detail: 'Token invalido' }); return }
  const { data: caller } = await admin.from('perfis').select('perfil').eq('id', userData.user.id).maybeSingle()
  if (caller?.perfil !== 'admin_agencia') { res.status(403).json({ detail: 'Sem permissao' }); return }

  try {
    const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})
    const upstream = await fetch(`${API_URL}/gerar-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: payload,
    })
    const json = await upstream.json().catch(() => ({ detail: `API respondeu ${upstream.status}` }))
    res.status(upstream.status).json(json)
  } catch (err) {
    console.error('[gerar-invoice] erro:', err)
    res.status(502).json({ detail: `Proxy falhou: ${err.message}` })
  }
}
