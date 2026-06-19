# U Business Travel — Design Document
**Data:** 09/06/2026  
**Versão:** 1.0  
**Autor:** U Business Agência de Viagens

---

## 1. Visão Geral

Sistema web multi-tenant de gestão de demandas de viagem corporativa. Permite que empresas clientes solicitem, aprovem e acompanhem passagens (voo, ônibus, hotel) através de um portal centralizado — eliminando o caos de grupos de WhatsApp e dando controle financeiro aos gestores.

**Proposta de valor:**
- Para o cliente: visibilidade total dos gastos, controle de aprovação, histórico por obra/centro de custo
- Para a U Business: diferencial competitivo, processo organizado, faturamento facilitado

---

## 2. Arquitetura

### Stack
| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| Frontend | React + Tailwind CSS | Responsivo, funciona no celular |
| Backend + DB | Supabase (PostgreSQL + Auth) | Gratuito, multi-tenant nativo, RLS |
| Hospedagem | Vercel | Gratuito, deploy automático via Git |
| Geração PDF | Python/ReportLab (já pronto) | Vouchers sem preço |

### Multi-tenancy
Cada empresa cliente é um **tenant** isolado. Row Level Security (RLS) do Supabase garante que dados de um tenant nunca vazam para outro. A U Business é o super-tenant com visibilidade geral.

---

## 3. Perfis de Usuário

| Perfil | Quem é | O que pode fazer |
|--------|--------|-----------------|
| `admin_agencia` | U Business (dono/sócios) | Tudo: configurar tenants, ver todas demandas, emitir bilhetes, gerar invoices |
| `agente` | Funcionários U Business | Ver demandas atribuídas, enviar opções, registrar emissão |
| `admin_cliente` | Adm central da empresa | Cadastrar usuários da empresa, definir aprovadores, ver relatórios |
| `aprovador` | Gerentes/diretores | Aprovar ou rejeitar demandas com comentário |
| `solicitante` | Adm de obra / funcionário | Abrir novas demandas para si ou para terceiros |

---

## 4. Modelo de Dados

### Tabelas principais

```
empresas
  id, nome, cnpj, logo_url, ativo, created_at

obras (centros de custo)
  id, empresa_id, nome, codigo, responsavel, ativo

usuarios
  id, empresa_id (null = U Business), nome, email, perfil, ativo
  → auth gerenciado pelo Supabase Auth

passageiros
  id, empresa_id, nome, cpf, rg, nascimento, contato
  → pessoa física que viaja (pode não ter login no sistema)

demandas
  id, empresa_id, obra_id, solicitante_id, passageiro_id
  tipo: [aereo | rodoviario | hospedagem]
  status: [rascunho | aguardando_opcoes | aguardando_aprovacao | aprovado | emitido | rejeitado | cancelado]
  agente_id (nullable), aprovador_id (nullable)
  created_at, updated_at

  -- Campos AÉREO e RODOVIÁRIO
  origem          (texto, obrigatório)
  destino         (texto, obrigatório)
  data_ida        (data, obrigatório)
  data_volta      (data, opcional)
  bagagem         (boolean, obrigatório — apenas AÉREO; campo não exibido no RODOVIÁRIO)
  observacoes     (texto livre, opcional)
  -- Nota: classe/serviço não é campo do solicitante — decisão do agente na proposta

  -- Campos HOSPEDAGEM
  cidade          (texto, obrigatório)
  checkin         (data, obrigatório)
  checkout        (data, obrigatório)
  observacoes     (texto livre, opcional)

opcoes (enviadas pelo agente)
  id, demanda_id, descricao, companhia, horario_ida, horario_volta
  preco_venda       (valor cobrado do cliente — visível para todos)
  imagem_print_url  (print da consolidadora ou site — referência de mercado)
  tipo_emissao      [normal | milha] (opcional, uso interno do agente)
  created_at

aprovacoes
  id, demanda_id, opcao_id (nullable), aprovador_id
  decisao: [aprovado | rejeitado]
  comentario, created_at

bilhetes
  id, demanda_id, opcao_id
  companhia, localizador, assento, arquivo_url
  emitido_por (agente_id), emitido_em
  voucher_url (PDF gerado sem preço)

invoices
  id, empresa_id, periodo_inicio, periodo_fim
  obra_id (nullable — pode ser invoice geral ou por obra)
  status: [rascunho | enviado | pago]
  pdf_url, created_at

invoice_itens
  id, invoice_id, bilhete_id, descricao, valor
```

