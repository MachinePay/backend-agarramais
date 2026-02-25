const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const GastoFixoLoja = sequelize.define(
    "GastoFixoLoja",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      lojaId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Loja",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      nome: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      valor: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      observacao: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "GastoFixoLoja",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { fields: ["lojaId"] },
        { unique: true, fields: ["lojaId", "nome"] },
      ],
    },
  );

  GastoFixoLoja.associate = (models) => {
    GastoFixoLoja.belongsTo(models.Loja, { foreignKey: "lojaId", as: "loja" });
  };

  return GastoFixoLoja;
};
