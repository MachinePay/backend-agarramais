export async function up(queryInterface, DataTypes) {
  await queryInterface.addColumn(
    "maquinas",
    "recebimento_a_parte_machine_pay",
    {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment:
        "Se ativo, o valor bruto da Machine Pay dessa máquina é recalculado (rateio de repasse) antes de aparecer no Registrar Dinheiro, Dashboard, Ranking e Relatórios",
    },
  );
}

export async function down(queryInterface) {
  await queryInterface.removeColumn(
    "maquinas",
    "recebimento_a_parte_machine_pay",
  );
}
