import express from "express";
import {
  registrarMovimentacao,
  listarMovimentacoes,
  obterMovimentacao,
  atualizarMovimentacao,
  deletarMovimentacao,
  sugerirTotalPre,
  saidasCompactPayDesdeUltimaMovimentacao,
} from "../controllers/movimentacaoController.js";
import {
  autenticar,
  autorizarRole,
  registrarLog,
} from "../middlewares/auth.js";

const router = express.Router();

router.get("/", autenticar, listarMovimentacoes);
router.get("/sugestao-total-pre/:maquinaId", autenticar, sugerirTotalPre);
// Só admin: o funcionário não pode ver o número antes de contar.
router.get(
  "/saidas-compactpay/:maquinaId",
  autenticar,
  autorizarRole("ADMIN"),
  saidasCompactPayDesdeUltimaMovimentacao,
);
router.get("/:id", autenticar, obterMovimentacao);
router.post(
  "/",
  autenticar,
  registrarLog("REGISTRAR_MOVIMENTACAO", "Movimentacao"),
  registrarMovimentacao
);
router.put(
  "/:id",
  autenticar,
  registrarLog("EDITAR_MOVIMENTACAO", "Movimentacao"),
  atualizarMovimentacao
);
router.delete(
  "/:id",
  autenticar,
  autorizarRole("ADMIN"),
  registrarLog("DELETAR_MOVIMENTACAO", "Movimentacao"),
  deletarMovimentacao
);

export default router;
