import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

// Guarda, por máquina, o total recebido na Machine Pay entre a última
// movimentação (coleta) e o(s) fechamento(s) mensais que aconteceram desde
// então. O fechamento zera o extrato na Machine Pay (ver
// fecharFechamentoMachinePay), então sem isso o cálculo de "total recebido
// desde a última movimentação" (calcularEstoqueRealMachinePay) perderia os
// pagamentos já contabilizados por um fechamento anterior. O registro é
// apagado assim que uma nova movimentação é lançada para a máquina.
const MachinePayColetaPendente = sequelize.define(
  "MachinePayColetaPendente",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    maquinaId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: "maquinas",
        key: "id",
      },
    },
    totalAcumulado: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    dataReferencia: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: "machine_pay_coletas_pendentes",
    timestamps: true,
  },
);

export default MachinePayColetaPendente;
