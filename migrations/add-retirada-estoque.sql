-- Migration: Adicionar campo retirada_estoque na tabela movimentacoes
-- Data: 2025-12-26
-- Descrição: Campo para indicar se a movimentação é uma retirada de estoque
--            (não conta como venda/receita)

-- Adicionar coluna retirada_estoque
ALTER TABLE movimentacoes 
ADD COLUMN retirada_estoque BOOLEAN NOT NULL DEFAULT FALSE;
