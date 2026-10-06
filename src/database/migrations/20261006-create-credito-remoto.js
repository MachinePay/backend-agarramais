module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("credito_remoto_links", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      descricao: { type: Sequelize.STRING(150), allowNull: false },
      token_hash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      token_cifrado: { type: Sequelize.TEXT, allowNull: true },
      maquina_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "maquinas", key: "id" },
      },
      limite_centavos: { type: Sequelize.INTEGER, allowNull: false },
      usado_centavos: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      expira_em: { type: Sequelize.DATE, allowNull: true },
      revogado_em: { type: Sequelize.DATE, allowNull: true },
      criado_por_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "usuarios", key: "id" },
      },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE credito_remoto_links
        ADD CONSTRAINT check_credito_remoto_limite
        CHECK (usado_centavos >= 0 AND usado_centavos <= limite_centavos AND limite_centavos > 0);
    `);

    await queryInterface.createTable("credito_remoto_envios", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      link_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "credito_remoto_links", key: "id" },
      },
      maquina_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "maquinas", key: "id" },
      },
      valor_centavos: { type: Sequelize.INTEGER, allowNull: false },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "pendente",
      },
      idwebhook: { type: Sequelize.STRING(50), allowNull: true },
      detalhe: { type: Sequelize.TEXT, allowNull: true },
      ip: { type: Sequelize.STRING(100), allowNull: true },
      user_agent: { type: Sequelize.STRING(300), allowNull: true },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("credito_remoto_envios");
    await queryInterface.dropTable("credito_remoto_links");
  },
};
