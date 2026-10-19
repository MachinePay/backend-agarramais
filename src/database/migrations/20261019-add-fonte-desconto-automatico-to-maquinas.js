export async function up(queryInterface, DataTypes) {
  await queryInterface.addColumn("maquinas", "fonte_desconto_automatico", {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: "machinePay",
    comment:
      "De onde vêm os pagamentos do desconto automático: machinePay ou compactPay",
  });

  // Máquinas que só têm ID da CompactPay já descontavam por ela.
  await queryInterface.sequelize.query(
    `UPDATE maquinas SET fonte_desconto_automatico = 'compactPay'
     WHERE (machine_pay_pos_id IS NULL OR TRIM(machine_pay_pos_id) = '')
       AND compact_pay_id IS NOT NULL AND TRIM(compact_pay_id) <> ''`,
  );
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("maquinas", "fonte_desconto_automatico");
}
