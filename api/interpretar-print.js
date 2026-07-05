// Proxy: POST /proposta-api/interpretar-print -> API no Render.
// Body vem multipart/form-data, entao lemos o stream cru e repassamos.

export const config = { runtime: 'nodejs', maxDuration: 60 }

const API_URL = process.env.PROPOSTA_API_URL || 'https://ubusiness-proposta-api.onrender.com'
const API_KEY = process.env.PROPOSTA_API_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return }
  if (!API_KEY) { res.status(500).json({ detail: 'PROPOSTA_API_KEY nao configurada no Vercel' }); return }

  try {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = Buffer.concat(chunks)

    const upstream = await fetch(`${API_URL}/interpretar-print`, {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/octet-stream',
        'X-API-Key': API_KEY,
      },
      body,
    })

    const buf = Buffer.from(await upstream.arrayBuffer())
    res.status(upstream.status)
    const ct = upstream.headers.get('content-type')
    if (ct) res.setHeader('content-type', ct)
    res.end(buf)
  } catch (err) {
    console.error('[interpretar-print] erro:', err)
    res.status(502).json({ detail: `Proxy falhou: ${err.message}` })
  }
}
