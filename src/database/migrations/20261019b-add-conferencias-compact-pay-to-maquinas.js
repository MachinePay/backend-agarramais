export async function up(queryInterface, DataTypes) {
  await queryInterface.addColumn("maquinas", "conferir_fichas_compact_pay", {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment:
      "Se ativo, a cada movimentação compara as fichas lançadas com as que a placa CompactPay contou e gera alerta (só admin) se não bater",
  });
  await queryInterface.addColumn("maquinas", "conferir_saida_compact_pay", {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment:
      "Se ativo, a cada movimentação compara a saída de prêmios com o sensor de saída da placa CompactPay e gera alerta (só admin) se não bater",
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("maquinas", "conferir_fichas_compact_pay");
  await queryInterface.removeColumn("maquinas", "conferir_saida_compact_pay");
}
