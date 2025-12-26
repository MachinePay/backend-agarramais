-- Migration: Adicionar campos fichas_necessarias e forca_garra na tabela maquinas
-- Data: 2025-12-26
-- Descrição: Adiciona campos para armazenar configurações técnicas das máquinas

-- Adicionar coluna fichas_necessarias
ALTER TABLE maquinas 
ADD COLUMN fichas_necessarias INTEGER;

-- Adicionar coluna forca_garra  
ALTER TABLE maquinas 
ADD COLUMN forca_garra INTEGER;

-- Adicionar constraints de validação
ALTER TABLE maquinas 
ADD CONSTRAINT check_fichas_necessarias_positivo 
CHECK (fichas_necessarias IS NULL OR fichas_necessarias >= 1);

ALTER TABLE maquinas 
ADD CONSTRAINT check_forca_garra_range 
CHECK (forca_garra IS NULL OR (forca_garra >= 0 AND forca_garra <= 100));

-- Comentários explicativos
COMMENT ON COLUMN maquinas.fichas_necessarias IS 'Quantidade de fichas necessárias para liberar uma jogada';
COMMENT ON COLUMN maquinas.forca_garra IS 'Força da garra em percentual (0-100%)';
