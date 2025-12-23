import express from "express";
import {
  listarEstoqueLoja,
  atualizarEstoqueLoja,
  atualizarVariosEstoques,
  deletarEstoqueLoja,
  alertasEstoqueLoja,
  criarOuAtualizarProdutoEstoque,
} from "../controllers/estoqueLojaController.js";
import { autenticar, registrarLog } from "../middlewares/auth.js";

const router = express.Router();

// Todas as rotas requerem autenticação (ADMIN e FUNCIONARIO podem acessar)
router.get("/:lojaId", autenticar, listarEstoqueLoja);
router.get("/:lojaId/alertas", autenticar, alertasEstoqueLoja);

router.put(
  "/:lojaId/:produtoId",
  autenticar,
  registrarLog("ATUALIZAR_ESTOQUE_LOJA", "EstoqueLoja"),
  atualizarEstoqueLoja
);

router.put(
  "/:lojaId/varios",
  autenticar,
  registrarLog("ATUALIZAR_VARIOS_ESTOQUES", "EstoqueLoja"),
  atualizarVariosEstoques
);

// POST para criar/atualizar produto único (usado pelo Dashboard)
router.post(
  "/:lojaId",
  autenticar,
  registrarLog("CRIAR_ATUALIZAR_ESTOQUE", "EstoqueLoja"),
  criarOuAtualizarProdutoEstoque
);

// POST /varios para atualizar múltiplos produtos (se precisar)
router.post(
  "/:lojaId/varios",
  autenticar,
  registrarLog("ATUALIZAR_VARIOS_ESTOQUES", "EstoqueLoja"),
  atualizarVariosEstoques
);

router.delete(
  "/:lojaId/:produtoId",
  autenticar,
  registrarLog("DELETAR_ESTOQUE_LOJA", "EstoqueLoja"),
  deletarEstoqueLoja
);

export default router;
