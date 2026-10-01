export async function up(queryInterface, DataTypes) {
  await queryInterface.addColumn("maquinas", "geradora_dinheiro", {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: "Se ativo, a máquina aparece na lista do Registrar Dinheiro",
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("maquinas", "geradora_dinheiro");
}
