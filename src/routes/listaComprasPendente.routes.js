import express from "express";
import listaComprasPendenteController from "../controllers/listaComprasPendenteController.js";
import { autenticar, autorizarRole } from "../middlewares/auth.js";
import { ROLES_GESTAO } from "../constants/roles.js";

const router = express.Router();

router.get("/", autenticar, listaComprasPendenteController.listar);
router.post("/", autenticar, listaComprasPendenteController.criar);
router.delete("/:id", autenticar, listaComprasPendenteController.excluir);
router.delete(
  "/:id/produto/:produtoId",
  autenticar,
  listaComprasPendenteController.removerProduto,
);
// Corrigir a lista antes de enviar pro estoque: admin e operador chefe.
router.put(
  "/:id/produto/:produtoId",
  autenticar,
  autorizarRole(...ROLES_GESTAO),
  listaComprasPendenteController.atualizarQuantidade,
);
router.post(
  "/:id/produto",
  autenticar,
  autorizarRole(...ROLES_GESTAO),
  listaComprasPendenteController.adicionarProduto,
);

export default router;
