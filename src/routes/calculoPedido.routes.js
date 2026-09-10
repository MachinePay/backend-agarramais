import express from "express";
import {
  analisarComIA,
  calcular,
} from "../controllers/calculoPedidoController.js";
import {
  autenticar,
  autorizarRole,
  registrarLog,
} from "../middlewares/auth.js";

const router = express.Router();

router.post(
  "/calcular",
  autenticar,
  autorizarRole("ADMIN", "COMERCIAL"),
  registrarLog("CALCULAR_PEDIDO", "CalculadoraPedidos"),
  calcular,
);

router.post(
  "/analisar-ia",
  autenticar,
  autorizarRole("ADMIN", "COMERCIAL"),
  registrarLog("ANALISAR_CAIXAS_IA", "CalculadoraPedidos"),
  analisarComIA,
);

export default router;
