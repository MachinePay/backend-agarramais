-- Migration: Adicionar campos contador_in e contador_out na tabela movimentacoes
-- Data: 2025-12-26

-- Adicionar coluna contador_in
ALTER TABLE movimentacoes
ADD COLUMN IF NOT EXISTS contador_in INTEGER;

-- Adicionar coluna contador_out
ALTER TABLE movimentacoes
ADD COLUMN IF NOT EXISTS contador_out INTEGER;

-- Comentários nas colunas
COMMENT ON COLUMN movimentacoes.contador_in IS 'Valor do contador IN da máquina';
COMMENT ON COLUMN movimentacoes.contador_out IS 'Valor do contador OUT da máquina';
