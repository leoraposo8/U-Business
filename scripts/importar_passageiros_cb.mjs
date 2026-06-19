/**
 * IMPORTAÇÃO DE PASSAGEIROS — CB Construções
 * 
 * Rode UMA VEZ no terminal após configurar o .env.local:
 *   node scripts/importar_passageiros_cb.mjs
 * 
 * Pré-requisito: empresa CB Construções já criada no Supabase.
 * Ajuste o EMPRESA_ID abaixo com o UUID correto da tabela `empresas`.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))

// ── CONFIGURAÇÃO ─────────────────────────────────────────────────
const SUPABASE_URL     = process.env.VITE_SUPABASE_URL     || 'https://SEU_PROJETO.supabase.co'
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY  || 'sua_service_role_key'
const EMPRESA_ID       = process.env.CB_EMPRESA_ID         || 'UUID_DA_EMPRESA_CB'
// ─────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)

const passageiros = JSON.parse(
  readFileSync(join(__dir, '../cb_passageiros.json'), 'utf8')
).map(p => ({ ...p, empresa_id: EMPRESA_ID }))

console.log(`Importando ${passageiros.length} passageiros para empresa ${EMPRESA_ID}...`)

// Insere em lotes de 50
for (let i = 0; i < passageiros.length; i += 50) {
  const lote = passageiros.slice(i, i + 50)
  const { error } = await supabase.from('passageiros').insert(lote)
  if (error) {
    console.error(`Erro no lote ${i}–${i+50}:`, error.message)
  } else {
    console.log(`✓ Lote ${i + 1}–${Math.min(i + 50, passageiros.length)} importado`)
  }
}

console.log('Importação concluída!')
