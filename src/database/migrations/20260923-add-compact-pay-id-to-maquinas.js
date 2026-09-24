export async function up(queryInterface, DataTypes) {
  await queryInterface.addColumn("maquinas", "compact_pay_id", {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true,
    comment: "ID da máquina (id_hardware) no CompactPay",
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("maquinas", "compact_pay_id");
}
