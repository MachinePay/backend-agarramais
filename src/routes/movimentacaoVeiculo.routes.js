import express from "express";
import {
  registrarMovimentacaoVeiculo,
  listarMovimentacoesVeiculo,
} from "../controllers/movimentacaoVeiculoController.js";
import { autenticar } from "../middlewares/auth.js";

const router = express.Router();

// Registrar retirada ou devolução

export default router;
router.get("/", autenticar, listarMovimentacoesVeiculo); // Listar movimentações com filtroouter.post("/", autenticar, registrarMovimentacaoVeiculo);
