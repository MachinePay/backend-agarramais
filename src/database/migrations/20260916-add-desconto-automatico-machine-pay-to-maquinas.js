export async function up(queryInterface, DataTypes) {
  await queryInterface.addColumn("maquinas", "desconto_automatico_machine_pay", {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: "Se ativo, sugere o Total Pré da próxima coleta descontando pulsos pagos via Machine Pay",
  });

  await queryInterface.addColumn("maquinas", "valor_desconto_machine_pay", {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: null,
    comment: "Valor em R$ de cada pulso/ficha liberado por pagamento na Machine Pay",
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("maquinas", "desconto_automatico_machine_pay");
  await queryInterface.removeColumn("maquinas", "valor_desconto_machine_pay");
}
