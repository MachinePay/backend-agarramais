const express = require("express");
const router = express.Router();
const veiculoController = require("../controllers/veiculoController");

router.get("/", veiculoController.listar);
router.post("/", veiculoController.criar);
router.put("/:id", veiculoController.atualizar);
router.delete("/:id", veiculoController.remover);

module.exports = router;
