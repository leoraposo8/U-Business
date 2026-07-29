# U Business Travel — Design Document
**Data original:** 09/06/2026 · **Última revisão:** 29/07/2026  
**Versão:** 1.1  
**Autor:** U Business Agência de Viagens

> **Changelog v1.1 (29/07/2026):** requisitos da DTA Engenharia (primeiro cliente contratado) puxaram para v1 dois itens antes previstos como futuros: (i) níveis de aprovador com alçada customizável e (ii) notificação WhatsApp. Perfil `admin_cliente` foi cortado — agência faz todo o cadastro/config; C-level financeiro da empresa cliente vira `aprovador_2`.

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
| `admin_agencia` | U Business (dono/sócios) | Tudo: configurar tenants, cadastrar usuários dos clientes, ver todas demandas, emitir bilhetes, gerar invoices |
| `agente` | Funcionários U Business | Ver demandas atribuídas, enviar opções, registrar emissão |
| `aprovador_2` | Diretor/C-level do cliente | Aprova **qualquer valor** (ilimitado por definição); vê tudo da empresa. Recebe demandas escaladas pelo nível 1 |
| `aprovador_1` | Gerente vinculado a 1+ centros de custo | Aprova demandas dos seus centros até os **limites customizáveis** (aereo R$/emissão, rodoviario R$/emissão, hospedagem R$/noite). Cada limite pode ser numérico ou "ilimitado". Acima do teto → escala pro `aprovador_2` |
| `solicitante` | Adm de obra / funcionário | Abrir novas demandas para si ou para terceiros |

---

## 4. Modelo de Dados

### Tabelas principais

```
empresas
  id, nome, cnpj, logo_url, ativo, created_at

obras (centros de custo)
  id, empresa_id, nome, codigo, responsavel, ativo

perfis  (tabela real; complemento ao auth.users do Supabase)
  id (=auth.users.id), empresa_id (null = U Business), nome, email,
  telefone, perfil, ativo
  → perfil ∈ {admin_agencia, agente, aprovador_1, aprovador_2, solicitante}
  → telefone usado pra notificação WhatsApp

aprovador_limites  (só faz sentido pra aprovador_1)
  usuario_id, tipo_item [aereo|rodoviario|hospedagem], valor_limite
  → valor_limite NULL = ilimitado pra esse tipo
  → UI obriga cadastro dos 3 tipos; linha ausente = bloqueia esse tipo

aprovador_obras  (N:N — aprovador_1 ↔ centros de custo que cobre)
  usuario_id, obra_id
  → obra sem aprovador_1 vinculado → demanda vai direto pro aprovador_2

passageiros
  id, empresa_id, nome, cpf, rg, nascimento, contato
  → pessoa física que viaja (pode não ter login no sistema)

demandas
  id, empresa_id, obra_id, solicitante_id, passageiro_id
  tipo: [aereo | rodoviario | hospedagem]
  status: [rascunho | aguardando_opcoes | aguardando_aprovacao | aguardando_aprovacao_2 | aprovado | emitido | rejeitado | cancelado]
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

AGENTE envia 1–3 opções (com preço de venda visível ao cliente)
  → status: aguardando_aprovacao
  → destinatário: APROVADOR_1 do centro de custo (ou APROVADOR_2 se o
    CC não tem aprovador_1 vinculado)

APROVADOR_1 vê opções e escolhe uma:
  ├── Rejeita + comentário → status: rejeitado → volta pro agente revisar
  └── Aprova a opção X → sistema compara preço da opção contra o limite
      do aprovador pra o tipo da demanda:
      ├── Dentro do limite (ou limite ilimitado)  → status: aprovado
      └── Acima do limite                         → status: aguardando_aprovacao_2
          → sobe pro APROVADOR_2 (registro de endosso do nível 1 fica
            gravado em `aprovacoes`)

APROVADOR_2 (quando envolvido) revê a mesma opção:
  ├── Aprova   → status: aprovado
  └── Rejeita  → status: rejeitado → volta pro agente revisar

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
2. **Alçada por nível:** `aprovador_1` tem tetos customizáveis por tipo de item (nullable = ilimitado); `aprovador_2` sempre aprova qualquer valor. Escalação é automática ao clicar "aprovar" numa opção acima do teto.
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
| MVP | Fluxo completo 1 cliente (CB Construções) + 1 agente | Entregue |
| v1.0 | Multi-tenant (N clientes) + invoice PDF | Entregue |
| **v1.1 (em curso — DTA)** | Níveis de aprovador com alçada customizável; escalação automática | Julho/2026 |
| v1.2 | Notificações WhatsApp via Evolution API | Após v1.1 |
| v1.3 | App mobile (PWA) | Futuro |

---

## 10. Decisões Registradas

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Notificações | Apenas painel (MVP/v1.0); WhatsApp em v1.2 | Solicitante já cobra aprovador via WhatsApp pessoal na v1.0 |
| Aprovação | 2 níveis (v1.1): `aprovador_1` com alçada customizável + `aprovador_2` ilimitado | Puxado pra v1.1 por requisito da DTA (não fecha contrato sem) |
| Admin do cliente | Perfil `admin_cliente` cortado (v1.1) | Agência faz todo o cadastro/config; C-level do cliente vira `aprovador_2` |
| Passageiro | Qualquer usuário logado pode solicitar para si ou para outra pessoa | Flexibilidade — não precisa de cadastro separado |
| Preço de venda | Visível a todos (aprovador, solicitante) | Aprovador precisa saber o que está aprovando |
| Custo / margem | Fora do sistema | Controlado em planilha separada pela agência |
| Print consolidadora | Agente anexa imagem como referência | Mostra o preço de mercado junto da proposta |
| Tecnologia | Supabase + React + Vercel | Stack gratuita, escalável, já conhecida |

