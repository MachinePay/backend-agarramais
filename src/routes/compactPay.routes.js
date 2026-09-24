import express from "express";
import {
  consultarStatusMaquinas,
  consultarTotais,
  consultarTransacoes,
  devolverPagamento,
  enviarCredito,
  listarMaquinasCompactPay,
  validarId,
  verificarOnline,
} from "../controllers/compactPayController.js";
import { autenticar, autorizarRole } from "../middlewares/auth.js";

const router = express.Router();

router.use(autenticar, autorizarRole("ADMIN", "MACHINEPAY"));

router.get("/maquinas", listarMaquinasCompactPay);
router.get("/status", consultarStatusMaquinas);
router.get("/totais", consultarTotais);
router.get("/validar/:compactPayId", validarId);
router.post("/maquinas/:id/verificar-online", verificarOnline);
router.post("/maquinas/:id/credito", enviarCredito);
router.get("/maquinas/:id/transacoes", consultarTransacoes);
router.post("/maquinas/:id/pagamentos/:historicoId/devolver", devolverPagamento);

export default router;