---

## 5. Fluxo Completo da Demanda

```
SOLICITANTE abre demanda
  → status: rascunho
  → preenche: tipo, passageiro, origem, destino, data, classe, obs

SISTEMA notifica agentes (badge/contador no painel — sem e-mail por ora)
  → status: aguardando_opcoes

AGENTE envia 1–3 opções (com preço, invisível ao cliente)
  → status: aguardando_aprovacao

APROVADOR vê opções (sem preço) e decide:
  ├── Aprova → status: aprovado
  └── Rejeita + comentário → status: rejeitado → volta para agente revisar

AGENTE emite o bilhete e registra:
  - localizador, assento, companhia
  - upload do arquivo original
  - sistema gera voucher PDF sem preço
  → status: emitido

ADMIN AGÊNCIA gera invoice:
  - seleciona empresa + período (ou obra específica)
  - sistema lista todos bilhetes emitidos no período
  - gera PDF de cobrança
```

---

## 6. Regras de Negócio

1. **Preço nunca visível ao cliente** — campo `preco` na tabela `opcoes` só retorna via RLS para perfis `agente` e `admin_agencia`
2. **Aprovador aprova qualquer valor** — sem teto de alçada (v1)
3. **Passageiro = qualquer pessoa** — qualquer usuário com login pode abrir solicitação. O campo passageiro indica quem vai viajar (pode ser o próprio solicitante ou outra pessoa — colega, funcionário de obra etc.)
4. **Multi-tenant isolado** — RLS garante que empresa A nunca vê dados da empresa B
5. **Preço de venda visível ao cliente** — o aprovador vê o preço de venda (o que a agência cobra) para tomar a decisão. O **custo** (o que a agência pagou) é invisível — essa é a margem protegida
6. **Voucher sem preço** — gerado automaticamente no registro do bilhete, usando o modelo já construído
6. **Auditoria** — todas mudanças de status registradas com timestamp e usuário responsável

---

## 7. Telas (MVP)

### Portal do Cliente
- **Login** — e-mail + senha (Supabase Auth)
- **Dashboard** — contadores: rascunho / aguardando / aprovado / emitido
- **Nova demanda** — formulário simples: tipo, passageiro, trecho, data, obs
- **Lista de demandas** — filtros por status, obra, período
- **Detalhe da demanda** — timeline do status + opções (sem preço) + ação de aprovação
- **Passageiros** — cadastro de quem viaja (adm_cliente e solicitante)
- **Relatórios** — gastos por obra/período (admin_cliente)

### Portal U Business (painel interno)
- **Dashboard geral** — todas demandas de todos clientes
- **Fila de opções** — demandas em `aguardando_opcoes`
- **Envio de opções** — form com preço + anexo
- **Registro de emissão** — localizador + upload + geração de voucher
- **Clientes** — gestão de empresas e usuários
- **Invoices** — geração de cobranças por empresa/período

---

## 8. Segurança

- Autenticação: Supabase Auth (JWT)
- Autorização: Row Level Security por empresa_id + perfil
- Preço oculto: policy específica no PostgreSQL
- HTTPS: automático via Vercel
- Senhas: gerenciadas pelo Supabase (bcrypt)

---

## 9. Fases de Entrega

| Fase | Escopo | Quando |
|------|--------|--------|
| MVP | Fluxo completo 1 cliente (CB Construções) + 1 agente | Primeira entrega |
| v1.1 | Multi-tenant (N clientes) + invoice PDF | Após validação |
| v1.2 | Notificações WhatsApp via Evolution API | Futuro |
| v1.3 | App mobile (PWA) | Futuro |

---

## 10. Decisões Registradas

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Notificações | Apenas painel (v1) | Solicitante já cobra aprovador via WhatsApp pessoal |
| Aprovação | Qualquer valor, 1 aprovador | Regra do cliente |
| Passageiro | Qualquer usuário logado pode solicitar para si ou para outra pessoa | Flexibilidade — não precisa de cadastro separado |
| Preço de venda | Visível a todos (aprovador, solicitante) | Aprovador precisa saber o que está aprovando |
| Custo / margem | Fora do sistema | Controlado em planilha separada pela agência |
| Print consolidadora | Agente anexa imagem como referência | Mostra o preço de mercado junto da proposta |
| Tecnologia | Supabase + React + Vercel | Stack gratuita, escalável, já conhecida |

