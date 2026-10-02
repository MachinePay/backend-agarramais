import RegistroDinheiro from "../models/RegistroDinheiro.js";
import { Op, fn, col, cast, where as sequelizeWhere } from "sequelize";
import { sequelize } from "../database/connection.js";
import {
  GastoVariavel,
  GastoTotalFixoLoja,
  GastoFixoLoja,
  MovimentacaoProduto,
  Movimentacao,
  Maquina,
  Produto,
  Loja,
  MachinePayColetaPendente,
} from "../models/index.js";
import {
  consultarFechamentoMachinePay,
  fecharFechamentoMachinePay,
  calcularTotalRecebidoMachinePay,
  ajustarStatsParaRecebimentoAParte,
} from "../services/machinePayService.js";
import {
  consultarFechamentoCompactPay,
  fecharFechamentoCompactPay,
} from "../services/compactPayService.js";
import {
  filtroLojaIdSemTeste,
  obterIdsLojasTeste,
  pedeSemLojasTeste,
} from "../utils/lojasTeste.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const diasNoMes = (ano, mes) => new Date(ano, mes, 0).getDate();

const inicioDoDia = (data) =>
  new Date(data.getFullYear(), data.getMonth(), data.getDate(), 0, 0, 0, 0);

const fimDoDia = (data) =>
  new Date(
    data.getFullYear(),
    data.getMonth(),
    data.getDate(),
    23,
    59,
    59,
    999,
  );

