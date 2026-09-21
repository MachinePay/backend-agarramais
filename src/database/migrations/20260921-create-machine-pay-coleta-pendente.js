module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("machine_pay_coletas_pendentes", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      maquinaId: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: "maquinas", key: "id" },
      },
      totalAcumulado: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      dataReferencia: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("machine_pay_coletas_pendentes");
  },
};
