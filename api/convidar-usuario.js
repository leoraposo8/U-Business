// POST /api/convidar-usuario
// Body: {
//   email, nome, telefone, perfil, empresa_id,
//   cpf,                          // obrigatório qdo perfil ∈ empresa cliente
//   sobrenome?, nascimento?,      // opcionais (nascimento formato ISO YYYY-MM-DD)
//   azul_tudoazul?, latam_latampass?, smiles_gol?,   // milhas — opcionais
//   limites?, obras?              // obrigatórios se aprovador_1
// }
//
// Fluxo:
//   1. Cria user no Supabase Auth via Admin API (dispara email de convite).
//   2. Se CPF informado, procura passageiro existente na empresa. Se achar,
//      só vincula (perfil.passageiro_id = existente.id). Se não achar, cria
//      novo passageiro com os dados + vincula.
//   3. Cria perfil com passageiro_id.
//   4. Se aprovador_1, também insere aprovador_limites (3 linhas) e
//      aprovador_obras (N linhas).
//   5. Retorna { user_id, passageiro_id, passageiro_existente: bool }.
//   6. Rollback total (apaga passageiro criado + auth user) se qualquer
//      passo falhar.
//
// Envs necessárias no Vercel: SUPABASE_SERVICE_ROLE_KEY, (VITE_)SUPABASE_URL

import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'nodejs', maxDuration: 30 }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

const PERFIS_VALIDOS = ['admin_agencia', 'agente', 'aprovador_1', 'aprovador_2', 'solicitante']
const TIPOS_ITEM     = ['aereo', 'rodoviario', 'hospedagem']

// Normaliza CPF pra só dígitos (evita duplicação por diferença de máscara).
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
    .from('perfis').select('perfil, empresa_id').eq('id', callerId).single()
  if (perfilErr || !caller) { res.status(403).json({ detail: 'Perfil do usuario nao encontrado' }); return }
  if (caller.perfil !== 'admin_agencia') {
    res.status(403).json({ detail: 'Sem permissao para convidar usuarios' }); return
  }

  // ─── VALIDAÇÃO DO BODY ───────────────────────────────────────────────────
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
  const {
    email, nome, telefone, perfil, empresa_id,
    cpf: cpfRaw, sobrenome, nascimento,
    azul_tudoazul, latam_latampass, smiles_gol,
    limites, obras,
  } = body

  if (!email || !nome || !telefone || !perfil) {
    res.status(400).json({ detail: 'email, nome, telefone e perfil sao obrigatorios' }); return
  }
  if (!PERFIS_VALIDOS.includes(perfil)) {
    res.status(400).json({ detail: `perfil invalido (valores aceitos: ${PERFIS_VALIDOS.join(', ')})` }); return
  }
  const precisaEmpresa = !['admin_agencia', 'agente'].includes(perfil)
  if (precisaEmpresa && !empresa_id) {
    res.status(400).json({ detail: 'empresa_id obrigatorio para este perfil' }); return
  }

  // CPF obrigatório pros perfis de empresa cliente (regra de produto).
  const cpf = normalizaCpf(cpfRaw)
  if (precisaEmpresa && !cpf) {
    res.status(400).json({ detail: 'cpf obrigatorio para usuarios de empresa cliente' }); return
  }
  if (cpf && cpf.length !== 11) {
    res.status(400).json({ detail: 'cpf deve ter 11 digitos' }); return
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
      .from('obras').select('id').in('id', obras).eq('empresa_id', empresa_id)
    if (obrasErr) { res.status(500).json({ detail: 'Falha ao validar obras' }); return }
    if ((obrasCheck?.length ?? 0) !== obras.length) {
      res.status(400).json({ detail: 'uma ou mais obras nao pertencem a esta empresa' }); return
    }
    obrasLimpas = obras
  }

  // ─── LOOKUP DE PASSAGEIRO POR CPF (dedup) ─────────────────────────────────
  let passageiroId    = null
  let passageiroExiste = false
  let passageiroCriado = false
  let nomePassageiroExistente = null

  if (cpf && precisaEmpresa) {
    const { data: existente, error: paxErr } = await admin
      .from('passageiros')
      .select('id, nome, sobrenome')
      .eq('empresa_id', empresa_id).eq('cpf', cpf)
      .maybeSingle()
    if (paxErr) { res.status(500).json({ detail: 'Falha ao consultar passageiros' }); return }
    if (existente) {
      passageiroId = existente.id
      passageiroExiste = true
      nomePassageiroExistente = [existente.nome, existente.sobrenome].filter(Boolean).join(' ')
    }
  }

  // ─── CRIAÇÃO ─────────────────────────────────────────────────────────────
  const origin = req.headers.origin || (req.headers.host ? `https://${req.headers.host}` : '')
  const redirectTo = origin ? `${origin}/redefinir-senha` : undefined

  let novoUserId = null
  try {
    // 1. Auth user + email de convite
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { nome },
      redirectTo,
    })
    if (inviteErr) throw inviteErr
    novoUserId = invited.user.id

    // 2. Cria passageiro se não achou existente pelo CPF
    if (cpf && precisaEmpresa && !passageiroId) {
      const { data: novoPax, error: paxInsErr } = await admin.from('passageiros').insert({
        empresa_id:      empresa_id,
        nome:            nome,
        sobrenome:       sobrenome || null,
        cpf:             cpf,
        nascimento:      nascimento || null,
        contato:         telefone,
        azul_tudoazul:   azul_tudoazul   || null,
        latam_latampass: latam_latampass || null,
        smiles_gol:      smiles_gol      || null,
      }).select('id').single()
      if (paxInsErr) throw paxInsErr
      passageiroId = novoPax.id
      passageiroCriado = true
    }

    // 3. Cria perfil vinculado
    const { error: insertErr } = await admin.from('perfis').insert({
      id:            novoUserId,
      empresa_id:    precisaEmpresa ? empresa_id : null,
      nome,
      telefone,
      perfil,
      passageiro_id: passageiroId,
    })
    if (insertErr) throw insertErr

    // 4. Aprovador_1 → alçadas + obras
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

    res.status(200).json({
      ok: true,
      user_id:              novoUserId,
      passageiro_id:        passageiroId,
      passageiro_existente: passageiroExiste,
      passageiro_nome_existente: nomePassageiroExistente,
      email, nome, telefone, perfil,
    })
  } catch (err) {
    // Rollback: apaga passageiro se criado + auth user (cascata apaga o resto).
    if (passageiroCriado && passageiroId) {
      await admin.from('passageiros').delete().eq('id', passageiroId).catch(() => {})
    }
    if (novoUserId) {
      await admin.auth.admin.deleteUser(novoUserId).catch(() => {})
    }
    console.error('[convidar-usuario] erro:', err)
    res.status(500).json({ detail: err.message || 'Falha ao convidar usuario' })
  }
}
