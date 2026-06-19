import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/*
══════════════════════════════════════════════════════════════
  SQL — rodar no Supabase SQL Editor antes de usar o sistema
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
  perfil text not null check (perfil in ('admin_agencia','agente','admin_cliente','aprovador','solicitante')),
  ativo boolean default true,
  created_at timestamptz default now()
);

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
    'rascunho','aguardando_opcoes','aguardando_aprovacao',
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

==============================
*/
