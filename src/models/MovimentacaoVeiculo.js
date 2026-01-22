import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const MovimentacaoVeiculo = sequelize.define(
  "MovimentacaoVeiculo",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    veiculoId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "veiculoid",
      references: { model: "veiculos", key: "id" },
    },
    usuarioId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "usuarioid",
      references: { model: "usuarios", key: "id" },
    },
    tipo: {
      type: DataTypes.ENUM("retirada", "devolucao"),
      allowNull: false,
    },
    dataHora: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "datahora",
    },
    gasolina: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    nivel_limpeza: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    estado: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    modo: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    obs: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "movimentacoes_veiculos",
    timestamps: false,
  },
);

export default MovimentacaoVeiculo;
