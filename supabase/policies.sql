-- ============================================================
-- GGIA / LabRisk / UnB — policies.sql
-- RLS, permissões e views analíticas
-- ============================================================

-- ============================================================
-- HABILITAR RLS EM TODAS AS TABELAS EXPOSTAS
-- ============================================================
ALTER TABLE participants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_fronts ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions_raw    ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills             ENABLE ROW LEVEL SECURITY;
ALTER TABLE fronts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs         ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES: skills e fronts (catálogos públicos de leitura)
-- ============================================================

CREATE POLICY "skills_leitura_publica"
  ON skills FOR SELECT
  USING (TRUE);

CREATE POLICY "fronts_leitura_publica"
  ON fronts FOR SELECT
  USING (TRUE);

-- Apenas administrativo pode alterar catálogos
CREATE POLICY "skills_escrita_admin"
  ON skills FOR ALL
  USING (current_user_role() = 'administrativo')
  WITH CHECK (current_user_role() = 'administrativo');

CREATE POLICY "fronts_escrita_admin"
  ON fronts FOR ALL
  USING (current_user_role() = 'administrativo')
  WITH CHECK (current_user_role() = 'administrativo');

-- ============================================================
-- POLICIES: participants
-- ============================================================

-- Qualquer pessoa pode inserir (formulário público — anônimo)
CREATE POLICY "participants_insert_publico"
  ON participants FOR INSERT
  WITH CHECK (TRUE);

-- Usuários autenticados (coordenador ou admin) podem ler
CREATE POLICY "participants_select_internos"
  ON participants FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND
    current_user_role() IN ('administrativo', 'coordenador')
  );

-- Apenas administrativo pode atualizar
CREATE POLICY "participants_update_admin"
  ON participants FOR UPDATE
  USING (current_user_role() = 'administrativo')
  WITH CHECK (current_user_role() = 'administrativo');

-- Apenas administrativo pode deletar
CREATE POLICY "participants_delete_admin"
  ON participants FOR DELETE
  USING (current_user_role() = 'administrativo');

-- ============================================================
-- POLICIES: participant_skills e participant_fronts
-- ============================================================

CREATE POLICY "ps_insert_publico"
  ON participant_skills FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "ps_select_internos"
  ON participant_skills FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND
    current_user_role() IN ('administrativo', 'coordenador')
  );

CREATE POLICY "ps_delete_admin"
  ON participant_skills FOR DELETE
  USING (current_user_role() = 'administrativo');

CREATE POLICY "pf_insert_publico"
  ON participant_fronts FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "pf_select_internos"
  ON participant_fronts FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND
    current_user_role() IN ('administrativo', 'coordenador')
  );

CREATE POLICY "pf_delete_admin"
  ON participant_fronts FOR DELETE
  USING (current_user_role() = 'administrativo');

-- ============================================================
-- POLICIES: submissions_raw
-- ============================================================

CREATE POLICY "sr_insert_publico"
  ON submissions_raw FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "sr_select_admin"
  ON submissions_raw FOR SELECT
  USING (current_user_role() = 'administrativo');

-- ============================================================
-- POLICIES: profiles
-- ============================================================

-- Usuário lê o próprio perfil
CREATE POLICY "profiles_select_proprio"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- Admin lê todos
CREATE POLICY "profiles_select_admin"
  ON profiles FOR SELECT
  USING (current_user_role() = 'administrativo');

-- Admin insere/atualiza qualquer perfil (via Edge Function)
CREATE POLICY "profiles_all_admin"
  ON profiles FOR ALL
  USING (current_user_role() = 'administrativo')
  WITH CHECK (current_user_role() = 'administrativo');

-- ============================================================
-- POLICIES: user_roles
-- ============================================================

-- Usuário lê o próprio papel (necessário para frontend)
CREATE POLICY "ur_select_proprio"
  ON user_roles FOR SELECT
  USING (user_id = auth.uid());

-- Admin lê todos
CREATE POLICY "ur_select_admin"
  ON user_roles FOR SELECT
  USING (current_user_role() = 'administrativo');

-- Admin altera papéis (via Edge Function)
CREATE POLICY "ur_all_admin"
  ON user_roles FOR ALL
  USING (current_user_role() = 'administrativo')
  WITH CHECK (current_user_role() = 'administrativo');

-- ============================================================
-- POLICIES: audit_logs
-- ============================================================

CREATE POLICY "al_select_admin"
  ON audit_logs FOR SELECT
  USING (current_user_role() = 'administrativo');

CREATE POLICY "al_insert_admin"
  ON audit_logs FOR INSERT
  WITH CHECK (current_user_role() = 'administrativo');

-- ============================================================
-- VIEWS ANALÍTICAS PARA O DASHBOARD
-- ============================================================

