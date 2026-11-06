import express from "express";
import {
  balançoSemanal,
  alertasEstoque,
  performanceMaquinas,
  relatorioImpressao,
  relatorioTodasLojas,
  buscarAlertasDeInconsistencia,
  ignorarAlertaMovimentacao,
  dashboardRelatorio,
  alertasMovimentacaoOut,
  alertasMovimentacaoIn,
  alertasBomDesempenho,
} from "../controllers/relatorioController.js";
import { alertasAbastecimentoIncompleto } from "../controllers/movimentacaoController.js";
import { autenticar, autorizarRole } from "../middlewares/auth.js";
// Central de alertas: admin e operador chefe.
import { ROLES_GESTAO } from "../constants/roles.js";

const router = express.Router();

// Novas rotas para alertas OUT e IN
router.get(
  "/alertas-movimentacao-out",
  autenticar,
  autorizarRole(...ROLES_GESTAO),
  alertasMovimentacaoOut,
);
router.get(
  "/alertas-movimentacao-in",
  autenticar,
  autorizarRole(...ROLES_GESTAO),
  alertasMovimentacaoIn,
);
router.get(
  "/alertas-bom-desempenho",
  autenticar,
  autorizarRole("ADMIN"),
  alertasBomDesempenho,
);

// Todas as rotas de relatórios são restritas a ADMIN
router.get(
  "/balanco-semanal",
  autenticar,
  autorizarRole("ADMIN"),
  balançoSemanal,
);
router.get(
  "/alertas-movimentacao-inconsistente",
  autenticar,
  autorizarRole("ADMIN"),
  buscarAlertasDeInconsistencia,
);
router.delete(
  "/alertas-movimentacao-inconsistente/:id",
  autenticar,
  autorizarRole(...ROLES_GESTAO),
  ignorarAlertaMovimentacao,
);
router.get(
  "/alertas-estoque",
  autenticar,
  autorizarRole("ADMIN"),
  alertasEstoque,
);
router.get(
  "/performance-maquinas",
  autenticar,
  autorizarRole("ADMIN"),
  performanceMaquinas,
);
router.get(
  "/impressao",
  autenticar,
  autorizarRole("ADMIN"),
  relatorioImpressao,
);
router.get(
  "/todas-lojas",
  autenticar,
  autorizarRole("ADMIN"),
  relatorioTodasLojas,
);
router.get(
  "/dashboard",
  autenticar,
  autorizarRole("ADMIN"),
  dashboardRelatorio,
);
router.get(
  "/alertas-abastecimento-incompleto",
  autenticar,
  autorizarRole(...ROLES_GESTAO),
  alertasAbastecimentoIncompleto,
);

export default router;
