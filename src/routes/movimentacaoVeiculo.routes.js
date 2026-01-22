import express from "express";
import {
  registrarMovimentacaoVeiculo,
  listarMovimentacoesVeiculo,
  ultimasMovimentacoesPorVeiculo,
} from "../controllers/movimentacaoVeiculoController.js";
// Buscar últimas movimentações de cada veículo
router.get("/ultimas", ultimasMovimentacoesPorVeiculo);
import { autenticar } from "../middlewares/auth.js";

const router = express.Router();

// Registrar retirada ou devolução
router.post("/", autenticar, registrarMovimentacaoVeiculo);
// Listar movimentações com filtro
router.get("/", autenticar, listarMovimentacoesVeiculo);

export default router;
