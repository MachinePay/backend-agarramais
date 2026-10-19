import { MachinePayColetaPendente } from "../models/index.js";
import { calcularTotalRecebidoMachinePay } from "./machinePayService.js";
import { calcularTotalRecebidoCompactPay } from "./compactPayService.js";

// Estoque real de uma máquina com "desconto automático": a cada
// valorDesconto recebido desde a última coleta a máquina libera 1 pulso/
// prêmio sem gerar movimentação, então o totalPos registrado fica
// desatualizado. Usa o que entrou na Machine Pay OU na CompactPay, conforme
// maquina.fonteDescontoAutomatico. Usado pela sugestão de Total Pré
// (movimentacaoController) e pelos alertas de estoque (relatorioController).
//
// Machine Pay: o fechamento mensal zera o extrato lá, então o que já foi
// recebido antes de um fechamento fica preservado em
// MachinePayColetaPendente (ver registroDinheiroController) e a consulta ao
// vivo parte do fim desse fechamento. CompactPay: o fechamento não apaga
// as vendas, então a consulta parte direto da última coleta.
export const FONTES_DESCONTO_AUTOMATICO = ["machinePay", "compactPay"];

// Sistema usado pelo desconto automático. Sem valor válido (registro
// antigo), usa a Machine Pay se a máquina tiver POS ID, senão a CompactPay.
export const fonteDescontoAutomatico = (maquina) =>
  FONTES_DESCONTO_AUTOMATICO.includes(maquina.fonteDescontoAutomatico)
    ? maquina.fonteDescontoAutomatico
    : maquina.machinePayPosId?.trim()
      ? "machinePay"
      : "compactPay";

// ID que o desconto automático deve consultar: só o do sistema escolhido.
export const idsDescontoAutomatico = (maquina) => {
  const fonte = fonteDescontoAutomatico(maquina);
  return {
    posId:
      fonte === "machinePay" ? maquina.machinePayPosId?.trim() || null : null,
    compactPayId:
      fonte === "compactPay" ? maquina.compactPayId?.trim() || null : null,
  };
};

export const calcularEstoqueRealPagamentos = async ({
  maquina,
  valorDesconto,
  totalPosAnterior,
  dataUltimaColeta,
}) => {
  const { posId, compactPayId } = idsDescontoAutomatico(maquina);

  const [totalMachinePay, totalCompactPay] = await Promise.all([
    posId
      ? (async () => {
          const pendente = await MachinePayColetaPendente.findOne({
            where: { maquinaId: maquina.id },
          });
          const inicio =
            pendente?.dataReferencia &&
            new Date(pendente.dataReferencia) > new Date(dataUltimaColeta)
              ? pendente.dataReferencia
              : dataUltimaColeta;
          const totalConsulta = await calcularTotalRecebidoMachinePay({
            posId,
            inicio,
            fim: new Date(),
          });
          return totalConsulta + Number(pendente?.totalAcumulado || 0);
        })()
      : 0,
    compactPayId
      ? calcularTotalRecebidoCompactPay({
          compactPayId,
          inicio: dataUltimaColeta,
          fim: new Date(),
        })
      : 0,
  ]);

  const totalRecebido = Number((totalMachinePay + totalCompactPay).toFixed(2));
  const pulsos = Math.floor(totalRecebido / valorDesconto);

  return {
    fonte: posId ? "machinePay" : "compactPay",
    estoqueReal: Math.max(0, totalPosAnterior - pulsos),
    totalRecebidoDesdeUltimaMovimentacao: totalRecebido,
    totalMachinePay: Number(totalMachinePay.toFixed(2)),
    totalCompactPay: Number(totalCompactPay.toFixed(2)),
    pulsos,
  };
};
