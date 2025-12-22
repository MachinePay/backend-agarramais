import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const Produto = sequelize.define(
  "Produto",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    nome: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    descricao: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    categoria: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "Ex: Pelúcia, Boneco, Chaveiro",
    },
    tamanho: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: "Ex: Pequeno, Médio, Grande",
    },
    custoUnitario: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
    },
    imagemUrl: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: "produtos",
    timestamps: true,
  }
);

export default Produto;
