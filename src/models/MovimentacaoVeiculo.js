import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const MovimentacaoVeiculo = sequelize.define(
  "MovimentacaoVeiculo",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    veiculoId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "veiculoid",
      references: { model: "veiculos", key: "id" },
    },
    usuarioId: {
      type: DataTypes.UUID,
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
    },
    observacao: {
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
