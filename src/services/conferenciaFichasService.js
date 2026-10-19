// Conferência das máquinas com placa CompactPay. A cada movimentação,
// compara o que o funcionário lançou com o que a placa contou desde a
// movimentação anterior (cada movimentação "zera" a conta):
// - fichas (máquina com "Conferir fichas com a CompactPay" marcado);
// - saída de prêmios pelo sensor OUT (máquina com "Conferir saída de prêmio
//   com a CompactPay" marcado).
// Se não bater, abre uma manutenção (ALERTA_FICHAS / ALERTA_SAIDA) sem
// funcionários vinculados — assim ela só aparece pro admin na tela de
// Manutenção.

import { Manutencao } from "../models/index.js";
import {
  contarFichasCompactPay,
  contarSaidasCompactPay,
} from "./compactPayService.js";

const formatarMoeda = (valor) =>
  Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const formatarDataHora = (data) =>
  new Date(data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

const descreverMaquina = (maquina) =>
  `Máquina: ${maquina.nome}${maquina.codigo ? ` (${maquina.codigo})` : ""} — CompactPay ${maquina.compactPayId}`;

export const conferirFichasMovimentacao = async ({
  maquina,
  movimentacao,
  movimentacaoAnterior,
  usuarioNome,
}) => {
  if (
    !maquina?.conferirFichasCompactPay ||
    !maquina?.compactPayId ||
    !movimentacaoAnterior
  ) {
    return null;
  }

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
    descreverMaquina(maquina),
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

// `sairam` da movimentação = totalPos anterior − totalPre contado agora,
// ou seja, quantos prêmios saíram desde a movimentação anterior.
export const conferirSaidaMovimentacao = async ({
  maquina,
  movimentacao,
  movimentacaoAnterior,
  usuarioNome,
}) => {
  if (
    !maquina?.conferirSaidaCompactPay ||
    !maquina?.compactPayId ||
    !movimentacaoAnterior
  ) {
    return null;
  }

  const inicio = movimentacaoAnterior.createdAt;
  const fim = movimentacao.createdAt;

  const saidasCompactPay = await contarSaidasCompactPay({
    compactPayId: maquina.compactPayId,
    inicio,
    fim,
  });

  const saidasMovimentacao = Number(movimentacao.sairam || 0);
  if (saidasMovimentacao === saidasCompactPay) return null;

  const diferenca = saidasMovimentacao - saidasCompactPay;
  const sinal = diferenca > 0 ? "+" : "";

  const descricao = [
    `A saída de prêmios da movimentação não bate com o que o sensor de saída do CompactPay contou.`,
    ``,
    descreverMaquina(maquina),
    `Período: ${formatarDataHora(inicio)} até ${formatarDataHora(fim)}`,
    `Movimentação: ${saidasMovimentacao} prêmio(s) saíram (total pós anterior ${movimentacaoAnterior.totalPos ?? "-"} − total pré ${movimentacao.totalPre ?? "-"})${usuarioNome ? ` — lançada por ${usuarioNome}` : ""}`,
    `CompactPay: ${saidasCompactPay} prêmio(s) pelo sensor de saída`,
    `Diferença: ${sinal}${diferenca} prêmio(s)`,
  ].join("\n");

  return Manutencao.create({
    titulo: `Saída de prêmios não confere - ${maquina.nome}`.slice(0, 150),
    descricao,
    lojaId: maquina.lojaId || null,
    criadoPorId: movimentacao.usuarioId,
    origem: "ALERTA_SAIDA",
    maquinaId: maquina.id,
    movimentacaoId: movimentacao.id,
  });
};
