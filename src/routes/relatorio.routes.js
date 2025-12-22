import express from "express";
import {
  balançoSemanal,
  alertasEstoque,
  performanceMaquinas,
} from "../controllers/relatorioController.js";
import { autenticar } from "../middlewares/auth.js";

const router = express.Router();

router.get("/balanco-semanal", autenticar, balançoSemanal);
router.get("/alertas-estoque", autenticar, alertasEstoque);
router.get("/performance-maquinas", autenticar, performanceMaquinas);

export default router;
