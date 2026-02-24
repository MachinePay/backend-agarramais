import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const GastoVariavel = sequelize.define(
  "GastoVariavel",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lojaId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Lojas", key: "id" },
    },
    nome: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    valor: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    observacao: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    dataInicio: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    dataFim: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    registroDinheiroId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "RegistroDinheiros", key: "id" },
    },
  },
  {
    tableName: "GastoVariavel",
    timestamps: true,
  },
);

export default GastoVariavel;
