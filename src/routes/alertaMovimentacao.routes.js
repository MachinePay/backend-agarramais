import express from "express";
import {
  criarAlertaMovimentacao,
  listarAlertasMovimentacao,
  resolverAlertaMovimentacao,
} from "../controllers/alertaMovimentacaoController.js";
import { autenticar, autorizarRole } from "../middlewares/auth.js";
import { ROLES_GESTAO } from "../constants/roles.js";

const router = express.Router();

router.use(autenticar);

router.post("/", criarAlertaMovimentacao);
// Central de alertas: admin e operador chefe.
router.get("/", autorizarRole(...ROLES_GESTAO), listarAlertasMovimentacao);
router.patch(
  "/:id/resolver",
  autorizarRole(...ROLES_GESTAO),
  resolverAlertaMovimentacao,
);

export default router;
