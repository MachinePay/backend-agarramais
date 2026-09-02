// Atualiza o valorFicha (preço da ficha) de todas as máquinas de lojas
// específicas, sem alterar nenhum dado histórico (Movimentacao.valorFichaUnitario,
// RegistroDinheiro e FechamentoMensalRelatorio guardam snapshots próprios e
// não são afetados por esta mudança — veja Maquina.js / relatorioController.js).
//
// Uso:
//   node update-valor-ficha-lojas.js            -> modo dry-run (só mostra o que faria)
//   node update-valor-ficha-lojas.js --apply    -> aplica de verdade

import { sequelize } from "./src/database/connection.js";
import { Maquina, Loja } from "./src/models/index.js";
import { Op } from "sequelize";

const NOVO_VALOR_FICHA = 3.0;
const NOMES_LOJAS = ["Aricanduva", "Tatuapé", "Boulevard"];
const APLICAR = process.argv.includes("--apply");

async function main() {
  await sequelize.authenticate();

  const lojas = await Loja.findAll({
    where: { nome: { [Op.in]: NOMES_LOJAS } },
    attributes: ["id", "nome"],
  });

  console.log("Lojas encontradas:");
  lojas.forEach((l) => console.log(`  - ${l.nome} (${l.id})`));

  const nomesFaltando = NOMES_LOJAS.filter(
    (nome) => !lojas.some((l) => l.nome === nome)
  );
  if (nomesFaltando.length > 0) {
    console.warn(
      `\nAVISO: não encontrei loja(s) com nome exato: ${nomesFaltando.join(", ")}. ` +
        `Verifique o nome cadastrado (ex.: acento, espaços) antes de prosseguir.`
    );
  }

  if (lojas.length === 0) {
    console.log("Nenhuma loja encontrada. Abortando.");
    return;
  }

  const maquinas = await Maquina.findAll({
    where: { lojaId: { [Op.in]: lojas.map((l) => l.id) } },
    include: [{ model: Loja, as: "loja", attributes: ["nome"] }],
  });

  console.log(`\n${maquinas.length} máquina(s) encontrada(s):`);
  maquinas.forEach((m) => {
    console.log(
      `  - [${m.loja.nome}] ${m.codigo || m.nome || m.id}: valorFicha atual = R$ ${Number(
        m.valorFicha
      ).toFixed(2)} -> novo = R$ ${NOVO_VALOR_FICHA.toFixed(2)}`
    );
  });

  if (!APLICAR) {
    console.log(
      "\nModo dry-run (nenhuma alteração foi feita). Rode novamente com --apply para aplicar."
    );
    return;
  }

  const [linhasAfetadas] = await Maquina.update(
    { valorFicha: NOVO_VALOR_FICHA },
    { where: { lojaId: { [Op.in]: lojas.map((l) => l.id) } } }
  );

  console.log(`\n${linhasAfetadas} máquina(s) atualizada(s) com sucesso.`);
  console.log(
    "Nenhum dado histórico (movimentações, fechamentos, registros de dinheiro) foi alterado."
  );
}

main()
  .catch((err) => {
    console.error("Erro:", err);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
