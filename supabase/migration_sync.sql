-- ============================================================
-- GGIA / LabRisk / UnB — Migração de sincronização completa
-- Aplique no Supabase: Database > SQL Editor > New query
-- Todos os comandos são idempotentes (seguros para reaplicar)
-- ============================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enum de papéis
DO $$ BEGIN
  CREATE TYPE user_role_enum AS ENUM ('administrativo', 'coordenador');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Função de updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- Funções auxiliares de RLS
CREATE OR REPLACE FUNCTION get_user_role(uid UUID)
RETURNS TEXT AS $$
  SELECT role::TEXT FROM user_roles WHERE user_id = uid LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT AS $$
  SELECT get_user_role(auth.uid());
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── Tabelas catálogo ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skills (
  id   SERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS fronts (
  id   SERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE
);

-- ── Participantes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS participants (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome                  TEXT        NOT NULL,
  email                 TEXT        NOT NULL,
  whatsapp              TEXT,
  cidade_uf             TEXT,
  vinculo_institucional TEXT,
  atuacao_principal     TEXT,
  apresentacao          TEXT,
  formacao              TEXT,
  titulacao             TEXT,
  experiencia_academica TEXT,
  areas_pesquisa        TEXT,
  producao_academica    TEXT,
  lattes_url            TEXT,
  perfil_url            TEXT,
  nivel_ia              TEXT,
  experiencia_projetos  TEXT,
  competencias_extras   TEXT,
  como_contribuir       TEXT,
  disponibilidade       TEXT,
  modalidade            TEXT,
  interesse_coordenacao BOOLEAN     DEFAULT FALSE,
  melhor_contribuicao   TEXT,
  observacoes           TEXT,
  consentimento         BOOLEAN     NOT NULL DEFAULT FALSE,
  active                BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT participants_email_key UNIQUE (email)
);

DROP TRIGGER IF EXISTS trg_participants_updated_at ON participants;
CREATE TRIGGER trg_participants_updated_at
  BEFORE UPDATE ON participants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_participants_email     ON participants(email);
CREATE INDEX IF NOT EXISTS idx_participants_titulacao ON participants(titulacao);
CREATE INDEX IF NOT EXISTS idx_participants_active    ON participants(active);
CREATE INDEX IF NOT EXISTS idx_participants_created   ON participants(created_at DESC);

-- ── Relacionamentos N:N ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS participant_skills (
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  skill_id       INT  NOT NULL REFERENCES skills(id)       ON DELETE CASCADE,
  PRIMARY KEY (participant_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_ps_skill ON participant_skills(skill_id);

CREATE TABLE IF NOT EXISTS participant_fronts (
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  front_id       INT  NOT NULL REFERENCES fronts(id)       ON DELETE CASCADE,
  PRIMARY KEY (participant_id, front_id)
);
CREATE INDEX IF NOT EXISTS idx_pf_front ON participant_fronts(front_id);

-- ── Submissões brutas ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS submissions_raw (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_id UUID        REFERENCES participants(id) ON DELETE SET NULL,
  payload        JSONB       NOT NULL,
  source         TEXT        DEFAULT 'web_form',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sr_participant ON submissions_raw(participant_id);
CREATE INDEX IF NOT EXISTS idx_sr_created     ON submissions_raw(created_at DESC);

-- ── Perfis e papéis de usuários internos ──────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome       TEXT,
  email      TEXT,
  whatsapp   TEXT,
  cargo      TEXT,
  setor      TEXT,
  status     TEXT        NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS user_roles (
  id      SERIAL         PRIMARY KEY,
  user_id UUID           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role    user_role_enum NOT NULL,
  CONSTRAINT user_roles_user_unique UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_ur_user ON user_roles(user_id);

-- ── Audit log ─────────────────────────────────────────────────
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

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE participants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_fronts ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions_raw    ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills             ENABLE ROW LEVEL SECURITY;
ALTER TABLE fronts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs         ENABLE ROW LEVEL SECURITY;

-- ── Policies (idempotentes) ───────────────────────────────────
DO $$ BEGIN CREATE POLICY "skills_leitura_publica"
  ON skills FOR SELECT USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "fronts_leitura_publica"
  ON fronts FOR SELECT USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "skills_escrita_admin"
  ON skills FOR ALL
  USING (current_user_role() = 'administrativo')
  WITH CHECK (current_user_role() = 'administrativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "fronts_escrita_admin"
  ON fronts FOR ALL
  USING (current_user_role() = 'administrativo')
  WITH CHECK (current_user_role() = 'administrativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "participants_insert_publico"
  ON participants FOR INSERT WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "participants_select_internos"
  ON participants FOR SELECT
  USING (auth.uid() IS NOT NULL AND current_user_role() IN ('administrativo', 'coordenador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "participants_update_admin"
  ON participants FOR UPDATE
  USING (current_user_role() = 'administrativo')
  WITH CHECK (current_user_role() = 'administrativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "participants_delete_admin"
  ON participants FOR DELETE
  USING (current_user_role() = 'administrativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "ps_insert_publico"
  ON participant_skills FOR INSERT WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "ps_select_internos"
  ON participant_skills FOR SELECT
  USING (auth.uid() IS NOT NULL AND current_user_role() IN ('administrativo', 'coordenador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "ps_delete_admin"
  ON participant_skills FOR DELETE
  USING (current_user_role() = 'administrativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "pf_insert_publico"
  ON participant_fronts FOR INSERT WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "pf_select_internos"
  ON participant_fronts FOR SELECT
  USING (auth.uid() IS NOT NULL AND current_user_role() IN ('administrativo', 'coordenador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "pf_delete_admin"
  ON participant_fronts FOR DELETE
  USING (current_user_role() = 'administrativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "sr_insert_publico"
  ON submissions_raw FOR INSERT WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "sr_select_admin"
  ON submissions_raw FOR SELECT
  USING (current_user_role() = 'administrativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "profiles_select_proprio"
  ON profiles FOR SELECT USING (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "profiles_select_admin"
  ON profiles FOR SELECT USING (current_user_role() = 'administrativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "profiles_all_admin"
  ON profiles FOR ALL
  USING (current_user_role() = 'administrativo')
  WITH CHECK (current_user_role() = 'administrativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "ur_select_proprio"
  ON user_roles FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "ur_select_admin"
  ON user_roles FOR SELECT USING (current_user_role() = 'administrativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "ur_all_admin"
  ON user_roles FOR ALL
  USING (current_user_role() = 'administrativo')
  WITH CHECK (current_user_role() = 'administrativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "al_select_admin"
  ON audit_logs FOR SELECT USING (current_user_role() = 'administrativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "al_insert_admin"
  ON audit_logs FOR INSERT WITH CHECK (current_user_role() = 'administrativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Views analíticas ──────────────────────────────────────────
CREATE OR REPLACE VIEW v_participantes_resumo
WITH (security_invoker = true) AS
SELECT
  p.id, p.nome, p.email, p.whatsapp, p.cidade_uf,
  p.vinculo_institucional, p.atuacao_principal, p.formacao,
  p.titulacao, p.nivel_ia, p.disponibilidade, p.modalidade,
  p.interesse_coordenacao, p.active, p.created_at,
  (SELECT STRING_AGG(s.nome, ', ' ORDER BY s.nome)
   FROM participant_skills ps JOIN skills s ON s.id = ps.skill_id
   WHERE ps.participant_id = p.id) AS skills,
  (SELECT STRING_AGG(f.nome, ', ' ORDER BY f.nome)
   FROM participant_fronts pf JOIN fronts f ON f.id = pf.front_id
   WHERE pf.participant_id = p.id) AS frentes
FROM participants p WHERE p.active = TRUE;

CREATE OR REPLACE VIEW v_participantes_por_titulacao
WITH (security_invoker = true) AS
SELECT COALESCE(titulacao, 'Não informada') AS titulacao, COUNT(*) AS total
FROM participants WHERE active = TRUE
GROUP BY titulacao ORDER BY total DESC;

CREATE OR REPLACE VIEW v_participantes_por_skill
WITH (security_invoker = true) AS
SELECT s.nome AS skill, COUNT(DISTINCT ps.participant_id) AS total
FROM skills s
LEFT JOIN participant_skills ps ON ps.skill_id = s.id
LEFT JOIN participants p ON p.id = ps.participant_id AND p.active = TRUE
GROUP BY s.nome ORDER BY total DESC;

CREATE OR REPLACE VIEW v_participantes_por_frente
WITH (security_invoker = true) AS
SELECT f.nome AS frente, COUNT(DISTINCT pf.participant_id) AS total
FROM fronts f
LEFT JOIN participant_fronts pf ON pf.front_id = f.id
LEFT JOIN participants p ON p.id = pf.participant_id AND p.active = TRUE
GROUP BY f.nome ORDER BY total DESC;

CREATE OR REPLACE VIEW v_disponibilidade_resumo
WITH (security_invoker = true) AS
SELECT COALESCE(disponibilidade, 'Não informada') AS disponibilidade, COUNT(*) AS total
FROM participants WHERE active = TRUE
GROUP BY disponibilidade ORDER BY total DESC;

CREATE OR REPLACE VIEW v_potenciais_coordenadores
WITH (security_invoker = true) AS
SELECT p.id, p.nome, p.email, p.titulacao, p.vinculo_institucional,
  p.disponibilidade, p.melhor_contribuicao,
  (SELECT STRING_AGG(f.nome, ', ' ORDER BY f.nome)
   FROM participant_fronts pf JOIN fronts f ON f.id = pf.front_id
   WHERE pf.participant_id = p.id) AS frentes
FROM participants p
WHERE p.active = TRUE AND p.interesse_coordenacao = TRUE
ORDER BY p.nome;

CREATE OR REPLACE VIEW v_cadastros_por_mes
WITH (security_invoker = true) AS
SELECT DATE_TRUNC('month', created_at) AS mes, COUNT(*) AS total
FROM participants WHERE active = TRUE
GROUP BY mes ORDER BY mes;

-- ── Grants ────────────────────────────────────────────────────
GRANT INSERT ON participants       TO anon;
GRANT INSERT ON participant_skills TO anon;
GRANT INSERT ON participant_fronts TO anon;
GRANT INSERT ON submissions_raw    TO anon;
GRANT SELECT ON skills             TO anon;
GRANT SELECT ON fronts             TO anon;
GRANT USAGE, SELECT ON SEQUENCE skills_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE fronts_id_seq TO anon;

GRANT SELECT ON v_participantes_resumo        TO authenticated;
GRANT SELECT ON v_participantes_por_titulacao TO authenticated;
GRANT SELECT ON v_participantes_por_skill     TO authenticated;
GRANT SELECT ON v_participantes_por_frente    TO authenticated;
GRANT SELECT ON v_disponibilidade_resumo      TO authenticated;
GRANT SELECT ON v_potenciais_coordenadores    TO authenticated;
GRANT SELECT ON v_cadastros_por_mes           TO authenticated;
