import RegistroDinheiro from "../models/RegistroDinheiro.js";

const registroDinheiroController = {
  async criar(req, res) {
    try {
      const {
        loja,
        maquina,
        registrarTotalLoja,
        inicio,
        fim,
        valorDinheiro,
        valorCartaoPix,
        observacoes,
      } = req.body;

      // Se registrarTotalLoja, não registrar máquina
      const registro = await RegistroDinheiro.create({
        lojaId: loja,
        maquinaId: registrarTotalLoja ? null : maquina || null,
        registrarTotalLoja: !!registrarTotalLoja,
        inicio,
        fim,
        valorDinheiro: valorDinheiro || 0,
        valorCartaoPix: valorCartaoPix || 0,
        observacoes,
      });
      return res.status(201).json(registro);
    } catch (err) {
      return res
        .status(500)
        .json({ error: "Erro ao registrar dinheiro", details: err.message });
    }
  },

  async listar(req, res) {
    try {
      const registros = await RegistroDinheiro.findAll({
        order: [["createdAt", "DESC"]],
      });
      return res.json(registros);
    } catch (err) {
      return res
        .status(500)
        .json({ error: "Erro ao buscar registros", details: err.message });
    }
  },
};

export default registroDinheiroController;
