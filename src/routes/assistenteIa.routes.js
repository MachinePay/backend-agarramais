import express from "express";
import { processarComandoAssistenteIa } from "../controllers/assistenteIaController.js";
import { autenticar, autorizarRole, registrarLog } from "../middlewares/auth.js";

const router = express.Router();

router.post(
  "/comando",
  autenticar,
  autorizarRole("ADMIN"),
  registrarLog("PROCESSAR_COMANDO_ASSISTENTE_IA", "AssistenteIA"),
  processarComandoAssistenteIa,
);

export default router;
