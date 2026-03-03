import { GastoFixoLoja, GastoTotalFixoLoja } from "../models/index.js";
import { sequelize } from "../database/connection.js";
import { Op } from "sequelize";

const calcularValorMensalDoGasto = (gasto) => {
  const valor = Number(gasto?.valor || 0);

  if (!Number.isFinite(valor) || valor <= 0) return 0;
  return valor;
};

const calcularTotalFixoLoja = async (lojaId, transaction) => {
  const gastos = await GastoFixoLoja.findAll({
    where: { lojaId },
    attributes: ["nome", "valor"],
    raw: true,
    transaction,
  });

  const total = gastos.reduce(
    (acc, item) => acc + calcularValorMensalDoGasto(item),
    0,
  );

  return Number(total.toFixed(2));
};

export const getGastosFixos = async (req, res) => {
  try {
    const { lojaId } = req.params;
    const gastos = await GastoFixoLoja.findAll({
      where: { lojaId },
      order: [["nome", "ASC"]],
    });
    res.json(gastos);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Erro ao buscar gastos fixos", details: err.message });
  }
};

export const saveGastosFixos = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { lojaId } = req.params;
    const { gastos } = req.body;

    if (!Array.isArray(gastos)) {
      await transaction.rollback();
      return res.status(400).json({ error: "Gastos inválidos" });
    }

    const nomesRecebidos = [];

    for (const gasto of gastos) {
      const nome = String(gasto.nome || "").trim();
      if (!nome) continue;

      nomesRecebidos.push(nome);

      await GastoFixoLoja.upsert(
        {
          lojaId,
          nome,
          valor: Number(gasto.valor || 0),
          observacao: gasto.observacao || null,
        },
        { transaction },
      );
    }

    if (nomesRecebidos.length > 0) {
      await GastoFixoLoja.destroy({
        where: {
          lojaId,
          nome: { [Op.notIn]: nomesRecebidos },
        },
        transaction,
      });
    }

    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = agora.getMonth() + 1;
    const valorTotal = await calcularTotalFixoLoja(lojaId, transaction);

    await GastoTotalFixoLoja.upsert(
      {
        lojaId,
        ano,
        mes,
        valorTotal,
      },
      { transaction },
    );

    await transaction.commit();
    res.json({ success: true, ano, mes, valorTotal });
  } catch (err) {
    await transaction.rollback();
    res
      .status(500)
      .json({ error: "Erro ao salvar gastos fixos", details: err.message });
  }
};

export default {
  getGastosFixos,
  saveGastosFixos,
};
