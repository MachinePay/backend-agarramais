import express from "express";
import {
  criarNotificacaoMudanca,
  listarNotificacoesMudanca,
  contarNotificacoesPendentes,
  aplicarNotificacaoMudanca,
  recusarNotificacaoMudanca,
} from "../controllers/notificacaoMudancaController.js";
import { autenticar, autorizarRole } from "../middlewares/auth.js";

const router = express.Router();

router.use(autenticar);

// Qualquer usuário cria (vem da tela de movimentação); só admin vê e decide.
router.post("/", criarNotificacaoMudanca);
router.get("/", autorizarRole("ADMIN"), listarNotificacoesMudanca);
router.get("/contagem", autorizarRole("ADMIN"), contarNotificacoesPendentes);
router.patch("/:id/aplicar", autorizarRole("ADMIN"), aplicarNotificacaoMudanca);
router.patch("/:id/recusar", autorizarRole("ADMIN"), recusarNotificacaoMudanca);

export default router;
