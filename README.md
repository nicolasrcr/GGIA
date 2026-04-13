# GGIA — Plataforma de Perfis do Comitê

Plataforma web estática para coleta, organização, visualização e administração de perfis dos participantes do **Comitê GGIA / LabRisk / UnB**.

**Stack:** HTML + CSS + JavaScript puro · Supabase (PostgreSQL, Auth, Edge Functions) · GitHub Pages

---

## Estrutura do projeto

```
GGIA/
├── index.html              → Formulário público de perfil
├── login.html              → Login de usuários internos
├── dashboard.html          → Dashboard (coordenador + admin)
├── admin.html              → Painel administrativo
├── css/
│   └── styles.css          → Estilos consolidados
├── js/
│   ├── supabase.js         → Cliente Supabase centralizado
│   ├── auth.js             → Login, logout, proteção de rotas
│   ├── form.js             → Formulário público (autosave + envio)
│   ├── dashboard.js        → Métricas, filtros, exportações
│   └── admin.js            → CRUD participantes e usuários
└── supabase/
    ├── schema.sql          → Tabelas, índices, triggers
    ├── seed.sql            → Dados iniciais (skills, frentes, exemplos)
    ├── policies.sql        → RLS, permissões e views analíticas
    └── functions/
        ├── admin-create-user/
        ├── admin-update-user-role/
        ├── admin-delete-user/
        └── admin-update-participant/
```

---

## Pré-requisitos

