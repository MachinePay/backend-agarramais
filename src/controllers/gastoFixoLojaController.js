import { GastoFixoLoja, GastoTotalFixoLoja } from "../models/index.js";
import { sequelize } from "../database/connection.js";

const calcularTotalFixoLoja = async (lojaId, transaction) => {
  const gastos = await GastoFixoLoja.findAll({
    where: { lojaId },
    attributes: ["valor"],
    raw: true,
    transaction,
  });

  return gastos.reduce((acc, item) => acc + Number(item.valor || 0), 0);
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

    for (const gasto of gastos) {
      const nome = String(gasto.nome || "").trim();
      if (!nome) continue;

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
