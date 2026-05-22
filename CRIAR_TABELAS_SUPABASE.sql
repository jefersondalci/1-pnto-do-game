-- =============================================
-- TENNIS TRADER - Script de criação das tabelas
-- Cole isso no SQL Editor do Supabase
-- =============================================

-- Tabela de usuários do sistema
CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Inserir usuários iniciais (troque as senhas depois!)
INSERT INTO usuarios (username, password, role) VALUES
  ('admin', 'admin123', 'admin'),
  ('user',  'user123',  'user');

-- Tabela de estatísticas do Cenário 1 (padrão de quebra)
CREATE TABLE cenario1 (
  id SERIAL PRIMARY KEY,
  chave TEXT UNIQUE NOT NULL,
  total INTEGER DEFAULT 0,
  green INTEGER DEFAULT 0,
  atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de estatísticas do Cenário 2 (placar do set)
CREATE TABLE cenario2 (
  id SERIAL PRIMARY KEY,
  chave TEXT UNIQUE NOT NULL,
  total INTEGER DEFAULT 0,
  green INTEGER DEFAULT 0,
  atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de histórico de jogos salvos
CREATE TABLE historico (
  id SERIAL PRIMARY KEY,
  quebrou TEXT,
  sac1 TEXT,
  sac2 TEXT,
  set_ TEXT,
  quebrador TEXT,
  sacador TEXT,
  odd NUMERIC,
  chave_c1 TEXT,
  chave_c2 TEXT,
  recomendacao TEXT,
  status TEXT CHECK (status IN ('GREEN', 'RED')),
  salvo_em TIMESTAMP DEFAULT NOW()
);

-- Liberar acesso público (necessário para o app funcionar)
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE cenario1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE cenario2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total" ON usuarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total" ON cenario1 FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total" ON cenario2 FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total" ON historico FOR ALL USING (true) WITH CHECK (true);
