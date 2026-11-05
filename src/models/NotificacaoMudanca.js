import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

// Pedidos de mudança vindos do chão de loja para o admin aprovar. O primeiro
// tipo é TROCA_PRODUTO: na movimentação o operador trocou o produto que veio
// como padrão da máquina e informou qual deve ser a nova capacidade padrão.
const NotificacaoMudanca = sequelize.define(
  "NotificacaoMudanca",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tipo: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "TROCA_PRODUTO",
    },
    status: {
      type: DataTypes.ENUM("PENDENTE", "APLICADA", "RECUSADA"),
      allowNull: false,
      defaultValue: "PENDENTE",
    },
    maquinaId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "maquinas", key: "id" },
    },
    lojaId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "lojas", key: "id" },
    },
    usuarioId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "usuarios", key: "id" },
    },
    produtoAnteriorId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "produtos", key: "id" },
    },
    produtoNovoId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "produtos", key: "id" },
    },
    capacidadeAnterior: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "capacidadePadrao da máquina quando o pedido foi criado",
    },
    capacidadeSugerida: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Novo padrão informado pelo operador",
    },
    capacidadeAplicada: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Valor que o admin de fato gravou na máquina ao aplicar",
    },
    observacao: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    resolvidoPorId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "usuarios", key: "id" },
    },
    resolvidoEm: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "notificacoes_mudanca",
    timestamps: true,
  },
);

export default NotificacaoMudanca;
