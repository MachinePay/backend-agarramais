export async function up(queryInterface, DataTypes) {
  await queryInterface.addColumn("movimentacoes", "origem_total_pre", {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: null,
    comment:
      "Como o Total Pré desta coleta foi definido: 'automatico' (preenchido e travado via pulsos da Machine Pay) ou 'manual' (digitado pelo operador, inclusive na conferência forçada a cada 15 dias)",
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("movimentacoes", "origem_total_pre");
}
