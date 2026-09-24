import { Op } from "sequelize";
import { Loja } from "../models/index.js";

// Lojas marcadas como "loja de teste" (Loja.teste) funcionam normalmente
// quando consultadas sozinhas (relatório da loja, movimentações, etc.), mas
// ficam fora de tudo que soma dados de todas as lojas: Dashboard,
// Relatório de todas as lojas, Ranking de máquinas, Gráficos.

export const obterIdsLojasTeste = async () => {
  const lojas = await Loja.findAll({
    where: { teste: true },
    attributes: ["id"],
    raw: true,
  });
  return lojas.map((loja) => String(loja.id));
};

// Filtro pronto pra usar em `where.lojaId` (Maquina, GastoVariavel...).
// Retorna undefined quando não há loja de teste, pra não mexer na query.
export const filtroLojaIdSemTeste = async () => {
  const ids = await obterIdsLojasTeste();
  return ids.length ? { [Op.notIn]: ids } : undefined;
};

// Query string `semLojasTeste=true` nas listagens usadas pelas telas
// globais (Dashboard, Ranking de máquinas).
export const pedeSemLojasTeste = (req) =>
  ["true", "1"].includes(String(req.query?.semLojasTeste || "").toLowerCase());
