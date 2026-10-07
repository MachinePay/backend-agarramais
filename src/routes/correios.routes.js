import express from "express";
import {
  buscarPedidos,
  detalharPedido,
  cotar,
  criarPostagem,
  baixarPdfs,
} from "../controllers/correiosController.js";
import {
  autenticar,
  autorizarRole,
  registrarLog,
} from "../middlewares/auth.js";

const router = express.Router();

router.use(autenticar, autorizarRole("ADMIN", "COMERCIAL"));

router.get("/pedidos", buscarPedidos);
router.get("/pedidos/:id", detalharPedido);
router.post("/cotacao", cotar);
router.post(
  "/postagens",
  registrarLog("CRIAR_POSTAGEM_VIPP", "CorreiosPostagem"),
  criarPostagem,
);
router.get("/postagens/:id/pdfs", baixarPdfs);

export default router;
