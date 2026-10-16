export async function up(queryInterface, DataTypes) {
  await queryInterface.addColumn("manutencoes", "origem", {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: "MANUAL",
    comment:
      "MANUAL (criada por admin) ou ALERTA_FICHAS (fichas da movimentação não batem com o CompactPay)",
  });
  await queryInterface.addColumn("manutencoes", "maquinaId", {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: "maquinas", key: "id" },
  });
  await queryInterface.addColumn("manutencoes", "movimentacaoId", {
    type: DataTypes.UUID,
    allowNull: true,
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("manutencoes", "movimentacaoId");
  await queryInterface.removeColumn("manutencoes", "maquinaId");
  await queryInterface.removeColumn("manutencoes", "origem");
}
