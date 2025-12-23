-- Migration: Criar tabela de estoque de lojas (depósito)
-- Data: 2025-12-23
-- Descrição: Cria a tabela estoque_lojas para gerenciar estoque do depósito de cada loja, separado do estoque das máquinas

-- Criar tabela estoque_lojas
CREATE TABLE IF NOT EXISTS estoque_lojas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "lojaId" UUID NOT NULL,
    "produtoId" UUID NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
    "estoqueMinimo" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Foreign keys
    CONSTRAINT fk_estoque_loja_loja
        FOREIGN KEY ("lojaId") 
        REFERENCES lojas(id) 
        ON DELETE CASCADE,
    
    CONSTRAINT fk_estoque_loja_produto
        FOREIGN KEY ("produtoId") 
        REFERENCES produtos(id) 
        ON DELETE CASCADE,
    
    -- Garantir que não haja duplicatas (uma loja não pode ter o mesmo produto duas vezes)
    CONSTRAINT unique_loja_produto 
        UNIQUE ("lojaId", "produtoId")
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_estoque_lojas_loja 
    ON estoque_lojas("lojaId");

CREATE INDEX IF NOT EXISTS idx_estoque_lojas_produto 
    ON estoque_lojas("produtoId");

-- Comentários para documentação
COMMENT ON TABLE estoque_lojas IS 'Estoque de produtos no depósito/armazém de cada loja, separado do estoque das máquinas';
COMMENT ON COLUMN estoque_lojas."lojaId" IS 'ID da loja dona do estoque';
COMMENT ON COLUMN estoque_lojas."produtoId" IS 'ID do produto em estoque';
COMMENT ON COLUMN estoque_lojas.quantidade IS 'Quantidade atual em estoque no depósito';
COMMENT ON COLUMN estoque_lojas."estoqueMinimo" IS 'Quantidade mínima para gerar alerta de reposição';
