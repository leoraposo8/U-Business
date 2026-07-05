// Proxy: POST /proposta-api/gerar-proposta -> API no Render.
// A chave PROPOSTA_API_KEY fica so aqui no server (nao vai no bundle).

export const config = { runtime: 'nodejs', maxDuration: 60 }

const API_URL = process.env.PROPOSTA_API_URL || 'https://ubusiness-proposta-api.onrender.com'
const API_KEY = process.env.PROPOSTA_API_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return }
  if (!API_KEY) { res.status(500).json({ detail: 'PROPOSTA_API_KEY nao configurada no Vercel' }); return }

  try {
    // req.body ja vem parseado pelo Vercel para application/json
    const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})

    const upstream = await fetch(`${API_URL}/gerar-proposta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: payload,
    })

    const buf = Buffer.from(await upstream.arrayBuffer())
    res.status(upstream.status)
    const ct = upstream.headers.get('content-type')
    if (ct) res.setHeader('content-type', ct)
    res.setHeader('content-length', String(buf.length))
    res.end(buf)
  } catch (err) {
    console.error('[gerar-proposta] erro:', err)
    res.status(502).json({ detail: `Proxy falhou: ${err.message}` })
  }
}
