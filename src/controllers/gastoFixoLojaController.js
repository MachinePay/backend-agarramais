const { GastoFixoLoja } = require("../models");

// GET: Buscar gastos fixos de uma loja
exports.getGastosFixos = async (req, res) => {
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

// POST: Salvar (criar/atualizar) gastos fixos de uma loja
exports.saveGastosFixos = async (req, res) => {
  try {
    const { lojaId } = req.params;
    const { gastos } = req.body;
    if (!Array.isArray(gastos)) {
      return res.status(400).json({ error: "Gastos inválidos" });
    }

    // Atualiza ou cria cada gasto fixo
    for (const gasto of gastos) {
      await GastoFixoLoja.upsert({
        lojaId,
        nome: gasto.nome,
        valor: gasto.valor,
        observacao: gasto.observacao || null,
      });
    }
    res.json({ success: true });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Erro ao salvar gastos fixos", details: err.message });
  }
};
