module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("pedidos_notas_fiscais", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      clienteNome: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      numeroPedido: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      dataPedido: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      numeroNota: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      dataNota: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      tipoFrete: {
        type: Sequelize.ENUM("CIF", "FOB"),
        allowNull: true,
      },
      transportadora: {
        type: Sequelize.STRING(150),
        allowNull: true,
      },
      numeroColeta: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      teveCotacao: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      dataCotacao: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      valorNota: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      chaveAcessoNFe: {
        type: Sequelize.STRING(60),
        allowNull: true,
      },
      origemDados: {
        type: Sequelize.ENUM("MANUAL", "NFEMAIL"),
        allowNull: false,
        defaultValue: "MANUAL",
      },
      observacoes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      usuarioId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "usuarios", key: "id" },
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

    await queryInterface.addIndex("pedidos_notas_fiscais", ["numeroPedido"]);
    await queryInterface.addIndex("pedidos_notas_fiscais", ["clienteNome"]);
    await queryInterface.addIndex("pedidos_notas_fiscais", ["dataPedido"]);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("pedidos_notas_fiscais");
  },
};
