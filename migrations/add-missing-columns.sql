-- Adicionar colunas faltantes no modelo Produto
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS codigo VARCHAR(50) UNIQUE;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS emoji VARCHAR(10);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS preco DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS "estoqueAtual" INTEGER DEFAULT 0;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS "estoqueMinimo" INTEGER DEFAULT 0;

-- Comentários
COMMENT ON COLUMN produtos.codigo IS 'Código do produto para identificação';
COMMENT ON COLUMN produtos.emoji IS 'Emoji visual do produto';
COMMENT ON COLUMN produtos.preco IS 'Preço de venda';
COMMENT ON COLUMN produtos."estoqueAtual" IS 'Estoque atual disponível';
COMMENT ON COLUMN produtos."estoqueMinimo" IS 'Estoque mínimo para alertas';
