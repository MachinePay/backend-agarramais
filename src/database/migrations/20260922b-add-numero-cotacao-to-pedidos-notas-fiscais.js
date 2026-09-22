export async function up(queryInterface, DataTypes) {
  await queryInterface.addColumn(
    "pedidos_notas_fiscais",
    "numeroCotacao",
    {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
  );
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("pedidos_notas_fiscais", "numeroCotacao");
}
