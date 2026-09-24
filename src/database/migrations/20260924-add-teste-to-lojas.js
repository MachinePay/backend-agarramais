export async function up(queryInterface, DataTypes) {
  await queryInterface.addColumn("lojas", "teste", {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment:
      "Loja de teste: não entra no Dashboard, Relatório de todas as lojas, Ranking de máquinas e Gráficos",
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("lojas", "teste");
}
