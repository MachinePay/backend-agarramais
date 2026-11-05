export async function up(queryInterface, DataTypes) {
  await queryInterface.addColumn("manutencoes", "prioridade", {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: "MEDIA",
    comment: "BAIXA, MEDIA, ALTA ou URGENTE",
  });
  await queryInterface.addColumn("manutencoes", "prazo", {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: "Até quando a manutenção deve ser resolvida",
  });
  await queryInterface.addColumn("manutencoes", "solucao", {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "O que foi feito, informado por quem resolveu",
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("manutencoes", "prioridade");
  await queryInterface.removeColumn("manutencoes", "prazo");
  await queryInterface.removeColumn("manutencoes", "solucao");
}
