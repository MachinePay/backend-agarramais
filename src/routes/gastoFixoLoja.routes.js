const express = require("express");
const router = express.Router();
const controller = require("../controllers/gastoFixoLojaController");

// Buscar gastos fixos de uma loja
router.get("/:lojaId", controller.getGastosFixos);

// Salvar (criar/atualizar) gastos fixos de uma loja
router.post("/:lojaId", controller.saveGastosFixos);

module.exports = router;
