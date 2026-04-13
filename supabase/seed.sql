-- ============================================================
-- GGIA / LabRisk / UnB — seed.sql
-- Dados iniciais: skills, frentes, exemplos de perfis
-- ============================================================

-- ------------------------------------
-- Skills / Áreas de expertise
-- ------------------------------------
INSERT INTO skills (nome) VALUES
  ('Governança de IA'),
  ('Gestão de riscos'),
  ('Regulação e políticas públicas'),
  ('Auditoria e conformidade'),
  ('Segurança cibernética'),
  ('Dados e analytics'),
  ('Desenvolvimento / portal'),
  ('Eventos e workshops'),
  ('Comunicação e conteúdo'),
  ('Captação de recursos')
ON CONFLICT (nome) DO NOTHING;

-- ------------------------------------
-- Frentes de interesse
-- ------------------------------------
INSERT INTO fronts (nome) VALUES
  ('Estudos técnicos'),
  ('Rota do comitê'),
  ('Portal e ferramentas'),
  ('Workshops e eventos'),
  ('Produção científica'),
  ('Comunicação'),
  ('Captação de fomentos'),
  ('Articulação institucional')
ON CONFLICT (nome) DO NOTHING;

-- ------------------------------------
-- Participantes de exemplo
-- (apenas dados fictícios para testes)
-- ------------------------------------
INSERT INTO participants (
  nome, email, whatsapp, cidade_uf,
  vinculo_institucional, atuacao_principal, apresentacao,
  formacao, titulacao, experiencia_academica,
  areas_pesquisa, producao_academica,
  lattes_url, perfil_url,
  nivel_ia, experiencia_projetos, competencias_extras,
  como_contribuir, disponibilidade, modalidade,
  interesse_coordenacao, melhor_contribuicao, observacoes,
  consentimento, active
) VALUES
(
  'Ana Beatriz Oliveira', 'ana.oliveira@exemplo.unb.br',
  '61999990001', 'Brasília / DF',
  'Universidade de Brasília (UnB)', 'Pesquisadora',
  'Pesquisadora em governança de IA com foco em políticas públicas e regulação.',
  'Ciência da Computação', 'Doutora',
  'Docência e pesquisa em universidade pública',
  'Governança de IA, regulação algorítmica, transparência',
  'Artigos em periódicos Qualis A1/A2, capítulos de livro',
  'http://lattes.cnpq.br/0000000000000001', 'https://orcid.org/0000-0000-0000-0001',
  'Avançado', 'Sim — coordenei projetos de pesquisa e grupos de trabalho',
  'Redação científica, análise de dados, facilitação de grupos',
  'Contribuindo com pesquisa e publicações científicas',
  '10 a 15 horas por semana', 'Remota',
  TRUE, 'Produção e revisão de publicações científicas',
  'Disponível para coordenar a frente de produção científica.',
  TRUE, TRUE
),
(
  'Carlos Eduardo Santos', 'carlos.santos@exemplo.com',
  '61999990002', 'Brasília / DF',
  'Setor privado (consultoria)', 'Consultor de riscos',
  'Especialista em gestão de riscos algorítmicos com experiência em conformidade.',
  'Engenharia de Sistemas', 'Especialista',
  'Consultor em empresas privadas',
  'Gestão de riscos, auditoria, conformidade em IA',
  'Certificações internacionais, relatórios técnicos',
  '', 'https://linkedin.com/in/carlossantos',
  'Intermediário', 'Sim — liderança de equipes em projetos corporativos',
  'Auditoria interna, mapeamento de riscos, LGPD',
  'Colaborando com análises técnicas de risco',
  '5 a 10 horas por semana', 'Híbrida',
  FALSE, 'Análise de risco e auditoria',
  NULL, TRUE, TRUE
),
(
  'Mariana Ferreira Lima', 'mariana.lima@exemplo.gov.br',
  '61999990003', 'Brasília / DF',
  'Governo Federal', 'Analista de políticas públicas',
  'Atua na elaboração de políticas públicas para tecnologia e inovação.',
  'Direito', 'Mestre',
  'Pesquisa e assessoria em órgão público',
  'Regulação de IA, políticas públicas digitais',
  'Notas técnicas, pareceres jurídicos',
  'http://lattes.cnpq.br/0000000000000003', '',
  'Básico', 'Sim — coordenação de grupos interministeriais',
  'Redação normativa, articulação institucional',
  'Contribuindo com articulação e interface com governo',
  '5 a 10 horas por semana', 'Presencial',
  TRUE, 'Articulação institucional e advocacy',
  'Interesse especial em articulação com órgãos reguladores.',
  TRUE, TRUE
)
ON CONFLICT (email) DO NOTHING;

