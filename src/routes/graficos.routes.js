const express = require("express");
const router = express.Router();
const { getDashboardGraficos } = require("../controllers/graficosController");
const { requireAdmin } = require("../middlewares/auth");

// Rota exclusiva para gráficos do dashboard
router.get("/dashboard", requireAdmin, getDashboardGraficos);

module.exports = router;
