import express from "express";
import {
  balançoSemanal,
  alertasEstoque,
  performanceMaquinas,
  relatorioImpressao,
} from "../controllers/relatorioController.js";
import { autenticar } from "../middlewares/auth.js";

const router = express.Router();

router.get("/balanco-semanal", autenticar, balançoSemanal);
router.get("/alertas-estoque", autenticar, alertasEstoque);
router.get("/performance-maquinas", autenticar, performanceMaquinas);
router.get("/impressao", autenticar, relatorioImpressao);

export default router;
