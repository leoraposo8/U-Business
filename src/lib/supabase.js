import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/*
══════════════════════════════════════════════════════════════
  SQL — schema completo (rodar no Supabase SQL Editor).
  Fonte-de-verdade: este comentário reflete o estado do banco
  após todas as migrations em `supabase/migrations/`.
══════════════════════════════════════════════════════════════

-- EMPRESAS
create table empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  ativo boolean default true,
  created_at timestamptz default now()
);

-- OBRAS / CENTROS DE CUSTO
create table obras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  nome text not null,
  codigo text,
  ativo boolean default true,
  created_at timestamptz default now()
);

-- PERFIS (complemento ao auth.users do Supabase)
create table perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid references empresas(id),  -- null = U Business
  nome text not null,
  telefone text,                            -- p/ notificação WhatsApp
  perfil text not null check (perfil in ('admin_agencia','agente','aprovador_1','aprovador_2','solicitante')),
  ativo boolean default true,
  created_at timestamptz default now()
);

-- ALÇADAS DO APROVADOR_1 (aprovador_2 é ilimitado por definição)
-- valor_limite NULL = ilimitado pra este tipo (checkbox "ilimitado" na UI).
-- A UI obriga o cadastro dos 3 tipos (aereo, rodoviario, hospedagem);
-- se faltar linha, o roteamento trata como bloqueado e escala pro nível 2.
create table aprovador_limites (
  usuario_id   uuid not null references perfis(id) on delete cascade,
  tipo_item    text not null check (tipo_item in ('aereo','rodoviario','hospedagem')),
  valor_limite numeric(12,2) check (valor_limite is null or valor_limite >= 0),
  primary key (usuario_id, tipo_item)
);

-- VÍNCULO N:N APROVADOR_1 ↔ OBRAS (centros de custo que ele cobre).
-- Obra sem aprovador_1 vinculado → demanda vai direto pro aprovador_2.
create table aprovador_obras (
  usuario_id uuid not null references perfis(id) on delete cascade,
  obra_id    uuid not null references obras(id)  on delete cascade,
  primary key (usuario_id, obra_id)
);
create index aprovador_obras_obra_idx on aprovador_obras(obra_id);

-- PASSAGEIROS (quem viaja — pode não ter login)
create table passageiros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  nome text not null,
  cpf text,
  rg text,
  nascimento date,
  contato text,
  created_at timestamptz default now()
);

-- DEMANDAS
create table demandas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id),
  obra_id uuid references obras(id),                    -- opcional
  solicitante_id uuid references perfis(id),
  passageiro_id uuid references passageiros(id),
  tipo text not null check (tipo in ('aereo','rodoviario','hospedagem')),
  status text not null default 'rascunho' check (status in (
    'rascunho','aguardando_opcoes','aguardando_aprovacao','aguardando_aprovacao_2',
    'aprovado','emitido','rejeitado','cancelado'
  )),
  agente_id uuid references perfis(id),
  aprovador_id uuid references perfis(id),

  -- campos aéreo + rodoviário
  origem text,
  destino text,
  data_ida date,
  data_volta date,
  bagagem boolean default false,   -- apenas aéreo; padrão: sem bagagem

  -- campos hospedagem
  cidade text,
  checkin date,
  checkout date,

  -- comum
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- OPÇÕES (propostas do agente — 1 a N por demanda)
create table opcoes (
  id uuid primary key default gen_random_uuid(),
  demanda_id uuid references demandas(id) on delete cascade,
  descricao text,
  companhia text,
  horario_ida text,
  horario_volta text,
  preco_venda numeric(10,2),       -- visível para todos (cliente aprova)
  imagem_print_url text,           -- print da consolidadora
  tipo_emissao text default 'normal' check (tipo_emissao in ('normal','milha')),
  created_at timestamptz default now()
);

-- APROVAÇÕES
create table aprovacoes (
  id uuid primary key default gen_random_uuid(),
  demanda_id uuid references demandas(id),
  opcao_id uuid references opcoes(id),
  aprovador_id uuid references perfis(id),
  decisao text check (decisao in ('aprovado','rejeitado')),
  comentario text,
  created_at timestamptz default now()
);

-- BILHETES EMITIDOS
create table bilhetes (
  id uuid primary key default gen_random_uuid(),
  demanda_id uuid references demandas(id),
  opcao_id uuid references opcoes(id),
  companhia text,
  localizador text,
  assento text,
  arquivo_url text,
  voucher_url text,
  emitido_por uuid references perfis(id),
  emitido_em timestamptz default now()
);

-- INVOICES
create table invoices (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id),
  obra_id uuid references obras(id),   -- opcional
  periodo_inicio date,
  periodo_fim date,
  status text default 'rascunho' check (status in ('rascunho','enviado','pago')),
  pdf_url text,
  created_at timestamptz default now()
);

create table invoice_itens (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade,
  bilhete_id uuid references bilhetes(id),
  descricao text,
  valor numeric(10,2)
);

-- HISTÓRICO DE STATUS (auditoria)
create table demanda_historico (
  id uuid primary key default gen_random_uuid(),
  demanda_id uuid references demandas(id),
  status_anterior text,
  status_novo text,
  usuario_id uuid references perfis(id),
  comentario text,
  created_at timestamptz default now()
);

-- RLS: habilitar em todas as tabelas
alter table empresas enable row level security;
alter table obras enable row level security;
alter table perfis enable row level security;
alter table passageiros enable row level security;
alter table demandas enable row level security;
alter table opcoes enable row level security;
alter table aprovacoes enable row level security;
alter table bilhetes enable row level security;
alter table invoices enable row level security;
alter table invoice_itens enable row level security;
alter table demanda_historico enable row level security;
alter table aprovador_limites enable row level security;
alter table aprovador_obras enable row level security;

-- FUNÇÃO auxiliar: retorna empresa_id do usuário logado
create or replace function minha_empresa_id()
returns uuid language sql security definer
as $$ select empresa_id from perfis where id = auth.uid() $$;

-- FUNÇÃO auxiliar: retorna perfil do usuário logado
create or replace function meu_perfil()
returns text language sql security definer
as $$ select perfil from perfis where id = auth.uid() $$;

-- POLICIES básicas (empresa vê só os próprios dados; agência vê tudo)
create policy "empresa_vê_próprias_demandas" on demandas
  for all using (
    empresa_id = minha_empresa_id()
    or meu_perfil() in ('admin_agencia','agente')
  );

create policy "empresa_vê_próprias_opcoes" on opcoes
  for all using (
    exists (
      select 1 from demandas d
      where d.id = opcoes.demanda_id
        and (d.empresa_id = minha_empresa_id()
             or meu_perfil() in ('admin_agencia','agente'))
    )
  );

create policy "perfis_próprio_e_agência" on perfis
  for all using (
    id = auth.uid()
    or empresa_id = minha_empresa_id()
    or meu_perfil() in ('admin_agencia','agente')
  );

-- Leitura de alçadas: próprio aprovador vê; qualquer um da mesma empresa
-- lê (necessário pro roteamento); agência vê tudo. Escrita: só admin_agencia.
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

create policy "aprovador_limites_write" on aprovador_limites
  for all using (meu_perfil() = 'admin_agencia')
  with check (meu_perfil() = 'admin_agencia');

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

==============================
*/
