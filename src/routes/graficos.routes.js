import express from "express";
import { getDashboardGraficos } from "../controllers/graficosController.js";
import { requireAdmin } from "../middlewares/auth.js";
const router = express.Router();

// Rota exclusiva para gráficos do dashboard
router.get("/dashboard", requireAdmin, getDashboardGraficos);

export default router;
