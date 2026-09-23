// POST /api/enviar-voucher   Body: { demanda_id }
// Envia o voucher de uma demanda emitida, como anexo, para os usuarios da
// empresa e da agencia marcados com perfis.recebe_vouchers = true.
//
// Envs no Vercel: SUPABASE_SERVICE_ROLE_KEY, (VITE_)SUPABASE_URL, RESEND_API_KEY,
//                 EMAIL_FROM (opcional), APP_URL (opcional)

import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'nodejs', maxDuration: 30 }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_KEY   = process.env.RESEND_API_KEY
const EMAIL_FROM   = process.env.EMAIL_FROM || 'U Business Travel <no-reply@ubcotacoes.com.br>'
const APP_URL      = process.env.APP_URL || 'https://www.ubcotacoes.com.br'

// Identidade do bilhete padrao U Business
const ROXO    = '#5B2D8E'
const MAGENTA = '#C0186A'
const INK     = '#1A1614'
const CINZA   = '#6B7280'
const BORDA   = '#E5E7EB'
const RODAPE  = {
  telefone:  '+55 11 99963-4001',
  email:     'ubusiness.br@gmail.com',
  instagram: '@ubusiness.br',
  cnpj:      '44.058.861/0001-04',
}

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

export function montarEmail(d) {
  const isHosp = d.tipo === 'hospedagem'
  const rota = isHosp ? `Hospedagem em ${d.cidade}` : `${d.origem} → ${d.destino}`
  const paxTexto = d.pax.join(', ') || '—'

  const linhas = [
    [d.pax.length > 1 ? 'Passageiros' : 'Passageiro', paxTexto],
    ...(isHosp
      ? [['Cidade', d.cidade], ['Check-in', fmtData(d.checkin)], ['Check-out', fmtData(d.checkout)]]
      : [['Trecho', rota], ['Ida', fmtData(d.data_ida)], ['Volta', fmtData(d.data_volta)]]),
    ['Centro de custo', d.obra],
    ['Solicitante', d.solicitante],
  ].filter(([, v]) => v)

  const logo = `${APP_URL}/logo-ubusiness.png`
  const linhasHtml = linhas.map(([k, v], i) => `
              <tr>
                <td style="padding:10px 0;${i ? `border-top:1px solid ${BORDA};` : ''}font-size:11px;color:${CINZA};text-transform:uppercase;letter-spacing:.4px;width:140px;vertical-align:top">${esc(k)}</td>
                <td style="padding:10px 0;${i ? `border-top:1px solid ${BORDA};` : ''}font-size:14px;font-weight:700;color:${INK}">${esc(v)}</td>
              </tr>`).join('')

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F5F7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
      <tr>
        <td bgcolor="${ROXO}" style="background:${ROXO};background-image:linear-gradient(135deg,${ROXO} 0%,${MAGENTA} 100%);padding:22px 26px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="64" style="vertical-align:middle"><img src="${logo}" width="56" height="56" alt="U Business" style="display:block;border-radius:50%"></td>
              <td style="vertical-align:middle;padding-left:14px">
                <div style="font-size:11px;color:#F3E8FF;letter-spacing:1px;text-transform:uppercase">Voucher emitido</div>
                <div style="font-size:20px;font-weight:800;color:#ffffff;margin-top:2px">${esc(rota)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 26px 8px">
          <p style="margin:0 0 6px;font-size:14px;color:${INK}">Olá,</p>
          <p style="margin:0;font-size:14px;color:${INK}">Segue em anexo o voucher emitido. Confira os dados abaixo:</p>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 26px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9FA;border-radius:12px;padding:6px 18px">
            ${linhasHtml}
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 26px 26px">
          <a href="${esc(d.voucher_url)}" style="display:inline-block;background:${MAGENTA};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 22px;border-radius:10px">Abrir voucher</a>
        </td>
      </tr>
      <tr>
        <td style="border-top:1px solid ${BORDA};padding:16px 26px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="vertical-align:middle">
                <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                  <td><img src="${logo}" width="36" height="36" alt="" style="display:block;border-radius:50%"></td>
                  <td style="padding-left:10px">
                    <div style="font-size:12px;font-weight:800;color:${ROXO};letter-spacing:.5px">U BUSINESS</div>
                    <div style="font-size:10px;color:${CINZA}">CNPJ: ${RODAPE.cnpj}</div>
                  </td>
                </tr></table>
              </td>
              <td align="right" style="vertical-align:middle">
                <div style="font-size:12px;font-weight:800;color:${MAGENTA}">${RODAPE.telefone}</div>
                <div style="font-size:10px;color:${CINZA};margin-top:2px">${RODAPE.email} · ${RODAPE.instagram}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`

  return { subject: `Voucher emitido — ${paxTexto} — ${rota}`, html }
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
      obras(nome), solicitante:perfis!solicitante_id(nome),
      passageiros(nome, sobrenome), demanda_passageiros(passageiros(nome, sobrenome))`)
    .eq('id', demanda_id).maybeSingle()
  if (demErr || !demanda) { res.status(404).json({ detail: 'Demanda nao encontrada' }); return }
  if (demanda.status !== 'emitido') { res.status(400).json({ detail: 'Demanda ainda nao foi emitida' }); return }

  const { data: bilhete } = await admin
    .from('bilhetes').select('voucher_url').eq('demanda_id', demanda_id).maybeSingle()
  if (!bilhete?.voucher_url) { res.status(400).json({ detail: 'Demanda sem voucher anexado' }); return }

  // Destinatarios: pessoas da empresa cliente + da propria agencia (empresa_id nulo) marcadas.
  const { data: destinatarios, error: destErr } = await admin
    .from('perfis').select('id, nome')
    .eq('recebe_vouchers', true).eq('ativo', true)
    .or(`empresa_id.eq.${demanda.empresa_id},empresa_id.is.null`)
  if (destErr) { res.status(500).json({ detail: 'Falha ao buscar destinatarios: ' + destErr.message }); return }
  if (!destinatarios?.length) { res.status(200).json({ ok: true, enviados: [] }); return }

  const usuarios = await Promise.all(destinatarios.map(d => admin.auth.admin.getUserById(d.id)))
  const comEmail = destinatarios
    .map((d, i) => ({ nome: d.nome, email: usuarios[i].data?.user?.email }))
    .filter(d => d.email)
  if (!comEmail.length) { res.status(200).json({ ok: true, enviados: [] }); return }

  const paxLista = (demanda.demanda_passageiros ?? []).map(r => r.passageiros).filter(Boolean)
  const pax = (paxLista.length ? paxLista : demanda.passageiros ? [demanda.passageiros] : [])
    .map(nomeCompleto).filter(Boolean)

  const { subject, html } = montarEmail({
    ...demanda,
    pax,
    obra: demanda.obras?.nome,
    solicitante: demanda.solicitante?.nome,
    voucher_url: bilhete.voucher_url,
  })

  const ext = (new URL(bilhete.voucher_url).pathname.split('.').pop() || 'pdf').toLowerCase()
  const slug = (pax[0] || 'voucher').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: comEmail.map(d => d.email),
      reply_to: RODAPE.email,
      subject,
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
