import { DataTypes } from "sequelize";
import sequelize from "../database/connection";

const Veiculo = sequelize.define(
  "Veiculo",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    tipo: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    nome: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    modelo: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    km: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    estado: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Bom",
    },
    emoji: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    emUso: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    parada: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    modo: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "trabalho",
    },
    nivelCombustivel: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "5 palzinhos",
    },
    nivelLimpeza: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "está limpo",
    },
  },
  {
    tableName: "veiculos",
    timestamps: true,
  },
);

export default Veiculo;
