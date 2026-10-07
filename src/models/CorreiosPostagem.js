import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

// Postagem criada no VIPP a partir de um pedido da Gira Kids (aba Comercial →
// Correios). Serve pra não gravar o mesmo pedido duas vezes no VIPP (geraria
// duas pré-postagens nos Correios) e pra baixar os PDFs de novo depois.
const CorreiosPostagem = sequelize.define(
  "CorreiosPostagem",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    pedidoGiraKidsId: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "pedido_gira_kids_id",
    },
    numeroPedido: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "numero_pedido",
    },
    cliente: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    vippIdConhecimento: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: "vipp_id_conhecimento",
    },
    etiqueta: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    servico: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    valorFrete: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: "valor_frete",
    },
    usuarioId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "usuario_id",
      references: {
        model: "usuarios",
        key: "id",
      },
    },
  },
  {
    tableName: "correios_postagens",
    timestamps: true,
    indexes: [{ fields: ["pedido_gira_kids_id"] }],
  },
);

export default CorreiosPostagem;
