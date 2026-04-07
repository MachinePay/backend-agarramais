import express from "express";
import sangriaController from "../controllers/sangriaController.js";
import { autenticar } from "../middlewares/auth.js";

const router = express.Router();

router.post("/", autenticar, sangriaController.criar);
router.get("/", autenticar, sangriaController.listar);

export default router;