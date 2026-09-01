"use strict";

// Nota: neste projeto as alterações de schema são aplicadas de fato via
// verificação idempotente em src/server.js (startServer), não por um runner
// de migrations. Este arquivo existe apenas para documentar a mudança.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("movimentacoes", "valor_ficha_unitario", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment:
        "Snapshot do valorFicha da máquina no momento da movimentação, para preservar o histórico caso o valor da ficha mude depois",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("movimentacoes", "valor_ficha_unitario");
  },
};
