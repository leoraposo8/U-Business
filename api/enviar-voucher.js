// POST /api/enviar-voucher   Body: { demanda_id }
// Envia o voucher de uma demanda emitida, como anexo, para os usuarios da
// empresa marcados com perfis.recebe_vouchers = true.
//
// Envs no Vercel: SUPABASE_SERVICE_ROLE_KEY, (VITE_)SUPABASE_URL, RESEND_API_KEY,
//                 EMAIL_FROM (opcional)

import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'nodejs', maxDuration: 30 }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_KEY   = process.env.RESEND_API_KEY
const EMAIL_FROM   = process.env.EMAIL_FROM || 'U Business Travel <no-reply@ubcotacoes.com.br>'

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function fmtData(d) {
  if (!d) return null
  const [y, m, dd] = String(d).slice(0, 10).split('-')
  return `${dd}/${m}/${y}`
}

function nomeCompleto(p) {
  return [p?.nome, p?.sobrenome].filter(Boolean).join(' ')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    res.status(500).json({ detail: 'Envs SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao configuradas no Vercel' }); return
  }
  if (!RESEND_KEY) {
    res.status(500).json({ detail: 'RESEND_API_KEY nao configurada no Vercel' }); return
  }

  const auth  = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) { res.status(401).json({ detail: 'Nao autenticado' }); return }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user) { res.status(401).json({ detail: 'Token invalido' }); return }

  const { data: caller } = await admin
    .from('perfis').select('perfil').eq('id', userData.user.id).maybeSingle()
  if (!caller || !['admin_agencia', 'agente'].includes(caller.perfil)) {
    res.status(403).json({ detail: 'Sem permissao para enviar vouchers' }); return
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
  const { demanda_id } = body
  if (!demanda_id) { res.status(400).json({ detail: 'demanda_id obrigatorio' }); return }

  const { data: demanda, error: demErr } = await admin
    .from('demandas')
    .select(`id, tipo, status, origem, destino, cidade, data_ida, data_volta, checkin, checkout, empresa_id,
      obras(nome), empresas(nome), solicitante:perfis!solicitante_id(nome),
      passageiros(nome, sobrenome), demanda_passageiros(passageiros(nome, sobrenome))`)
    .eq('id', demanda_id).maybeSingle()
  if (demErr || !demanda) { res.status(404).json({ detail: 'Demanda nao encontrada' }); return }
  if (demanda.status !== 'emitido') { res.status(400).json({ detail: 'Demanda ainda nao foi emitida' }); return }

  const { data: bilhete } = await admin
    .from('bilhetes').select('voucher_url, emitido_em').eq('demanda_id', demanda_id).maybeSingle()
  if (!bilhete?.voucher_url) { res.status(400).json({ detail: 'Demanda sem voucher anexado' }); return }

  const { data: destinatarios, error: destErr } = await admin
    .from('perfis').select('id, nome')
    .eq('empresa_id', demanda.empresa_id).eq('recebe_vouchers', true).eq('ativo', true)
  if (destErr) { res.status(500).json({ detail: 'Falha ao buscar destinatarios: ' + destErr.message }); return }
  if (!destinatarios?.length) { res.status(200).json({ ok: true, enviados: [] }); return }

  const usuarios = await Promise.all(destinatarios.map(d => admin.auth.admin.getUserById(d.id)))
  const comEmail = destinatarios
    .map((d, i) => ({ nome: d.nome, email: usuarios[i].data?.user?.email }))
    .filter(d => d.email)
  if (!comEmail.length) { res.status(200).json({ ok: true, enviados: [] }); return }
  const emails = comEmail.map(d => d.email)

  const paxLista = (demanda.demanda_passageiros ?? []).map(r => r.passageiros).filter(Boolean)
  const pax = (paxLista.length ? paxLista : demanda.passageiros ? [demanda.passageiros] : [])
    .map(nomeCompleto).filter(Boolean)
  const paxTexto = pax.join(', ') || '—'

  const isHosp = demanda.tipo === 'hospedagem'
  const rota = isHosp ? `Hospedagem em ${demanda.cidade}` : `${demanda.origem} → ${demanda.destino}`
  const datas = isHosp
    ? `${fmtData(demanda.checkin) ?? '—'} a ${fmtData(demanda.checkout) ?? '—'}`
    : [fmtData(demanda.data_ida), fmtData(demanda.data_volta)].filter(Boolean).join(' / ') || '—'

  const linhas = [
    ['Passageiro' + (pax.length > 1 ? 's' : ''), paxTexto],
    [isHosp ? 'Hospedagem' : 'Trecho', rota],
    [isHosp ? 'Período' : 'Datas', datas],
    ['Centro de custo', demanda.obras?.nome || '—'],
    ['Solicitante', demanda.solicitante?.nome || '—'],
  ]

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#1A1614">
      <p>Olá,</p>
      <p>Segue em anexo o voucher emitido.</p>
      <table style="border-collapse:collapse;margin:12px 0">
        ${linhas.map(([k, v]) => `
          <tr>
            <td style="padding:4px 16px 4px 0;color:#6B7280">${esc(k)}</td>
            <td style="padding:4px 0;font-weight:bold">${esc(v)}</td>
          </tr>`).join('')}
      </table>
      <p><a href="${esc(bilhete.voucher_url)}" style="color:#C0186A">Abrir voucher</a></p>
      <p style="color:#9CA3AF;font-size:12px">U Business Travel</p>
    </div>`

  const ext = (new URL(bilhete.voucher_url).pathname.split('.').pop() || 'pdf').toLowerCase()
  const slug = (pax[0] || 'voucher').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: emails,
      subject: `Voucher emitido — ${paxTexto} — ${rota}`,
      html,
      attachments: [{ filename: `voucher-${slug}.${ext}`, path: bilhete.voucher_url }],
    }),
  })
  if (!r.ok) {
    const erro = await r.json().catch(() => ({}))
    console.error('[enviar-voucher] resend erro:', r.status, erro)
    res.status(502).json({ detail: erro.message || `Resend respondeu ${r.status}` }); return
  }

  res.status(200).json({ ok: true, enviados: comEmail.map(d => d.nome) })
}
