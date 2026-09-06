// POST /api/importar-dta
// Cria 46 usuarios da DTA via Admin API (sem email). Chamado UMA vez.
// Idempotente: pula quem ja existe.
//
// Header: Authorization: Bearer <access_token do admin_agencia logado>
//
// Envs no Vercel: SUPABASE_SERVICE_ROLE_KEY, (VITE_)SUPABASE_URL

import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'nodejs', maxDuration: 300 }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMPRESA_DTA  = '19280c94-4d6a-4576-9be5-0716ba201c47'
const SENHA        = 'TmpDta@2026'

const USERS = [
  { email: 'a.sanches@dtaengenharia.com.br',       nome: 'Allace',            sob: 'Sanches da Silva',                         cpf: '03350289266', tel: '(91) 99136-0292', perfil: 'aprovador_1' },
  { email: 'a.acien@dtaengenharia.com.br',         nome: 'Antonio',           sob: 'Acien Martinez',                           cpf: '70230027156', tel: '(11) 99462-6095', perfil: 'aprovador_1' },
  { email: 'c.costa@dtaengenharia.com.br',         nome: 'Celly Camille',     sob: 'Da Costa de Oliveira',                     cpf: '50876072848', tel: '(11)97666-8838',  perfil: 'aprovador_1' },
  { email: 'd.kohl@dtaengenharia.com.br',          nome: 'Daniel',            sob: 'Kohl',                                     cpf: '22015305807', tel: '(13) 97402-6484', perfil: 'aprovador_1' },
  { email: 'f.faria@dtaengenharia.com.br',         nome: 'Fillipi',           sob: 'Augusto de Freitas Faria',                 cpf: '35486539878', tel: '(11) 99462-6095', perfil: 'aprovador_1' },
  { email: 'g.dias@dtaengenharia.com.br',          nome: 'Gabriel',           sob: 'Almeida Abrantes Abussafi de Lima Dias',   cpf: '37499271897', tel: '(11) 98178-5401', perfil: 'aprovador_1' },
  { email: 'g.leite@dtaengenharia.com.br',         nome: 'Gabriela',          sob: 'Rocha Leite',                              cpf: '09354150926', tel: '(11) 99132-0846', perfil: 'aprovador_1' },
  { email: 'g.giorgiano@dtaengenharia.com.br',     nome: 'Gustavo Luis',      sob: 'Giorgiano',                                cpf: '36215345806', tel: '(11) 4357-1031',  perfil: 'aprovador_1' },
  { email: 'j.bohn@dtaengenharia.com.br',          nome: 'João Pedro',        sob: 'Jorge Bohn',                               cpf: '03355872083', tel: '(11) 97668-9325', perfil: 'aprovador_1' },
  { email: 'presidencia@dtaengenharia.com.br',     nome: 'Natália',           sob: 'Colombo Jazra Galvan',                     cpf: '33929004860', tel: '(11)97515-6793',  perfil: 'aprovador_1' },
  { email: 'r.felippe@dtaengenharia.com.br',       nome: 'Raphael',           sob: 'Felippe',                                  cpf: '34514523836', tel: '(14) 98103-7880', perfil: 'aprovador_1' },
  { email: 'r.beloto@dtaengenharia.com.br',        nome: 'Renan',             sob: 'Beloto dos Santos',                        cpf: '38673456860', tel: '(11) 93267-4247', perfil: 'aprovador_1' },
  { email: 'r.saraiva@dtaengenharia.com.br',       nome: 'Robson',            sob: 'Da Silva Saraiva',                         cpf: '34038963829', tel: '(13) 99725-1145', perfil: 'aprovador_1' },
  { email: 'r.ruic@dtaengenharia.com.br',          nome: 'Rodrigo Jose',      sob: 'Moura Ruic',                               cpf: '29545826851', tel: '(11) 98193-3586', perfil: 'aprovador_1' },
  { email: 'r.claudino@dtaengenharia.com.br',      nome: 'Ruan Cesar',        sob: 'Pinto Claudino',                           cpf: '00731384016', tel: '(51) 9922-3086',  perfil: 'aprovador_1' },
  { email: 'a.rodrigues@dtaengenharia.com.br',     nome: 'Andreza',           sob: 'Hana Rodrigues',                           cpf: '38445296833', tel: '(11)94552-2991',  perfil: 'aprovador_2' },
  { email: 'c.colonhesi@dtaengenharia.com.br',     nome: 'Carolina',          sob: 'Storti Colonhesi de Carvalho',             cpf: '40453797890', tel: '(11) 93353-6334', perfil: 'aprovador_2' },
  { email: 'e.gimenes@dtaengenharia.com.br',       nome: 'Erika',             sob: 'De Sa Gimenes',                            cpf: '22710364883', tel: '(11) 96314-9747', perfil: 'aprovador_2' },
  { email: 'j.digiorgi@dtaengenharia.com.br',      nome: 'Juliana',           sob: 'Digiorgi de Andrade',                      cpf: '31636817866', tel: '(11) 98910-6873', perfil: 'aprovador_2' },
  { email: 'a.ramaglia@dtaengenharia.com.br',      nome: 'Andressa Cristina', sob: 'Ramaglia da Mota',                         cpf: '41821347889', tel: null,              perfil: 'solicitante' },
  { email: 'a.viana@dtaengenharia.com.br',         nome: 'Aneia',             sob: 'Viana da Silva',                           cpf: '27832443812', tel: '(11) 97191-7770', perfil: 'solicitante' },
  { email: 'a.gutierrez@dtaengenharia.com.br',     nome: 'Arthur',            sob: 'De Carvalho Gutierrez',                    cpf: '35007490890', tel: '(11) 95793-8781', perfil: 'solicitante' },
  { email: 'b.gomes@dtaengenharia.com.br',         nome: 'Bruna',             sob: 'Gomes dos Santos',                         cpf: '48659792807', tel: null,              perfil: 'solicitante' },
  { email: 'c.peter@dtaengenharia.com.br',         nome: 'Caroline',          sob: 'Peter',                                    cpf: '04494448052', tel: '(11) 99008-5691', perfil: 'solicitante' },
  { email: 'd.ricardi@dtaegenharia.com.br',        nome: 'Daniel',            sob: 'Ricardi',                                  cpf: '26774737803', tel: '(11) 99513-3844', perfil: 'solicitante' },
  { email: 'd.dezzotti@dtaengenharia.com.br',      nome: 'Douglas',           sob: 'Dezzotti',                                 cpf: '47957142826', tel: null,              perfil: 'solicitante' },
  { email: 'e.fortner@dtaengenharia.com.br',       nome: 'Eric',              sob: 'Fortner',                                  cpf: '49677447882', tel: '(11) 99990-5411', perfil: 'solicitante' },
  { email: 'f.berlinck@dtaengenharia.com.br',      nome: 'Felipe',            sob: 'Sorroche Berlinck',                        cpf: '37033636814', tel: '(11) 96845-1272', perfil: 'solicitante' },
  { email: 'f.helene@dtaengenharia.com.br',        nome: 'Fernanda',          sob: 'Helene',                                   cpf: '48511162844', tel: '(14) 99608-0656', perfil: 'solicitante' },
  { email: 'g.borillo@dtaengenharia.com.br',       nome: 'Guilherme',         sob: 'Cardoso Borillo',                          cpf: '38380276809', tel: '(11) 99312-5283', perfil: 'solicitante' },
  { email: 'g.cordova@dtaengenharia.com.br',       nome: 'Guilherme',         sob: 'Cordova Santos',                           cpf: '06441449986', tel: null,              perfil: 'solicitante' },
  { email: 'h.tomo@dtaengenharia.com.br',          nome: 'Haron Carlos',      sob: 'Tomo',                                     cpf: '33996537867', tel: null,              perfil: 'solicitante' },
  { email: 'k.souza@dtaengenharia.com.br',         nome: 'Iana',              sob: 'Karen de Souza',                           cpf: '59590238220', tel: null,              perfil: 'solicitante' },
  { email: 'i.santos@dtaengenharia.com.br',        nome: 'Itamar',            sob: 'Tertulino dos Santos',                     cpf: '30120652889', tel: null,              perfil: 'solicitante' },
  { email: 'j.prado@dtaengenharia.com.br',         nome: 'Jorge',             sob: 'Prado Vieira Leite',                       cpf: '37504950840', tel: '(11) 4192-1510',  perfil: 'solicitante' },
  { email: 'l.ferreira@dtaengenharia.com.br',      nome: 'Jose Luiz',         sob: 'Ferreira',                                 cpf: '05173112832', tel: '(13) 97402-6484', perfil: 'solicitante' },
  { email: 'l.mendonca@dtaengenharia.com.br',      nome: 'Labieno',           sob: 'Teixeira de Mendonça Filho',               cpf: '46936211704', tel: '(11) 98330-0377', perfil: 'solicitante' },
  { email: 'l.tomida@dtaengenharia.com.br',        nome: 'Leonardo',          sob: 'Tomida Spalletti Simoes',                  cpf: '32310065897', tel: '(11) 97177-5848', perfil: 'solicitante' },
  { email: 'l.marchetotti@dtaengenharia.com.br',   nome: 'Luana',             sob: 'De Freitas Marchetotti',                   cpf: '03291225090', tel: null,              perfil: 'solicitante' },
  { email: 'l.santos@dtaengenharia.com.br',        nome: 'Luana',             sob: 'Santos da Silva',                          cpf: '29468878805', tel: '(11) 99382-6862', perfil: 'solicitante' },
  { email: 'm.rocha@dtaengenharia.com.br',         nome: 'Marbio',            sob: 'Joen Rocha Pereira',                       cpf: '35163753886', tel: '(11) 94552-3609', perfil: 'solicitante' },
  { email: 'm.mesquita@dtaengenharia.com.br',      nome: 'Marcos Vinicius',   sob: 'Carvalho de Mesquita',                     cpf: '39455640856', tel: '(11) 94080-3447', perfil: 'solicitante' },
  { email: 'm.scazufca@dtaengenharia.com.br',      nome: 'Mauro',             sob: 'Scazufca',                                 cpf: '04018181876', tel: '(11) 99382-6662', perfil: 'solicitante' },
  { email: 'r.rebelo@dtaengenharia.com.br',        nome: 'Renadja',           sob: 'Rebelo Banheza de Lima',                   cpf: '34159222862', tel: '(11) 97662-1426',  perfil: 'solicitante' },
  { email: 'v.montenegro@dtaengenharia.com.br',    nome: 'Valencia',          sob: 'Monte Negro Neta',                         cpf: '13859726706', tel: null,              perfil: 'solicitante' },
  { email: 'r.correa@dtaengenharia.com.br',        nome: 'Rosemeire',         sob: 'Aparecida Correa',                         cpf: '16115017840', tel: '(11) 99314-5680', perfil: 'solicitante' },
]

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    res.status(500).json({ detail: 'Envs SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao configuradas' }); return
  }

  const auth  = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) { res.status(401).json({ detail: 'Nao autenticado' }); return }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Autoriza: precisa ser admin_agencia
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user) { res.status(401).json({ detail: 'Token invalido' }); return }
  const { data: caller } = await admin.from('perfis').select('perfil').eq('id', userData.user.id).single()
  if (!caller || caller.perfil !== 'admin_agencia') {
    res.status(403).json({ detail: 'Sem permissao' }); return
  }

  // Obra Viagens
  const { data: obras, error: obrasErr } = await admin
    .from('obras').select('id, nome').eq('empresa_id', EMPRESA_DTA)
  if (obrasErr) { res.status(500).json({ detail: obrasErr.message }); return }
  const obraViagens = (obras || []).find(o => (o.nome || '').toLowerCase() === 'viagens')
  if (!obraViagens) { res.status(500).json({ detail: 'Obra "Viagens" nao encontrada na DTA' }); return }

  // Lista usuarios existentes uma unica vez (pra check de duplicata)
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  const emailToId = new Map((existing?.users || []).map(u => [u.email?.toLowerCase(), u.id]))

  const results = { ok: [], reused: [], failed: [] }

  for (const u of USERS) {
    try {
      // 1. auth.users
      let authId = emailToId.get(u.email.toLowerCase())
      if (authId) {
        results.reused.push(u.email)
      } else {
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email: u.email,
          password: SENHA,
          email_confirm: true,
          user_metadata: { nome: `${u.nome} ${u.sob}`.trim() },
        })
        if (cErr) throw new Error(`createUser: ${cErr.message}`)
        authId = created.user.id
      }

      // 2. passageiro (dedup CPF)
      const { data: paxE } = await admin.from('passageiros')
        .select('id').eq('empresa_id', EMPRESA_DTA).eq('cpf', u.cpf).maybeSingle()
      let paxId
      if (paxE) {
        paxId = paxE.id
      } else {
        const { data: paxI, error: pErr } = await admin.from('passageiros').insert({
          empresa_id: EMPRESA_DTA, nome: u.nome, sobrenome: u.sob, cpf: u.cpf, contato: u.tel,
        }).select('id').single()
        if (pErr) throw new Error(`insert passageiro: ${pErr.message}`)
        paxId = paxI.id
      }

      // 3. perfil (upsert)
      const { error: perfilErr } = await admin.from('perfis').upsert({
        id: authId, empresa_id: EMPRESA_DTA,
        nome: `${u.nome} ${u.sob}`.trim(), perfil: u.perfil,
        passageiro_id: paxId, ativo: true,
      }, { onConflict: 'id' })
      if (perfilErr) throw new Error(`upsert perfil: ${perfilErr.message}`)

      // 4. Se aprovador_1: limites + obras
      if (u.perfil === 'aprovador_1') {
        await admin.from('aprovador_limites').delete().eq('usuario_id', authId)
        await admin.from('aprovador_obras').delete().eq('usuario_id', authId)
        const { error: lErr } = await admin.from('aprovador_limites').insert([
          { usuario_id: authId, tipo_item: 'aereo',      valor_limite: 0.01 },
          { usuario_id: authId, tipo_item: 'rodoviario', valor_limite: 0.01 },
          { usuario_id: authId, tipo_item: 'hospedagem', valor_limite: 0.01 },
        ])
        if (lErr) throw new Error(`insert limites: ${lErr.message}`)
        const { error: oErr } = await admin.from('aprovador_obras').insert({
          usuario_id: authId, obra_id: obraViagens.id,
        })
        if (oErr) throw new Error(`insert obra: ${oErr.message}`)
      }

      results.ok.push(u.email)
    } catch (err) {
      results.failed.push({ email: u.email, erro: err.message })
    }
  }

  res.status(200).json({
    total: USERS.length,
    criados: results.ok.length,
    reutilizados_auth: results.reused.length,
    falhas: results.failed.length,
    detalhes_falhas: results.failed,
    senha_universal: SENHA,
  })
}
