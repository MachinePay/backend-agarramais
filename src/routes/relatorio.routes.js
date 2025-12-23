import express from "express";
import {
  balançoSemanal,
  alertasEstoque,
  performanceMaquinas,
  relatorioImpressao,
} from "../controllers/relatorioController.js";
import { autenticar, autorizarRole } from "../middlewares/auth.js";

const router = express.Router();

// Todas as rotas de relatórios são restritas a ADMIN
router.get(
  "/balanco-semanal",
  autenticar,
  autorizarRole("ADMIN"),
  balançoSemanal
);
router.get(
  "/alertas-estoque",
  autenticar,
  autorizarRole("ADMIN"),
  alertasEstoque
);
router.get(
  "/performance-maquinas",
  autenticar,
  autorizarRole("ADMIN"),
  performanceMaquinas
);
router.get(
  "/impressao",
  autenticar,
  autorizarRole("ADMIN"),
  relatorioImpressao
);

export default router;
