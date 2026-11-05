export async function up(queryInterface, DataTypes) {
  await queryInterface.addColumn("maquinas", "sem_ficha", {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment:
      "Máquina que não usa ficha. Atualizado pelo checkbox 'Máquina sem ficha' a cada movimentação registrada",
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("maquinas", "sem_ficha");
}