-- Resumo geral de participantes
CREATE OR REPLACE VIEW v_participantes_resumo
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.nome,
  p.email,
  p.whatsapp,
  p.cidade_uf,
  p.vinculo_institucional,
  p.atuacao_principal,
  p.formacao,
  p.titulacao,
  p.nivel_ia,
  p.disponibilidade,
  p.modalidade,
  p.interesse_coordenacao,
  p.active,
  p.created_at,
  -- Skills concatenadas
  (
    SELECT STRING_AGG(s.nome, ', ' ORDER BY s.nome)
    FROM participant_skills ps
    JOIN skills s ON s.id = ps.skill_id
    WHERE ps.participant_id = p.id
  ) AS skills,
  -- Frentes concatenadas
  (
    SELECT STRING_AGG(f.nome, ', ' ORDER BY f.nome)
    FROM participant_fronts pf
    JOIN fronts f ON f.id = pf.front_id
    WHERE pf.participant_id = p.id
  ) AS frentes
FROM participants p
WHERE p.active = TRUE;

-- Por titulação
CREATE OR REPLACE VIEW v_participantes_por_titulacao
WITH (security_invoker = true)
AS
SELECT
  COALESCE(titulacao, 'Não informada') AS titulacao,
  COUNT(*) AS total
FROM participants
WHERE active = TRUE
GROUP BY titulacao
ORDER BY total DESC;

-- Por skill
CREATE OR REPLACE VIEW v_participantes_por_skill
WITH (security_invoker = true)
AS
SELECT
  s.nome  AS skill,
  COUNT(DISTINCT ps.participant_id) AS total
FROM skills s
LEFT JOIN participant_skills ps ON ps.skill_id = s.id
LEFT JOIN participants p ON p.id = ps.participant_id AND p.active = TRUE
GROUP BY s.nome
ORDER BY total DESC;

-- Por frente
CREATE OR REPLACE VIEW v_participantes_por_frente
WITH (security_invoker = true)
AS
SELECT
  f.nome  AS frente,
  COUNT(DISTINCT pf.participant_id) AS total
FROM fronts f
LEFT JOIN participant_fronts pf ON pf.front_id = f.id
LEFT JOIN participants p ON p.id = pf.participant_id AND p.active = TRUE
GROUP BY f.nome
ORDER BY total DESC;

-- Por disponibilidade
CREATE OR REPLACE VIEW v_disponibilidade_resumo
WITH (security_invoker = true)
AS
SELECT
  COALESCE(disponibilidade, 'Não informada') AS disponibilidade,
  COUNT(*) AS total
FROM participants
WHERE active = TRUE
GROUP BY disponibilidade
ORDER BY total DESC;

-- Potenciais coordenadores
CREATE OR REPLACE VIEW v_potenciais_coordenadores
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.nome,
  p.email,
  p.titulacao,
  p.vinculo_institucional,
  p.disponibilidade,
  p.melhor_contribuicao,
  (
    SELECT STRING_AGG(f.nome, ', ' ORDER BY f.nome)
    FROM participant_fronts pf
    JOIN fronts f ON f.id = pf.front_id
    WHERE pf.participant_id = p.id
  ) AS frentes
FROM participants p
WHERE p.active = TRUE
  AND p.interesse_coordenacao = TRUE
ORDER BY p.nome;

-- Cadastros por mês
CREATE OR REPLACE VIEW v_cadastros_por_mes
WITH (security_invoker = true)
AS
SELECT
  DATE_TRUNC('month', created_at) AS mes,
  COUNT(*) AS total
FROM participants
WHERE active = TRUE
GROUP BY mes
ORDER BY mes;

-- ============================================================
-- GRANT: permitir acesso anônimo apenas ao necessário
-- ============================================================

-- Anon pode inserir apenas em participants, participant_skills,
-- participant_fronts e submissions_raw (formulário público)
GRANT INSERT ON participants       TO anon;
GRANT INSERT ON participant_skills TO anon;
GRANT INSERT ON participant_fronts TO anon;
GRANT INSERT ON submissions_raw    TO anon;

-- Leitura de catálogos (para popular selects no formulário)
GRANT SELECT ON skills TO anon;
GRANT SELECT ON fronts TO anon;
GRANT USAGE, SELECT ON SEQUENCE skills_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE fronts_id_seq TO anon;

-- Usuários autenticados podem ler views
GRANT SELECT ON v_participantes_resumo      TO authenticated;
GRANT SELECT ON v_participantes_por_titulacao TO authenticated;
GRANT SELECT ON v_participantes_por_skill   TO authenticated;
GRANT SELECT ON v_participantes_por_frente  TO authenticated;
GRANT SELECT ON v_disponibilidade_resumo    TO authenticated;
GRANT SELECT ON v_potenciais_coordenadores  TO authenticated;
GRANT SELECT ON v_cadastros_por_mes         TO authenticated;