-- Relacionamentos de exemplo: skills dos participantes
-- (Precisam dos IDs reais — use subqueries para robustez)
DO $$
DECLARE
  p1 UUID; p2 UUID; p3 UUID;
  s_gov INT; s_risk INT; s_reg INT; s_audit INT; s_data INT;
BEGIN
  SELECT id INTO p1 FROM participants WHERE email = 'ana.oliveira@exemplo.unb.br';
  SELECT id INTO p2 FROM participants WHERE email = 'carlos.santos@exemplo.com';
  SELECT id INTO p3 FROM participants WHERE email = 'mariana.lima@exemplo.gov.br';

  SELECT id INTO s_gov  FROM skills WHERE nome = 'Governança de IA';
  SELECT id INTO s_risk FROM skills WHERE nome = 'Gestão de riscos';
  SELECT id INTO s_reg  FROM skills WHERE nome = 'Regulação e políticas públicas';
  SELECT id INTO s_audit FROM skills WHERE nome = 'Auditoria e conformidade';
  SELECT id INTO s_data FROM skills WHERE nome = 'Dados e analytics';

  IF p1 IS NOT NULL THEN
    INSERT INTO participant_skills VALUES (p1, s_gov)  ON CONFLICT DO NOTHING;
    INSERT INTO participant_skills VALUES (p1, s_reg)  ON CONFLICT DO NOTHING;
    INSERT INTO participant_skills VALUES (p1, s_data) ON CONFLICT DO NOTHING;
  END IF;

  IF p2 IS NOT NULL THEN
    INSERT INTO participant_skills VALUES (p2, s_risk)  ON CONFLICT DO NOTHING;
    INSERT INTO participant_skills VALUES (p2, s_audit) ON CONFLICT DO NOTHING;
  END IF;

  IF p3 IS NOT NULL THEN
    INSERT INTO participant_skills VALUES (p3, s_reg) ON CONFLICT DO NOTHING;
    INSERT INTO participant_skills VALUES (p3, s_gov) ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Relacionamentos de exemplo: frentes dos participantes
DO $$
DECLARE
  p1 UUID; p2 UUID; p3 UUID;
  f_estudos INT; f_prod INT; f_portal INT; f_artic INT;
BEGIN
  SELECT id INTO p1 FROM participants WHERE email = 'ana.oliveira@exemplo.unb.br';
  SELECT id INTO p2 FROM participants WHERE email = 'carlos.santos@exemplo.com';
  SELECT id INTO p3 FROM participants WHERE email = 'mariana.lima@exemplo.gov.br';

  SELECT id INTO f_estudos FROM fronts WHERE nome = 'Estudos técnicos';
  SELECT id INTO f_prod    FROM fronts WHERE nome = 'Produção científica';
  SELECT id INTO f_portal  FROM fronts WHERE nome = 'Portal e ferramentas';
  SELECT id INTO f_artic   FROM fronts WHERE nome = 'Articulação institucional';

  IF p1 IS NOT NULL THEN
    INSERT INTO participant_fronts VALUES (p1, f_estudos) ON CONFLICT DO NOTHING;
    INSERT INTO participant_fronts VALUES (p1, f_prod)    ON CONFLICT DO NOTHING;
  END IF;

  IF p2 IS NOT NULL THEN
    INSERT INTO participant_fronts VALUES (p2, f_estudos) ON CONFLICT DO NOTHING;
    INSERT INTO participant_fronts VALUES (p2, f_portal)  ON CONFLICT DO NOTHING;
  END IF;

  IF p3 IS NOT NULL THEN
    INSERT INTO participant_fronts VALUES (p3, f_artic) ON CONFLICT DO NOTHING;
  END IF;
END $$;
