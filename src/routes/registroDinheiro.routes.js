const express = require("express");
const router = express.Router();
const registroDinheiroController = require("../controllers/registroDinheiroController");

// POST /registro-dinheiro
router.post("/", registroDinheiroController.criar);

// GET /registro-dinheiro
router.get("/", registroDinheiroController.listar);

module.exports = router;