- Conta no [Supabase](https://supabase.com) (gratuita serve para início)
- Conta no [GitHub](https://github.com) com Pages habilitado
- Node.js 18+ (apenas para Supabase CLI)
- Supabase CLI: `npm install -g supabase`

---

## 1. Configuração do Supabase

### 1.1 Criar o projeto

1. Acesse [app.supabase.com](https://app.supabase.com)
2. Clique em **New project**
3. Escolha a organização, defina nome, senha do banco e região (recomendado: `sa-east-1` para Brasil)
4. Aguarde a criação (1–2 min)

### 1.2 Executar o schema SQL

No painel do Supabase, vá em **SQL Editor** e execute os arquivos na ordem:

```sql
-- 1. Schema (tabelas, triggers, funções)
-- Cole o conteúdo de supabase/schema.sql

-- 2. Políticas e views
-- Cole o conteúdo de supabase/policies.sql

-- 3. Seeds (dados iniciais)
-- Cole o conteúdo de supabase/seed.sql
```

> **Dica:** Você pode executar cada arquivo separadamente no SQL Editor.

### 1.3 Obter as credenciais

Em **Settings → API**:

- Copie a **Project URL** (ex.: `https://abcxyz.supabase.co`)
- Copie a **anon / public key** (começa com `eyJ...`)

> **Nunca use a `service_role` key no frontend.**

### 1.4 Configurar o cliente JS

Edite `js/supabase.js` e substitua os placeholders:

```js
const SUPABASE_URL      = 'https://odmqfjwclfkfczsgwtum.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'  // já configurado
```
> Já configurado no arquivo `js/supabase.js`.

### 1.5 Deploy das Edge Functions

Com o Supabase CLI, na raiz do projeto:

```bash
# Login
supabase login

# Linkar ao projeto (use o Project Reference ID do painel)
supabase link --project-ref SEU_PROJECT_REF

# Deploy de todas as Edge Functions
supabase functions deploy admin-create-user      --project-ref SEU_PROJECT_REF
supabase functions deploy admin-update-user-role --project-ref SEU_PROJECT_REF
supabase functions deploy admin-delete-user      --project-ref SEU_PROJECT_REF
supabase functions deploy admin-update-participant --project-ref SEU_PROJECT_REF
```

> As Edge Functions usam `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`
> automaticamente como variáveis de ambiente no servidor — você não precisa configurá-las manualmente.

### 1.6 Criar o primeiro usuário administrador

1. No Supabase, vá em **Authentication → Users → Add user**
2. Insira e-mail e senha
3. No **SQL Editor**, execute:

```sql
-- Substituir pelo UUID real do usuário criado
INSERT INTO profiles (id, nome, email, cargo, status)
VALUES (
  'UUID_DO_USUARIO',
  'Nome do Administrador',
  'admin@seu-dominio.com',
  'Administrador',
  'ativo'
);

INSERT INTO user_roles (user_id, role)
VALUES ('UUID_DO_USUARIO', 'administrativo');
```

---

## 2. Publicação no GitHub Pages

### 2.1 Criar o repositório

1. Crie um repositório público no GitHub (ex.: `ggia-comite`)
2. Clone localmente: `git clone https://github.com/seu-usuario/ggia-comite.git`
3. Copie todos os arquivos deste projeto para a pasta clonada

### 2.2 Fazer o push

```bash
git add .
git commit -m "feat: plataforma GGIA inicial"
git push origin main
```

### 2.3 Habilitar GitHub Pages

1. No repositório, vá em **Settings → Pages**
2. Em **Source**, selecione **Deploy from a branch**
3. Branch: `main`, pasta: `/ (root)`
4. Salve e aguarde 1–2 min
5. A URL será: `https://seu-usuario.github.io/ggia-comite/`

### 2.4 Configurar CORS no Supabase

Para que o GitHub Pages possa chamar as Edge Functions:

1. No Supabase, vá em **Settings → API**
2. Em **CORS Origins**, adicione: `https://seu-usuario.github.io`

---

## 3. Perfis de acesso

| Perfil          | Formulário | Dashboard | Admin | Criar usuários | Editar dados |
|-----------------|:----------:|:---------:|:-----:|:--------------:|:------------:|
| Público         | ✓          | —         | —     | —              | —            |
| `coordenador`   | —          | ✓         | —     | —              | —            |
| `administrativo`| ✓          | ✓         | ✓     | ✓              | ✓            |

---

## 4. Funcionalidades

### Formulário público (`index.html`)
- 5 seções: identificação, perfil acadêmico, perfil técnico, contribuição, observações
- Salvamento automático no navegador (localStorage)
- Restauração de rascunho ao reabrir a página
- Barra de progresso em tempo real
- Envio real para o Supabase (participantes + skills + frentes + payload bruto)
- Botão "Acesso interno" no topo direito → `login.html`

### Dashboard (`dashboard.html`)
- KPIs: total de participantes, titulações, vínculos, interessados em coordenar
- Gráficos: titulação (doughnut), skills (barras), frentes (barras), disponibilidade (pie), cadastros por mês (linha)
- Tabela filtrável por nome/e-mail, titulação, disponibilidade e interesse em coordenação
- Exportação em **Excel** e **PDF** (respeitando filtros aplicados)

### Painel administrativo (`admin.html`)
- **Participantes:** listar, buscar, editar, ativar/inativar, excluir
- **Usuários internos:** listar, alterar perfil, ativar/inativar, excluir
- **Criar usuário:** formulário completo → chama Edge Function
- **Log de ações:** histórico de operações administrativas

---

## 5. Segurança

- **RLS ativo** em todas as tabelas
- Formulário público: apenas INSERT em `participants`, `participant_skills`, `participant_fronts`, `submissions_raw`
- Catálogos (`skills`, `fronts`): apenas SELECT público
- Dashboard e admin: somente usuários autenticados com papel adequado
- Operações sensíveis (criar/deletar usuários): apenas via Edge Functions com verificação de papel
- `service_role` key: **nunca exposta no frontend**, apenas usada nas Edge Functions no servidor

---

## 6. Manutenção e evolução

### Adicionar novas skills ou frentes
Execute no SQL Editor:
```sql
INSERT INTO skills (nome) VALUES ('Nova Skill') ON CONFLICT DO NOTHING;
INSERT INTO fronts (nome) VALUES ('Nova Frente') ON CONFLICT DO NOTHING;
```

### Exportar todos os dados
```sql
SELECT * FROM v_participantes_resumo;
```

### Verificar potenciais coordenadores
```sql
SELECT * FROM v_potenciais_coordenadores;
```

### Backup manual
No Supabase, vá em **Settings → Database → Backups** para configurar backups automáticos.

---

## 7. Dependências de terceiros (CDN)

| Biblioteca     | Finalidade               | Versão |
|----------------|--------------------------|--------|
| Supabase JS    | Cliente do banco         | 2.x    |
| Chart.js       | Gráficos no dashboard    | 4.4.0  |
| SheetJS (XLSX) | Exportação Excel         | 0.18.5 |
| jsPDF          | Exportação PDF           | 2.5.1  |
| jsPDF AutoTable| Tabelas em PDF           | 3.8.2  |

---

## 8. Suporte

**Grupo de Pesquisa GGIA / LabRisk / UnB**
Diretório CNPq: [http://dgp.cnpq.br/dgp/espelhogrupo/825325](http://dgp.cnpq.br/dgp/espelhogrupo/825325)
