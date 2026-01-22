const express = require("express");
const router = express.Router();
const alertasVeiculosController = require("../controllers/alertasVeiculosController");

router.get("/", alertasVeiculosController.listarAlertas);

module.exports = router;
