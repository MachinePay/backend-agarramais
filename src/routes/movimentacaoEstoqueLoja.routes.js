import express from "express";
import {
  listarMovimentacoesEstoqueLoja,
  criarMovimentacaoEstoqueLoja,
  editarMovimentacaoEstoqueLoja,
  deletarMovimentacaoEstoqueLoja,
} from "../controllers/movimentacaoEstoqueLojaController.js";
import { autenticar, autorizarRole } from "../middlewares/auth.js";
import { ROLES_GESTAO } from "../constants/roles.js";

const router = express.Router();

router.get("/", autenticar, listarMovimentacoesEstoqueLoja);
router.post("/", autenticar, criarMovimentacaoEstoqueLoja);
// Corrigir / apagar um lançamento de estoque: só gestão.
router.put(
  "/:id",
  autenticar,
  autorizarRole(...ROLES_GESTAO),
  editarMovimentacaoEstoqueLoja,
);
router.delete(
  "/:id",
  autenticar,
  autorizarRole(...ROLES_GESTAO),
  deletarMovimentacaoEstoqueLoja,
);

export default router;
