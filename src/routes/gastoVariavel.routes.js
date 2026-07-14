import express from "express";
import {
  criarGastoVariavel,
  listarGastosVariaveis,
} from "../controllers/gastoVariavelController.js";
import { autenticar } from "../middlewares/auth.js";

const router = express.Router();

router.post("/", autenticar, criarGastoVariavel);
router.get("/", autenticar, listarGastosVariaveis);

export default router;
