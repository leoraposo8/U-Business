// Proxy server-side pra API de proposta hospedada no Render.
// Front chama /proposta-api/<qualquer-coisa>; Vercel injeta X-API-Key aqui.
// Assim a chave nunca sai no bundle JS.

const API_URL = process.env.PROPOSTA_API_URL || 'https://ubusiness-proposta-api.onrender.com'
const API_KEY = process.env.PROPOSTA_API_KEY

export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  if (!API_KEY) {
    res.status(500).json({ detail: 'PROPOSTA_API_KEY nao configurada no Vercel' })
    return
  }

  const parts = Array.isArray(req.query.path) ? req.query.path : [req.query.path].filter(Boolean)
  const subpath = parts.join('/')
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  const target = `${API_URL}/${subpath}${qs}`

  const headers = { 'X-API-Key': API_KEY }
  const ct = req.headers['content-type']
  if (ct) headers['content-type'] = ct

  let body
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = []
    for await (const c of req) chunks.push(c)
    body = Buffer.concat(chunks)
  }

  try {
    const upstream = await fetch(target, { method: req.method, headers, body })
    res.status(upstream.status)
    upstream.headers.forEach((v, k) => {
      const kl = k.toLowerCase()
      if (kl === 'content-encoding' || kl === 'transfer-encoding' || kl === 'connection') return
      res.setHeader(k, v)
    })
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.end(buf)
  } catch (err) {
    res.status(502).json({ detail: `Proxy falhou: ${err.message}` })
  }
}
