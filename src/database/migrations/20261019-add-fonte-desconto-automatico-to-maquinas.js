export async function up(queryInterface, DataTypes) {
  await queryInterface.addColumn("maquinas", "fonte_desconto_automatico", {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: "ambos",
    comment:
      "De onde vêm os pagamentos do desconto automático: machinePay, compactPay ou ambos (soma os IDs cadastrados)",
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("maquinas", "fonte_desconto_automatico");
}
