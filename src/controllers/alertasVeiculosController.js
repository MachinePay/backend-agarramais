const { gerarAlertasVeiculos } = require("../utils/alertasVeiculos");

module.exports = {
  async listarAlertas(req, res) {
    try {
      const alertas = await gerarAlertasVeiculos();
      res.json(alertas);
    } catch (err) {
      res
        .status(500)
        .json({
          error: "Erro ao buscar alertas de veículos",
          details: err.message,
        });
    }
  },
};
