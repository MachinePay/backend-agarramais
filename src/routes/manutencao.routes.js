import express from "express";
import {
  analisarRepeticoesManutencao,
  criarManutencao,
  editarManutencao,
  excluirManutencao,
  listarFuncionariosManutencao,
  listarManutencoes,
  resolverManutencao,
} from "../controllers/manutencaoController.js";
import { listarAlertasCompactPay } from "../controllers/alertaCompactPayController.js";
import {
  autenticar,
  autorizarRole,
  registrarLog,
} from "../middlewares/auth.js";
import { ROLES_GESTAO } from "../constants/roles.js";

const router = express.Router();

router.use(autenticar);

router.get("/", listarManutencoes);
router.get(
  "/analise-repeticao",
  autorizarRole(...ROLES_GESTAO),
  analisarRepeticoesManutencao,
);
router.get(
  "/alertas-compactpay",
  autorizarRole(...ROLES_GESTAO),
  listarAlertasCompactPay,
);
router.get(
  "/funcionarios",
  autorizarRole(...ROLES_GESTAO),
  listarFuncionariosManutencao,
);
router.post(
  "/",
  autorizarRole(...ROLES_GESTAO),
  registrarLog("CRIAR_MANUTENCAO", "Manutencao"),
  criarManutencao,
);
router.put(
  "/:id",
  autorizarRole(...ROLES_GESTAO),
  registrarLog("EDITAR_MANUTENCAO", "Manutencao"),
  editarManutencao,
);
router.delete(
  "/:id",
  autorizarRole("ADMIN"),
  registrarLog("EXCLUIR_MANUTENCAO", "Manutencao"),
  excluirManutencao,
);
router.patch(
  "/:id/resolver",
  registrarLog("RESOLVER_MANUTENCAO", "Manutencao"),
  resolverManutencao,
);

export default router;
