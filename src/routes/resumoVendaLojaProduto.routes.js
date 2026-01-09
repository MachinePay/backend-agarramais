import express from "express";
import { getResumoVendaLojaProduto } from "../controllers/resumoVendaLojaProdutoController.js";

const router = express.Router();

router.get("/", getResumoVendaLojaProduto);

export default router;
