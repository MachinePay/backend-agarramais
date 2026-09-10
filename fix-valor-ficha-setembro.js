// Corrige o histórico de setembro/2026: para toda máquina cujo valorFicha
// ATUAL é R$ 3,00, recalcula valorFichaUnitario e valorFaturado de todas as
// suas movimentações de setembro/2026 usando R$ 3,00 o mês inteiro — em vez
// do valorFichaUnitario que ficou "congelado" (snapshot) na época de cada
// coleta, que pode ter sido diferente se o preço da ficha mudou durante o mês.
//
// Fórmula usada (igual à do movimentacaoController.js):
//   valorFaturado = fichas * valorFichaUnitario
//                  + quantidade_notas_entrada
//                  + valor_entrada_maquininha_pix
//
// Uso:
//   node fix-valor-ficha-setembro.js            -> modo dry-run (só mostra o que mudaria)
//   node fix-valor-ficha-setembro.js --apply    -> aplica de verdade

import { sequelize } from "./src/database/connection.js";
import { Maquina, Movimentacao, Loja } from "./src/models/index.js";
import { Op } from "sequelize";

const NOVO_VALOR_FICHA = 3.0;
const PERIODO_INICIO = new Date("2026-09-01T00:00:00");
const PERIODO_FIM = new Date("2026-09-30T23:59:59");
const APLICAR = process.argv.includes("--apply");

function calcularValorFaturado(mov, valorFichaUnitario) {
  const fichas = Number(mov.fichas || 0);
  const notas = Number(mov.quantidade_notas_entrada || 0);
  const pix = Number(mov.valor_entrada_maquininha_pix || 0);
  return Number((fichas * valorFichaUnitario + notas + pix).toFixed(2));
}

async function main() {
  await sequelize.authenticate();

  const maquinas = await Maquina.findAll({
    where: { valorFicha: NOVO_VALOR_FICHA },
    include: [{ model: Loja, as: "loja", attributes: ["nome"] }],
  });

  console.log(
    `Máquinas com valorFicha atual = R$ ${NOVO_VALOR_FICHA.toFixed(2)}: ${maquinas.length}`,
  );
  maquinas.forEach((m) =>
    console.log(`  - [${m.loja?.nome || "?"}] ${m.codigo || m.nome || m.id}`),
  );

  if (maquinas.length === 0) {
    console.log("Nenhuma máquina encontrada. Abortando.");
    return;
  }

  const maquinaIds = maquinas.map((m) => m.id);

  const movimentacoes = await Movimentacao.findAll({
    where: {
      maquinaId: { [Op.in]: maquinaIds },
      dataColeta: { [Op.between]: [PERIODO_INICIO, PERIODO_FIM] },
    },
    order: [["dataColeta", "ASC"]],
  });

  console.log(
    `\n${movimentacoes.length} movimentação(ões) encontrada(s) em setembro/2026 para essas máquinas.\n`,
  );

  let somaAntiga = 0;
  let somaNova = 0;
  let alteradas = 0;
  const mudancas = [];

  for (const mov of movimentacoes) {
    const valorAntigo = Number(mov.valorFaturado || 0);
    const valorFichaAntigo = Number(mov.valorFichaUnitario || 0);
    const valorNovo = calcularValorFaturado(mov, NOVO_VALOR_FICHA);

    somaAntiga += valorAntigo;
    somaNova += valorNovo;

    if (valorFichaAntigo !== NOVO_VALOR_FICHA || valorAntigo !== valorNovo) {
      alteradas++;
      mudancas.push({ mov, valorAntigo, valorFichaAntigo, valorNovo });
      console.log(
        `  ${mov.dataColeta.toISOString().slice(0, 10)} | maquinaId=${mov.maquinaId} | fichas=${mov.fichas} | ` +
          `ficha R$${valorFichaAntigo.toFixed(2)} -> R$${NOVO_VALOR_FICHA.toFixed(2)} | ` +
          `faturado R$${valorAntigo.toFixed(2)} -> R$${valorNovo.toFixed(2)}`,
      );
    }
  }

  console.log(`\nResumo:`);
  console.log(`  Movimentações que vão mudar: ${alteradas} de ${movimentacoes.length}`);
  console.log(`  Soma valorFaturado atual:    R$ ${somaAntiga.toFixed(2)}`);
  console.log(`  Soma valorFaturado nova:     R$ ${somaNova.toFixed(2)}`);
  console.log(`  Diferença:                   R$ ${(somaNova - somaAntiga).toFixed(2)}`);

  if (!APLICAR) {
    console.log(
      "\nModo dry-run (nenhuma alteração foi feita). Rode novamente com --apply para aplicar.",
    );
    return;
  }

  if (mudancas.length === 0) {
    console.log("\nNada para aplicar.");
    return;
  }

  await sequelize.transaction(async (t) => {
    for (const { mov, valorNovo } of mudancas) {
      await mov.update(
        { valorFichaUnitario: NOVO_VALOR_FICHA, valorFaturado: valorNovo },
        { transaction: t },
      );
    }
  });

  console.log(`\n${mudancas.length} movimentação(ões) atualizada(s) com sucesso.`);
}

main()
  .catch((err) => {
    console.error("Erro:", err);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
