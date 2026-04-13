-- ============================================================
-- GGIA / LabRisk / UnB — Plataforma de Perfis do Comitê
-- schema.sql — Estrutura completa do banco de dados
-- ============================================================

-- ------------------------------------
-- Extensões necessárias
-- ------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------
-- Enum: papéis de usuários internos
-- ------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role_enum AS ENUM ('administrativo', 'coordenador');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------
-- Função auxiliar: updated_at trigger
-- ------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABELAS CATÁLOGO
-- ============================================================

-- Catálogo de skills / áreas de experiência
CREATE TABLE IF NOT EXISTS skills (
  id   SERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE
);

-- Catálogo de frentes de interesse
CREATE TABLE IF NOT EXISTS fronts (
  id   SERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE
);

-- ============================================================
-- PARTICIPANTES (formulário público)
-- ============================================================

CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Seção 1: Identificação
  nome                  TEXT NOT NULL,
  email                 TEXT NOT NULL,
  whatsapp              TEXT,
  cidade_uf             TEXT,
  vinculo_institucional TEXT,
  atuacao_principal     TEXT,
  apresentacao          TEXT,

  -- Seção 2: Perfil acadêmico
  formacao              TEXT,
  titulacao             TEXT,
  experiencia_academica TEXT,
  areas_pesquisa        TEXT,
  producao_academica    TEXT,
  lattes_url            TEXT,
  perfil_url            TEXT,

  -- Seção 3: Perfil técnico
  nivel_ia              TEXT,
  experiencia_projetos  TEXT,
  competencias_extras   TEXT,

  -- Seção 4: Interesse de contribuição
  como_contribuir       TEXT,
  disponibilidade       TEXT,
  modalidade            TEXT,
  interesse_coordenacao BOOLEAN DEFAULT FALSE,
  melhor_contribuicao   TEXT,

  -- Seção 5: Observações
  observacoes           TEXT,
  consentimento         BOOLEAN NOT NULL DEFAULT FALSE,

  -- Controle
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT participants_email_key UNIQUE (email)
);

CREATE TRIGGER trg_participants_updated_at
  BEFORE UPDATE ON participants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_participants_email     ON participants(email);
CREATE INDEX IF NOT EXISTS idx_participants_titulacao ON participants(titulacao);
CREATE INDEX IF NOT EXISTS idx_participants_active    ON participants(active);
CREATE INDEX IF NOT EXISTS idx_participants_created   ON participants(created_at DESC);

-- ============================================================
-- RELACIONAMENTOS N:N
-- ============================================================

-- Participante ↔ Skills
CREATE TABLE IF NOT EXISTS participant_skills (
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  skill_id       INT  NOT NULL REFERENCES skills(id)       ON DELETE CASCADE,
  PRIMARY KEY (participant_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_ps_skill ON participant_skills(skill_id);

-- Participante ↔ Frentes
CREATE TABLE IF NOT EXISTS participant_fronts (
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  front_id       INT  NOT NULL REFERENCES fronts(id)       ON DELETE CASCADE,
  PRIMARY KEY (participant_id, front_id)
);

CREATE INDEX IF NOT EXISTS idx_pf_front ON participant_fronts(front_id);

-- ============================================================
-- SUBMISSÕES BRUTAS (auditoria / payload completo)
-- ============================================================

CREATE TABLE IF NOT EXISTS submissions_raw (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_id UUID        REFERENCES participants(id) ON DELETE SET NULL,
  payload        JSONB       NOT NULL,
  source         TEXT        DEFAULT 'web_form',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sr_participant ON submissions_raw(participant_id);
CREATE INDEX IF NOT EXISTS idx_sr_created     ON submissions_raw(created_at DESC);

-- ============================================================
-- PERFIS E PAPÉIS DE USUÁRIOS INTERNOS
-- ============================================================

-- Perfil estendido dos usuários autenticados (espelha auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome       TEXT,
  email      TEXT,
  whatsapp   TEXT,
  cargo      TEXT,
  setor      TEXT,
  status     TEXT    NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Papéis dos usuários internos
CREATE TABLE IF NOT EXISTS user_roles (
  id      SERIAL           PRIMARY KEY,
  user_id UUID             NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role    user_role_enum   NOT NULL,
  CONSTRAINT user_roles_user_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_ur_user ON user_roles(user_id);

-- ============================================================
-- AUDIT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action         TEXT        NOT NULL,
  details        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_al_actor   ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_al_action  ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_al_created ON audit_logs(created_at DESC);

-- ============================================================
-- FUNÇÃO: obter papel do usuário atual (usado em RLS)
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_role(uid UUID)
RETURNS TEXT AS $$
  SELECT role::TEXT FROM user_roles WHERE user_id = uid LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Versão para o usuário atual (conveniente em políticas)
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT AS $$
  SELECT get_user_role(auth.uid());
$$ LANGUAGE sql SECURITY DEFINER STABLE;
