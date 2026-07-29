-- ═══════════════════════════════════════════════════════════════════════════
-- Migração: níveis de aprovador + alçadas customizáveis + telefone
-- Data: 2026-07-29
-- Contexto: requisito da DTA Engenharia (primeiro cliente).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Muda:
--   1. perfis: adiciona coluna `telefone`
--   2. perfis: troca CHECK do campo `perfil` — remove `aprovador` e
--      `admin_cliente`, adiciona `aprovador_1` e `aprovador_2`.
--      Migra dados existentes: `aprovador` e `admin_cliente` → `aprovador_2`
--      (comportamento equivalente ao anterior: alçada ilimitada, escopo da
--      empresa toda).
--   3. demandas: troca CHECK do campo `status` — adiciona `aguardando_aprovacao_2`.
--   4. Cria `aprovador_limites (usuario_id, tipo_item, valor_limite)` —
--      só faz sentido pra aprovador_1. Semântica:
--        valor_limite numérico = teto pra aquele tipo (aprova até esse valor).
--        valor_limite NULL     = ilimitado pra aquele tipo.
--      A UI (task 3) obriga o cadastro dos 3 tipos (aereo, rodoviario,
--      hospedagem) toda vez que se cria/edita um aprovador_1. Se por algum
--      motivo faltar linha, o roteamento trata como bloqueado (escala pro 2).
--      aprovador_2 ignora esta tabela (ilimitado por definição do perfil).
--   5. Cria `aprovador_obras (usuario_id, obra_id)` — N:N. Vincula aprovador_1
--      aos centros de custo que ele cobre. Centro sem aprovador_1 → cai
--      direto pro aprovador_2.
--   6. RLS habilitado nas 2 tabelas novas, com policies pareadas às demais
--      (isolamento por empresa via join em perfis; gestão só por admin_agencia).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. perfis: telefone ───────────────────────────────────────────────────
alter table perfis add column if not exists telefone text;

-- ─── 2. perfis: novo CHECK de perfil + migração dos existentes ─────────────
alter table perfis drop constraint if exists perfis_perfil_check;

update perfis set perfil = 'aprovador_2' where perfil in ('aprovador', 'admin_cliente');

alter table perfis add constraint perfis_perfil_check
  check (perfil in ('admin_agencia','agente','aprovador_1','aprovador_2','solicitante'));

-- ─── 3. demandas: novo status aguardando_aprovacao_2 ───────────────────────
alter table demandas drop constraint if exists demandas_status_check;

alter table demandas add constraint demandas_status_check
  check (status in (
    'rascunho','aguardando_opcoes','aguardando_aprovacao','aguardando_aprovacao_2',
    'aprovado','emitido','rejeitado','cancelado'
  ));

-- ─── 4. aprovador_limites ──────────────────────────────────────────────────
create table if not exists aprovador_limites (
  usuario_id   uuid not null references perfis(id) on delete cascade,
  tipo_item    text not null check (tipo_item in ('aereo','rodoviario','hospedagem')),
  valor_limite numeric(12,2) check (valor_limite is null or valor_limite >= 0),
  -- valor_limite NULL = ilimitado pra este tipo (checkbox "ilimitado" na UI)
  primary key (usuario_id, tipo_item)
);

alter table aprovador_limites enable row level security;

-- Leitura: o próprio aprovador vê seus limites; qualquer um da mesma empresa
-- pode ler (necessário pra roteamento de aprovação); agência vê tudo.
create policy "aprovador_limites_read" on aprovador_limites
  for select using (
    usuario_id = auth.uid()
    or exists (
      select 1 from perfis p
      where p.id = aprovador_limites.usuario_id
        and (p.empresa_id = minha_empresa_id()
             or meu_perfil() in ('admin_agencia','agente'))
    )
  );

-- Escrita: só admin_agencia (agência sempre configura).
create policy "aprovador_limites_write" on aprovador_limites
  for all using (meu_perfil() = 'admin_agencia')
  with check (meu_perfil() = 'admin_agencia');

-- ─── 5. aprovador_obras ────────────────────────────────────────────────────
create table if not exists aprovador_obras (
  usuario_id uuid not null references perfis(id) on delete cascade,
  obra_id    uuid not null references obras(id)  on delete cascade,
  primary key (usuario_id, obra_id)
);

alter table aprovador_obras enable row level security;

-- Leitura: mesma lógica dos limites — todos da empresa podem ler o
-- mapeamento pra saber quem aprova qual centro de custo.
create policy "aprovador_obras_read" on aprovador_obras
  for select using (
    usuario_id = auth.uid()
    or exists (
      select 1 from perfis p
      where p.id = aprovador_obras.usuario_id
        and (p.empresa_id = minha_empresa_id()
             or meu_perfil() in ('admin_agencia','agente'))
    )
  );

create policy "aprovador_obras_write" on aprovador_obras
  for all using (meu_perfil() = 'admin_agencia')
  with check (meu_perfil() = 'admin_agencia');

-- Índice de apoio ao roteamento por obra (dado uma obra, achar aprovadores).
create index if not exists aprovador_obras_obra_idx on aprovador_obras(obra_id);

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- Rollback (rode manualmente se precisar reverter):
-- ═══════════════════════════════════════════════════════════════════════════
-- begin;
--   drop table if exists aprovador_obras;
--   drop table if exists aprovador_limites;
--   alter table demandas drop constraint if exists demandas_status_check;
--   alter table demandas add constraint demandas_status_check
--     check (status in ('rascunho','aguardando_opcoes','aguardando_aprovacao',
--                       'aprovado','emitido','rejeitado','cancelado'));
--   alter table perfis drop constraint if exists perfis_perfil_check;
--   update perfis set perfil = 'aprovador' where perfil in ('aprovador_1','aprovador_2');
--   alter table perfis add constraint perfis_perfil_check
--     check (perfil in ('admin_agencia','agente','admin_cliente','aprovador','solicitante'));
--   alter table perfis drop column if exists telefone;
-- commit;
