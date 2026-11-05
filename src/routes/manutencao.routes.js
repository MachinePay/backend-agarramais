import express from "express";
import {
  criarManutencao,
  editarManutencao,
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

const router = express.Router();

router.use(autenticar);

router.get("/", listarManutencoes);
router.get(
  "/alertas-compactpay",
  autorizarRole("ADMIN"),
  listarAlertasCompactPay,
);
router.get(
  "/funcionarios",
  autorizarRole("ADMIN"),
  listarFuncionariosManutencao,
);
router.post(
  "/",
  autorizarRole("ADMIN"),
  registrarLog("CRIAR_MANUTENCAO", "Manutencao"),
  criarManutencao,
);
router.put(
  "/:id",
  autorizarRole("ADMIN"),
  registrarLog("EDITAR_MANUTENCAO", "Manutencao"),
  editarManutencao,
);
router.patch(
  "/:id/resolver",
  registrarLog("RESOLVER_MANUTENCAO", "Manutencao"),
  resolverManutencao,
);

export default router;
