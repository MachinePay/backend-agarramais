-- Migration: Substituir forca_garra por três campos de força
-- Data: 2025-12-26
-- Descrição: Remove campo único forca_garra e adiciona três campos separados

-- Remover a coluna antiga
ALTER TABLE maquinas DROP COLUMN IF EXISTS forca_garra;

-- Adicionar as três novas colunas
ALTER TABLE maquinas ADD COLUMN forca_forte INTEGER;
ALTER TABLE maquinas ADD COLUMN forca_fraca INTEGER;
ALTER TABLE maquinas ADD COLUMN forca_premium INTEGER;

-- Adicionar constraints de validação
ALTER TABLE maquinas 
ADD CONSTRAINT check_forca_forte_range 
CHECK (forca_forte IS NULL OR (forca_forte >= 0 AND forca_forte <= 100));

ALTER TABLE maquinas 
ADD CONSTRAINT check_forca_fraca_range 
CHECK (forca_fraca IS NULL OR (forca_fraca >= 0 AND forca_fraca <= 100));

ALTER TABLE maquinas 
ADD CONSTRAINT check_forca_premium_range 
CHECK (forca_premium IS NULL OR (forca_premium >= 0 AND forca_premium <= 100));

-- Comentários explicativos
COMMENT ON COLUMN maquinas.forca_forte IS 'Força forte da garra em percentual (0-100%)';
COMMENT ON COLUMN maquinas.forca_fraca IS 'Força fraca da garra em percentual (0-100%)';
COMMENT ON COLUMN maquinas.forca_premium IS 'Força premium da garra em percentual (0-100%)';
