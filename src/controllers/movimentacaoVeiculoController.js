import MovimentacaoVeiculo from "../models/MovimentacaoVeiculo.js";
import Veiculo from "../models/Veiculo.js";
import Usuario from "../models/Usuario.js";
import { Op } from "sequelize";

// Registrar movimentação (retirada ou devolução)
export const registrarMovimentacaoVeiculo = async (req, res) => {
  try {
    const { veiculoId, tipo, gasolina, nivel_limpeza, estado, modo, obs } =
      req.body;
    const usuarioId = req.usuario?.id;
    if (!veiculoId || !tipo || !usuarioId) {
      return res.status(400).json({ error: "Dados obrigatórios ausentes." });
    }
    const movimentacao = await MovimentacaoVeiculo.create({
      veiculoId,
      usuarioId,
      tipo,
      dataHora: new Date(),
      gasolina,
      nivel_limpeza,
      estado,
      modo,
      obs,
    });
    res.status(201).json(movimentacao);
  } catch (error) {
    console.error("Erro ao registrar movimentação de veículo:", error);
    res
      .status(500)
      .json({ error: "Erro ao registrar movimentação de veículo" });
  }
};

// Listar movimentações com filtro por veiculo e data
export const listarMovimentacoesVeiculo = async (req, res) => {
  try {
    const { veiculoId, dataInicio, dataFim } = req.query;
    const where = {};
    if (veiculoId) where.veiculoId = veiculoId;
    let inicio, fim;
    if (dataInicio && dataFim) {
      inicio = new Date(dataInicio + "T00:00:00.000Z");
      fim = new Date(dataFim + "T23:59:59.999Z");
      where.dataHora = { [Op.gte]: inicio, [Op.lte]: fim };
      console.log("[Filtro] Período:", { dataInicio, dataFim, inicio, fim });
    } else if (dataInicio && !dataFim) {
      inicio = new Date(dataInicio + "T00:00:00.000Z");
      fim = new Date(dataInicio + "T23:59:59.999Z");
      where.dataHora = { [Op.gte]: inicio, [Op.lte]: fim };
      console.log("[Filtro] Só início:", { dataInicio, inicio, fim });
    } else if (!dataInicio && dataFim) {
      fim = new Date(dataFim + "T23:59:59.999Z");
      where.dataHora = { [Op.lte]: fim };
      console.log("[Filtro] Só fim:", { dataFim, fim });
    }
    console.log("[Filtro] where:", JSON.stringify(where));
    const movimentacoes = await MovimentacaoVeiculo.findAll({
      where,
      include: [
        { model: Veiculo, as: "veiculo", attributes: ["id", "nome", "modelo"] },
        { model: Usuario, as: "usuario", attributes: ["id", "nome", "email"] },
      ],
      order: [["dataHora", "DESC"]],
    });
    res.json(movimentacoes);
  } catch (error) {
    console.error("Erro ao listar movimentações de veículo:", error);
    res.status(500).json({ error: "Erro ao listar movimentações de veículo" });
  }
};
