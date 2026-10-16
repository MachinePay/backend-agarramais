// Conferência das máquinas de ficha do CompactPay. A cada movimentação,
// compara as fichas que o funcionário lançou com as que a placa contou
// desde a movimentação anterior (cada movimentação "zera" a conta). Se não
// bater, abre uma manutenção ALERTA_FICHAS sem funcionários vinculados —
// assim ela só aparece pro admin na tela de Manutenção.

import { Manutencao } from "../models/index.js";
import { contarFichasCompactPay } from "./compactPayService.js";

const formatarMoeda = (valor) =>
  Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const formatarDataHora = (data) =>
  new Date(data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export const conferirFichasMovimentacao = async ({
  maquina,
  movimentacao,
  movimentacaoAnterior,
  usuarioNome,
}) => {
  if (!maquina?.compactPayId || !movimentacaoAnterior) return null;

  const inicio = movimentacaoAnterior.createdAt;
  const fim = movimentacao.createdAt;

  const contagem = await contarFichasCompactPay({
    compactPayId: maquina.compactPayId,
    inicio,
    fim,
  });
  if (!contagem.maquinaFicha) return null;

  const fichasMovimentacao = Number(movimentacao.fichas || 0);
  const fichasCompactPay = contagem.fichas;
  if (fichasMovimentacao === fichasCompactPay) return null;

  const diferenca = fichasMovimentacao - fichasCompactPay;
  const sinal = diferenca > 0 ? "+" : "";

  const descricao = [
    `As fichas lançadas na movimentação não batem com as que o CompactPay contou.`,
    ``,
    `Máquina: ${maquina.nome}${maquina.codigo ? ` (${maquina.codigo})` : ""} — CompactPay ${maquina.compactPayId}`,
    `Período: ${formatarDataHora(inicio)} até ${formatarDataHora(fim)}`,
    `Movimentação: ${fichasMovimentacao} fichas (${formatarMoeda(fichasMovimentacao * contagem.valorFicha)})${usuarioNome ? ` — lançada por ${usuarioNome}` : ""}`,
    `CompactPay: ${fichasCompactPay} fichas (${formatarMoeda(contagem.valor)}) a ${formatarMoeda(contagem.valorFicha)} cada`,
    `Diferença: ${sinal}${diferenca} fichas (${sinal}${formatarMoeda(diferenca * contagem.valorFicha)})`,
  ].join("\n");

  return Manutencao.create({
    titulo: `Fichas não conferem - ${maquina.nome}`.slice(0, 150),
    descricao,
    lojaId: maquina.lojaId || null,
    criadoPorId: movimentacao.usuarioId,
    origem: "ALERTA_FICHAS",
    maquinaId: maquina.id,
    movimentacaoId: movimentacao.id,
  });
};
