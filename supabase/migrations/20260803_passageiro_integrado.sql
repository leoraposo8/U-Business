-- ═══════════════════════════════════════════════════════════════════════════
-- Migração: cadastro de passageiro integrado ao cadastro de usuário
-- Data: 2026-08-03
-- Contexto: pra evitar duplicação, cada perfil pode apontar pro seu
--   passageiro correspondente. CPF único por empresa vira chave de
--   deduplicação: se ao cadastrar user o CPF já existe em passageiros da
--   empresa, o endpoint só vincula ao existente. Passageiros também ganham
--   3 colunas opcionais pra numero de programa de fidelidade.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Muda:
--   1. passageiros: adiciona `azul_tudoazul`, `latam_latampass`, `smiles_gol`
--      (todas nullable — preenchimento opcional).
--   2. perfis: adiciona `passageiro_id uuid` (nullable FK → passageiros.id
--      ON DELETE SET NULL — apagar passageiro não apaga o perfil, só desliga).
--   3. Cria índice único parcial em (empresa_id, cpf) WHERE cpf IS NOT NULL
--      pra impedir passageiros duplicados dentro da mesma empresa. Nullable
--      permite passageiros sem CPF cadastrado historicamente e ignora eles
--      na unicidade.
--
-- Nota sobre coluna `cpf`: fica nullable no schema (opção A escolhida). A
-- aplicação (endpoint /api/convidar-usuario) trata como obrigatório na hora
-- do cadastro de usuário; passageiros criados avulso pela tela de demanda
-- podem seguir sem CPF caso o operador não tenha à mão.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. Colunas de programa de fidelidade em passageiros ───────────────────
alter table passageiros
  add column if not exists azul_tudoazul   text,
  add column if not exists latam_latampass text,
  add column if not exists smiles_gol      text;

-- ─── 2. Vínculo 1:1 opcional perfis → passageiros ──────────────────────────
alter table perfis
  add column if not exists passageiro_id uuid
    references passageiros(id) on delete set null;

create index if not exists perfis_passageiro_id_idx on perfis(passageiro_id);

-- ─── 3. Unicidade de CPF por empresa ───────────────────────────────────────
-- Parcial: ignora NULLs (passageiros sem CPF podem coexistir livremente).
create unique index if not exists passageiros_empresa_cpf_uniq
  on passageiros(empresa_id, cpf) where cpf is not null;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- Rollback (descomente e rode se precisar reverter):
-- ═══════════════════════════════════════════════════════════════════════════
-- begin;
--   drop index if exists passageiros_empresa_cpf_uniq;
--   drop index if exists perfis_passageiro_id_idx;
--   alter table perfis drop column if exists passageiro_id;
--   alter table passageiros
--     drop column if exists azul_tudoazul,
--     drop column if exists latam_latampass,
--     drop column if exists smiles_gol;
-- commit;
