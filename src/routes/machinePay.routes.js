import express from "express";
import {
  consultarStatusMaquinas,
  consultarTransacoes24h,
  descobrirUsrPorPosId,
  devolverPagamento,
  enviarCreditosMqtt,
  listarMaquinasMachinePay,
} from "../controllers/machinePayController.js";
import {
  obterResumo,
  listarMaquinasMonitor,
  rankingQuedas,
  serieDiaria,
  detalharMaquinaMonitor,
  listarEventos,
  coletarAgora,
} from "../controllers/machinePayMonitorController.js";
import {
  listarClientes,
  listarCaixas,
  criarCaixa,
  listarCaixasQr,
  buscarQrCodes,
} from "../controllers/machinePayCaixasController.js";
import {
  autenticar,
  autorizarRole,
  registrarLog,
} from "../middlewares/auth.js";

const router = express.Router();

router.use(autenticar, autorizarRole("ADMIN", "MACHINEPAY"));

// ---- Monitoramento dos leitores (página "Machine Pay") ----
router.get("/monitor/resumo", obterResumo);
router.get("/monitor/maquinas", listarMaquinasMonitor);
router.get("/monitor/maquinas/:posId", detalharMaquinaMonitor);
router.get("/monitor/ranking-quedas", rankingQuedas);
router.get("/monitor/serie-diaria", serieDiaria);
router.get("/monitor/eventos", listarEventos);
router.post("/monitor/coletar", coletarAgora);

router.get("/maquinas", listarMaquinasMachinePay);
router.get("/status", consultarStatusMaquinas);
router.get("/descobrir-usr/:posId", descobrirUsrPorPosId);
router.post("/maquinas/:id/mqtt-creditos", enviarCreditosMqtt);
router.get("/maquinas/:id/transacoes-24h", consultarTransacoes24h);
router.post("/pagamentos/:idwebhook/devolver", devolverPagamento);

// Criar Caixas (Loja + Caixa Mercado Pago) — só ADMIN
router.get("/caixas/clientes", autorizarRole("ADMIN"), listarClientes);
router.get("/caixas/clientes/:clienteId", autorizarRole("ADMIN"), listarCaixas);
router.post(
  "/caixas",
  autorizarRole("ADMIN"),
  registrarLog("CRIAR_CAIXA_MACHINE_PAY", "MachinePayCaixa"),
  criarCaixa,
);
router.get(
  "/caixas/clientes/:clienteId/qrcodes",
  autorizarRole("ADMIN"),
  listarCaixasQr,
);
router.post(
  "/caixas/clientes/:clienteId/qrcodes",
  autorizarRole("ADMIN"),
  buscarQrCodes,
);

export default router;