const listaMesesNoIntervalo = (inicio, fim) => {
  const meses = [];
  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  const limite = new Date(fim.getFullYear(), fim.getMonth(), 1);

  while (cursor <= limite) {
    meses.push({ ano: cursor.getFullYear(), mes: cursor.getMonth() + 1 });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return meses;
};

const normalizarValorMonetario = (valor) => {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;

  const valorNormalizado = String(valor)
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");

  const numero = Number(valorNormalizado);
  return Number.isFinite(numero) ? numero : 0;
};

const normalizarNomeGasto = (nomeOriginal) =>
  String(nomeOriginal || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const consolidarGastosFixosPorNome = (gastos) => {
  const mapa = new Map();

  for (const gasto of gastos) {
    const chave = normalizarNomeGasto(gasto?.nome);
    if (!chave) continue;
    mapa.set(chave, gasto);
  }

  return Array.from(mapa.values());
};

const calcularValorMensalDoGastoFixo = (gasto) => {
  const valor = Number(gasto?.valor || 0);

  if (!Number.isFinite(valor) || valor <= 0) return 0;
  return valor;
};

const calcularTotalFixoAtualDaLoja = async (lojaId) => {
  const gastos = await GastoFixoLoja.findAll({
    where: {
      [Op.and]: [sequelizeWhere(cast(col("lojaid"), "text"), String(lojaId))],
    },
    attributes: ["id", "nome", "valor"],
    order: [["id", "ASC"]],
    raw: true,
  });

  const gastosConsolidados = consolidarGastosFixosPorNome(gastos);

  const total = gastosConsolidados.reduce(
    (acc, item) => acc + calcularValorMensalDoGastoFixo(item),
    0,
  );

  return Number(total.toFixed(2));
};

const obterTotaisFixosMensais = async (lojaId, mesesIntervalo) => {
  if (!mesesIntervalo.length) return new Map();

  const totais = await GastoTotalFixoLoja.findAll({
    where: {
      [Op.and]: [sequelizeWhere(cast(col("lojaid"), "text"), String(lojaId))],
      [Op.or]: mesesIntervalo.map((m) => ({ ano: m.ano, mes: m.mes })),
    },
    raw: true,
  });

  const mapa = new Map(
    totais.map((item) => [
      `${item.ano}-${String(item.mes).padStart(2, "0")}`,
      Number(item.valorTotal || 0),
    ]),
  );

  const totalAtual = await calcularTotalFixoAtualDaLoja(lojaId);

  for (const item of mesesIntervalo) {
    const chave = `${item.ano}-${String(item.mes).padStart(2, "0")}`;
    const valorSalvo = Number(mapa.get(chave) || 0);
    const mudou = !mapa.has(chave) || Math.abs(valorSalvo - totalAtual) > 0.009;

    if (mudou) {
      try {
        await GastoTotalFixoLoja.upsert({
          lojaId,
          ano: item.ano,
          mes: item.mes,
          valorTotal: totalAtual,
        });
      } catch (error) {
        console.warn(
          "[RegistroDinheiro] Falha ao persistir total fixo mensal, seguindo com cálculo em memória:",
          error.message,
        );
      }
    }

    mapa.set(chave, totalAtual);
  }

  return mapa;
};

const calcularGastoFixoProporcional = async (lojaId, inicio, fim) => {
  const mesesIntervalo = listaMesesNoIntervalo(inicio, fim);
  const totaisPorMes = await obterTotaisFixosMensais(lojaId, mesesIntervalo);

  let totalProporcional = 0;

  for (const { ano, mes } of mesesIntervalo) {
    const chave = `${ano}-${String(mes).padStart(2, "0")}`;
    const valorMensal = Number(totaisPorMes.get(chave) || 0);
    if (valorMensal <= 0) continue;

    const inicioMes = inicioDoDia(new Date(ano, mes - 1, 1));
    const fimMes = fimDoDia(new Date(ano, mes, 0));
    const inicioAplicado = inicio > inicioMes ? inicio : inicioMes;
    const fimAplicado = fim < fimMes ? fim : fimMes;

    if (inicioAplicado > fimAplicado) continue;

    const diasDoPeriodoNoMes =
      Math.floor(
        (inicioDoDia(fimAplicado).getTime() -
          inicioDoDia(inicioAplicado).getTime()) /
          DAY_IN_MS,
      ) + 1;

    totalProporcional +=
      (valorMensal / diasNoMes(ano, mes)) * diasDoPeriodoNoMes;
  }

  return Number(totalProporcional.toFixed(2));
};

const calcularGastoVariavelPeriodo = async (lojaId, inicio, fim) => {
  const total = await GastoVariavel.sum("valor", {
    where: {
      [Op.and]: [sequelizeWhere(cast(col("lojaId"), "text"), String(lojaId))],
      dataInicio: { [Op.lte]: fim },
      dataFim: { [Op.gte]: inicio },
    },
  });

  return Number(total || 0);
};

const calcularGastoProdutosSaidaPeriodo = async (lojaId, inicio, fim) => {
  const itensVendidos = await MovimentacaoProduto.findAll({
    attributes: ["quantidadeSaiu"],
    include: [
      {
        model: Produto,
        as: "produto",
        attributes: ["custoUnitario", "preco"],
      },
      {
        model: Movimentacao,
        attributes: [],
        required: true,
        where: {
          dataColeta: { [Op.between]: [inicio, fim] },
        },
        include: [
          {
            model: Maquina,
            as: "maquina",
            attributes: [],
            required: true,
            where: { lojaId },
          },
        ],
      },
    ],
    raw: true,
    nest: true,
  });

  const custoTotal = itensVendidos.reduce((acc, item) => {
    const qtd = Number(item.quantidadeSaiu || 0);
    if (qtd <= 0) return acc;

    const custoUnitario = Number(item.produto?.custoUnitario || 0);
    const precoFallback = Number(item.produto?.preco || 0);
    const custo = custoUnitario > 0 ? custoUnitario : precoFallback;

    return acc + qtd * custo;
  }, 0);

  return Number(custoTotal.toFixed(2));
};

const calcularGastosPeriodo = async (lojaId, inicio, fim) => {
  const [gastoFixoPeriodo, gastoVariavelPeriodo, gastoProdutosPeriodo] =
    await Promise.all([
      calcularGastoFixoProporcional(lojaId, inicio, fim),
      calcularGastoVariavelPeriodo(lojaId, inicio, fim),
      calcularGastoProdutosSaidaPeriodo(lojaId, inicio, fim),
    ]);

  const gastoTotalPeriodo = Number(
    (gastoFixoPeriodo + gastoVariavelPeriodo + gastoProdutosPeriodo).toFixed(2),
  );

  return {
    gastoFixoPeriodo,
    gastoVariavelPeriodo,
    gastoProdutosPeriodo,
    gastoTotalPeriodo,
  };
};

// O fechamento (fecharFechamentoMachinePay) zera o extrato da máquina na
// Machine Pay para o período [inicio, fim]. Se a máquina tem "desconto
// automático" ativado, esse extrato é usado depois (calcularEstoqueRealMachinePay)
// pra saber quantos pulsos/fichas já saíram sozinhos desde a última
// movimentação — então zerar sem guardar esse valor faz a próxima sugestão
// de Total Pré perder a contagem do período que já foi fechado. Aqui a
// gente soma o que seria perdido em MachinePayColetaPendente ANTES de
// chamar o fechamento; o registro é apagado assim que a próxima
// movimentação é lançada (ver registrarMovimentacao).
const preservarTransacoesPendentesMachinePay = async ({
  maquina,
  fim,
}) => {
  const valorDesconto = Number(maquina.valorDescontoMachinePay || 0);
  if (!maquina.descontoAutomaticoMachinePay || valorDesconto <= 0) return;

  const [ultimaMov, pendenteExistente] = await Promise.all([
    Movimentacao.findOne({
      where: { maquinaId: maquina.id },
      order: [["dataColeta", "DESC"]],
    }),
    MachinePayColetaPendente.findOne({ where: { maquinaId: maquina.id } }),
  ]);

  const inicioJanela = pendenteExistente?.dataReferencia
    ? new Date(pendenteExistente.dataReferencia)
    : ultimaMov?.dataColeta
      ? new Date(ultimaMov.dataColeta)
      : null;

  // Sem movimentação anterior e sem acumulado pendente: não há nada que o
  // fechamento vá zerar que já não tenha sido contabilizado numa coleta.
  if (!inicioJanela) return;

  const fimJanela = new Date(fim);
  if (fimJanela <= inicioJanela) return;

  const totalJanela = await calcularTotalRecebidoMachinePay({
    posId: maquina.machinePayPosId,
    inicio: inicioJanela,
    fim: fimJanela,
  });

  const totalAcumulado = Number(
    (Number(pendenteExistente?.totalAcumulado || 0) + totalJanela).toFixed(2),
  );

  if (pendenteExistente) {
    await pendenteExistente.update({
      totalAcumulado,
      dataReferencia: fimJanela,
    });
  } else {
    await MachinePayColetaPendente.create({
      maquinaId: maquina.id,
      totalAcumulado,
      dataReferencia: fimJanela,
    });
  }
};

const registroDinheiroController = {
  async consultarMachinePay(req, res) {
    try {
      const { maquinaId, inicio, fim } = req.query;

      if (!maquinaId || !inicio || !fim) {
        return res.status(400).json({
          error: "Informe máquina, início e fim para consultar a Machine Pay.",
        });
      }

      const maquina = await Maquina.findByPk(maquinaId, {
        attributes: [
          "id",
          "codigo",
          "nome",
          "machinePayPosId",
          "compactPayId",
          "recebimentoAParteMachinePay",
        ],
      });

      if (!maquina) {
        return res.status(404).json({ error: "Máquina não encontrada." });
      }

      // Máquina só com CompactPay: mesmo formato de resposta, pra o
      // Registrar Dinheiro e os Relatórios tratarem igual.
      if (!maquina.machinePayPosId && maquina.compactPayId) {
        const dados = await consultarFechamentoCompactPay({
          compactPayId: maquina.compactPayId,
          inicio,
          fim,
        });
        return res.json({
          maquinaId: maquina.id,
          fonte: "compactPay",
          compactPayId: maquina.compactPayId,
          inicio,
          fim,
          ...dados,
        });
      }

      if (!maquina.machinePayPosId) {
        return res.status(400).json({
          error:
            "Esta máquina ainda não possui ID da Machine Pay nem da CompactPay cadastrado.",
        });
      }

      const dadosBrutos = await consultarFechamentoMachinePay({
        posId: maquina.machinePayPosId,
        inicio,
        fim,
      });

      const dados = maquina.recebimentoAParteMachinePay
        ? ajustarStatsParaRecebimentoAParte(dadosBrutos)
        : dadosBrutos;

      return res.json({
        maquinaId: maquina.id,
        fonte: "machinePay",
        machinePayPosId: maquina.machinePayPosId,
        inicio,
        fim,
        ...dados,
      });
    } catch (err) {
      console.error("[MachinePay] Erro ao consultar fechamento:", err);
      return res.status(502).json({
        error: "Não foi possível consultar a Machine Pay.",
        details: err.message,
      });
    }
  },

  async consultarMachinePayTotal(req, res) {
    try {
      const { inicio, fim } = req.query;

      if (!inicio || !fim) {
        return res.status(400).json({
          error: "Informe início e fim para consultar o total da Machine Pay.",
        });
      }

      const inicioPeriodo = new Date(inicio);
      const fimPeriodo = new Date(fim);

      if (
        Number.isNaN(inicioPeriodo.getTime()) ||
        Number.isNaN(fimPeriodo.getTime())
      ) {
        return res.status(400).json({
          error: "Período inválido para consultar o total da Machine Pay.",
        });
      }

      // Total geral (Dashboard / Ranking / Relatórios): lojas de teste
      // ficam de fora. Inclui as máquinas da CompactPay (cada item vem com
      // `fonte`); uma máquina com os dois IDs conta só pela Machine Pay.
      const lojaIdSemTeste = await filtroLojaIdSemTeste();
      const maquinas = await Maquina.findAll({
        where: {
          ativo: true,
          [Op.or]: [
            { machinePayPosId: { [Op.ne]: null } },
            { compactPayId: { [Op.ne]: null } },
          ],
          ...(lojaIdSemTeste ? { lojaId: lojaIdSemTeste } : {}),
        },
        attributes: [
          "id",
          "machinePayPosId",
          "compactPayId",
          "nome",
          "codigo",
          "valorFicha",
          "lojaId",
          "recebimentoAParteMachinePay",
        ],
        include: [{ model: Loja, as: "loja", attributes: ["id", "nome"] }],
      });

      const resultados = await Promise.all(
        maquinas.map(async (maquina) => {
          const base = {
            maquinaId: maquina.id,
            nome: maquina.nome,
            codigo: maquina.codigo,
            valorFicha: Number(maquina.valorFicha || 0),
            lojaId: maquina.lojaId,
            loja: maquina.loja?.nome || null,
          };
          const posId = maquina.machinePayPosId?.trim();
          const compactPayId = maquina.compactPayId?.trim();

          try {
            if (posId) {
              const dadosBrutos = await consultarFechamentoMachinePay({
                posId,
                inicio,
                fim,
              });
              const dados = maquina.recebimentoAParteMachinePay
                ? ajustarStatsParaRecebimentoAParte(dadosBrutos)
                : dadosBrutos;
              return {
                ...base,
                fonte: "machinePay",
                machinePayPosId: posId,
                ...dados,
                valorFaturamento: Number(dados.brutoComTaxasMp || 0),
              };
            }

            if (compactPayId) {
              const dados = await consultarFechamentoCompactPay({
                compactPayId,
                inicio,
                fim,
              });
              // No faturamento da máquina entra também o físico que a placa
              // contou (noteiro/moedeiro) — é o que a máquina recebeu.
              return {
                ...base,
                fonte: "compactPay",
                compactPayId,
                ...dados,
                valorFaturamento: Number(dados.total || 0),
              };
            }
          } catch (err) {
            console.error(
              `[PagamentosDigitais] Erro ao consultar máquina ${maquina.id} (${posId ? `MP pos ${posId}` : `CompactPay ${compactPayId}`}):`,
              err.message,
            );
          }
          return null;
        }),
      );

      const maquinasComDados = resultados.filter(Boolean);
      const somar = (lista, campo) =>
        Number(
          lista
            .reduce((acc, item) => acc + Number(item[campo] || 0), 0)
            .toFixed(2),
        );
      const maquinasMachinePay = maquinasComDados.filter(
        (item) => item.fonte === "machinePay",
      );
      const maquinasCompactPay = maquinasComDados.filter(
        (item) => item.fonte === "compactPay",
      );

      return res.json({
        totalBrutoComTaxasMp: somar(maquinasComDados, "valorFaturamento"),
        totalPix: somar(maquinasComDados, "pix"),
        totalCartao: somar(maquinasComDados, "cartao"),
        totalLiquido: somar(maquinasComDados, "liquido"),
        totalMachinePay: somar(maquinasMachinePay, "valorFaturamento"),
        totalCompactPay: somar(maquinasCompactPay, "valorFaturamento"),
        totalFisicoCompactPay: somar(maquinasCompactPay, "fisico"),
        maquinaCount: maquinasComDados.length,
        maquinaCountMachinePay: maquinasMachinePay.length,
        maquinaCountCompactPay: maquinasCompactPay.length,
        maquinas: maquinasComDados,
      });
    } catch (err) {
      console.error("[MachinePay] Erro ao consultar total Machine Pay:", err);
      return res.status(502).json({
        error: "Não foi possível consultar o total da Machine Pay.",
        details: err.message,
      });
    }
  },

  async criar(req, res) {
    try {
      const {
        loja,
        maquina,
        registrarTotalLoja,
        inicio,
        fim,
        valorDinheiro,
        valorCartaoPix,
        percentualTaxaCartaoMedia,
        observacoes,
        gastosVariaveis = [],
      } = req.body;

      const ehRegistroTotalLoja = !!registrarTotalLoja;

      console.log("[RegistrarDinheiro] Dados recebidos:", req.body);

      if (!loja || !inicio || !fim) {
        console.error("[RegistrarDinheiro] Campos obrigatórios ausentes");
        return res
          .status(400)
          .json({ error: "Campos obrigatórios ausentes: loja, início e fim." });
      }

      const inicioPeriodo = new Date(inicio);
      const fimPeriodo = new Date(fim);

      if (
        Number.isNaN(inicioPeriodo.getTime()) ||
        Number.isNaN(fimPeriodo.getTime())
      ) {
        return res.status(400).json({ error: "Período inválido." });
      }

      if (fimPeriodo < inicioPeriodo) {
        return res
          .status(400)
          .json({ error: "Data fim não pode ser menor que data início." });
      }

      if (!Array.isArray(gastosVariaveis)) {
        return res
          .status(400)
          .json({ error: "gastosVariaveis deve ser um array." });
      }

      const gastosVariaveisNormalizados = gastosVariaveis
        .map((item) => ({
          nome: String(item?.nome || "").trim(),
          valor: normalizarValorMonetario(item?.valor),
          observacao: item?.observacao ? String(item.observacao).trim() : null,
        }))
        .filter((item) => item.nome.length > 0);

      const totalGastosVariaveisNovos = ehRegistroTotalLoja
        ? gastosVariaveisNormalizados.reduce(
            (acc, item) => acc + Number(item.valor || 0),
            0,
          )
        : 0;

      const gastosPeriodo = ehRegistroTotalLoja
        ? await calcularGastosPeriodo(
            loja,
            inicioDoDia(inicioPeriodo),
            fimDoDia(fimPeriodo),
          )
        : {
            gastoFixoPeriodo: 0,
            gastoVariavelPeriodo: 0,
            gastoProdutosPeriodo: 0,
            gastoTotalPeriodo: 0,
          };

      const gastoVariavelPeriodoFinal = Number(
        (
          gastosPeriodo.gastoVariavelPeriodo + totalGastosVariaveisNovos
        ).toFixed(2),
      );
      const gastoTotalPeriodoFinal = Number(
        (
          gastosPeriodo.gastoFixoPeriodo +
          gastoVariavelPeriodoFinal +
          gastosPeriodo.gastoProdutosPeriodo
        ).toFixed(2),
      );

      const valorCartaoPixNumero = normalizarValorMonetario(valorCartaoPix);
      const percentualTaxaCartaoMediaNumero = Math.max(
        normalizarValorMonetario(percentualTaxaCartaoMedia),
        0,
      );
      const taxaDeCartao = Number(
        (
          valorCartaoPixNumero *
          (Math.min(percentualTaxaCartaoMediaNumero, 100) / 100)
        ).toFixed(2),
      );
      const valorCartaoPixLiquidoNumero = Number(
        Math.max(valorCartaoPixNumero - taxaDeCartao, 0).toFixed(2),
      );

      const dadosRegistro = {
        lojaId: loja,
        maquinaId: ehRegistroTotalLoja ? null : maquina || null,
        registrarTotalLoja: ehRegistroTotalLoja,
        inicio,
        fim,
        valorDinheiro: normalizarValorMonetario(valorDinheiro),
        valorCartaoPix: valorCartaoPixNumero,
        valorCartaoPixLiquido: valorCartaoPixLiquidoNumero,
        taxaDeCartao,
        percentualTaxaCartaoMedia: percentualTaxaCartaoMediaNumero,
        gastoFixoPeriodo: ehRegistroTotalLoja
          ? gastosPeriodo.gastoFixoPeriodo
          : 0,
        gastoVariavelPeriodo: ehRegistroTotalLoja
          ? gastoVariavelPeriodoFinal
          : 0,
        gastoProdutosPeriodo: ehRegistroTotalLoja
          ? gastosPeriodo.gastoProdutosPeriodo
          : 0,
        gastoTotalPeriodo: ehRegistroTotalLoja ? gastoTotalPeriodoFinal : 0,
        observacoes,
      };

      // Proteção contra clique duplo / reenvio: recusa um registro idêntico
      // (mesma loja, máquina, período e valores) criado há pouco.
      const registroDuplicado = await RegistroDinheiro.findOne({
        where: {
          lojaId: dadosRegistro.lojaId,
          maquinaId: dadosRegistro.maquinaId,
          registrarTotalLoja: dadosRegistro.registrarTotalLoja,
          inicio: inicioPeriodo,
          fim: fimPeriodo,
          valorDinheiro: dadosRegistro.valorDinheiro,
          valorCartaoPix: dadosRegistro.valorCartaoPix,
          createdAt: { [Op.gte]: new Date(Date.now() - 2 * 60 * 1000) },
        },
      });

      if (registroDuplicado) {
        return res.status(409).json({
          error:
            "Esse registro já foi salvo agora há pouco (possível clique duplo).",
        });
      }

      const transaction = await sequelize.transaction();

      try {
        const registro = await RegistroDinheiro.create(dadosRegistro, {
          fields: [
            "lojaId",
            "maquinaId",
            "registrarTotalLoja",
            "inicio",
            "fim",
            "valorDinheiro",
            "valorCartaoPix",
            "valorCartaoPixLiquido",
            "taxaDeCartao",
            "percentualTaxaCartaoMedia",
            "gastoFixoPeriodo",
            "gastoVariavelPeriodo",
            "gastoProdutosPeriodo",
            "gastoTotalPeriodo",
            "observacoes",
          ],
          transaction,
        });

        if (ehRegistroTotalLoja && gastosVariaveisNormalizados.length > 0) {
          const payloadGastosVariaveis = gastosVariaveisNormalizados.map(
            (item) => ({
              lojaId: loja,
              nome: item.nome,
              valor: item.valor,
              observacao: item.observacao,
              dataInicio: inicio,
              dataFim: fim,
              registroDinheiroId: registro.id,
            }),
          );

          await GastoVariavel.bulkCreate(payloadGastosVariaveis, {
            transaction,
          });
        }

        await transaction.commit();

        let fechamentoMachinePay = {
          executado: false,
          concluido: false,
          erro: null,
        };

        let fechamentoCompactPay = {
          executado: false,
          concluido: false,
          jaExistia: false,
          erro: null,
        };

        if (!ehRegistroTotalLoja && maquina) {
          try {
            const maquinaFechamento = await Maquina.findByPk(maquina, {
              attributes: [
                "id",
                "machinePayPosId",
                "compactPayId",
                "descontoAutomaticoMachinePay",
                "valorDescontoMachinePay",
              ],
            });

            if (
              !maquinaFechamento?.machinePayPosId &&
              maquinaFechamento?.compactPayId
            ) {
              try {
                const resultado = await fecharFechamentoCompactPay({
                  compactPayId: maquinaFechamento.compactPayId,
                  inicio,
                  fim,
                });
                fechamentoCompactPay = {
                  executado: true,
                  concluido: resultado.concluido,
                  jaExistia: resultado.jaExistia,
                  erro: null,
                };
              } catch (compactPayError) {
                console.error(
                  "[CompactPay] Erro ao executar fechamento:",
                  compactPayError,
                );
                fechamentoCompactPay = {
                  executado: true,
                  concluido: false,
                  jaExistia: false,
                  erro: compactPayError.message,
                };
              }
            }

            if (maquinaFechamento?.machinePayPosId) {
              try {
                await preservarTransacoesPendentesMachinePay({
                  maquina: maquinaFechamento,
                  fim,
                });
              } catch (preservarError) {
                // Se não deu pra preservar o que seria perdido, não executa
                // o fechamento agora — melhor deixar o extrato acumular na
                // própria Machine Pay do que zerar e perder a contagem.
                console.error(
                  "[MachinePay] Erro ao preservar transações pendentes antes do fechamento:",
                  preservarError,
                );
                throw new Error(
                  "Não foi possível preservar as transações da Machine Pay antes do fechamento; fechamento não executado.",
                );
              }

              const resultadoFechamento = await fecharFechamentoMachinePay({
                posId: maquinaFechamento.machinePayPosId,
                inicio,
                fim,
                valor: dadosRegistro.valorDinheiro,
              });

              fechamentoMachinePay = {
                executado: true,
                concluido: resultadoFechamento.concluido,
                erro: null,
              };
            }
          } catch (machinePayError) {
            console.error(
              "[MachinePay] Erro ao executar fechamento:",
              machinePayError,
            );
            fechamentoMachinePay = {
              executado: true,
              concluido: false,
              erro: machinePayError.message,
            };
          }
        }

        return res.status(201).json({
          ...registro.toJSON(),
          fechamentoMachinePay,
          fechamentoCompactPay,
        });
      } catch (dbError) {
        await transaction.rollback();
        throw dbError;
      }
    } catch (err) {
      console.error("[RegistrarDinheiro] Erro inesperado:", err);
      return res
        .status(500)
        .json({ error: "Erro ao registrar dinheiro", details: err.message });
    }
  },

  async listar(req, res) {
    try {
      const where = {};
      if (pedeSemLojasTeste(req)) {
        const idsTeste = await obterIdsLojasTeste();
        if (idsTeste.length) {
          where[Op.and] = [
            sequelizeWhere(cast(col("lojaId"), "text"), {
              [Op.notIn]: idsTeste,
            }),
          ];
        }
      }
      const registros = await RegistroDinheiro.findAll({
        where,
        order: [["createdAt", "DESC"]],
      });
      return res.json(registros);
    } catch (err) {
      return res
        .status(500)
        .json({ error: "Erro ao buscar registros", details: err.message });
    }
  },
};

export default registroDinheiroController;
