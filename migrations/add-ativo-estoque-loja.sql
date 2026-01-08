ALTER TABLE estoque_lojas ADD COLUMN ativo BOOLEAN NOT NULL DEFAULT TRUE;
-- Para atualizar registros existentes, se necessário:
-- UPDATE estoque_lojas SET ativo = TRUE WHERE ativo IS NULL;