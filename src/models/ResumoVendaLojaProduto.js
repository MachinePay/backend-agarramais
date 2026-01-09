const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ResumoVendaLojaProduto = sequelize.define(
    "ResumoVendaLojaProduto",
    {
      loja: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      produto: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      quantidade: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "resumo_venda_loja_produto",
      timestamps: false,
    }
  );
  return ResumoVendaLojaProduto;
};
