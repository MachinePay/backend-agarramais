// Adiciona a coluna dados_abastecimento (JSONB) na tabela alertas_movimentacao,
// para guardar o snapshot do formulário de movimentação no momento em que o
// usuário optou por não registrar e enviar por WhatsApp (ver AlertaMovimentacao.js
// e alertaMovimentacaoController.js). Sem essa coluna o alerta só guarda o texto
// livre da observação, sem os dados estruturados do abastecimento.
//
// Uso:
//   node add-dados-abastecimento-alerta.js

import { sequelize } from "./src/database/connection.js";

async function main() {
  await sequelize.authenticate();

  await sequelize.query(
    `ALTER TABLE alertas_movimentacao ADD COLUMN IF NOT EXISTS dados_abastecimento JSONB;`,
  );

  const [columns] = await sequelize.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'alertas_movimentacao'
    ORDER BY ordinal_position
  `);

  console.log("Estrutura atual de alertas_movimentacao:");
  console.table(columns);
}

main()
  .catch((err) => {
    console.error("Erro:", err);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
