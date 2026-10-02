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

// Consulta o que a máquina recebeu no período na Machine Pay e/ou na
// CompactPay e devolve no formato de consultarFechamentoMachinePay. Máquina
// com os dois IDs soma as duas (cada uma também vem separada em
// `machinePay`/`compactPay`). `valorFaturamento` é o valor usado no
// Ranking/Dashboard/Relatórios: bruto da Machine Pay + total da CompactPay
// (digital + físico contado pela placa). Se só uma das duas responder, usa
// a que respondeu e lista a falha em `erros`; se nenhuma responder, lança.
const round2 = (valor) => Number(Number(valor || 0).toFixed(2));

const consultarPagamentosMaquina = async (maquina, inicio, fim) => {
  const posId = maquina.machinePayPosId?.trim();
  const compactPayId = maquina.compactPayId?.trim();
  const erros = [];

  const [machinePay, compactPay] = await Promise.all([
    posId
      ? consultarFechamentoMachinePay({ posId, inicio, fim })
          .then((dados) =>
            maquina.recebimentoAParteMachinePay
              ? ajustarStatsParaRecebimentoAParte(dados)
              : dados,
          )
          .catch((err) => {
            erros.push({ fonte: "machinePay", erro: err.message });
            return null;
          })
      : null,
    compactPayId
      ? consultarFechamentoCompactPay({ compactPayId, inicio, fim }).catch(
          (err) => {
            erros.push({ fonte: "compactPay", erro: err.message });
            return null;
          },
        )
      : null,
  ]);

  if (!machinePay && !compactPay) {
    throw new Error(
      erros.map((item) => item.erro).join(" | ") ||
        "Máquina sem ID da Machine Pay ou da CompactPay.",
    );
  }

  const mp = machinePay || {};
  const cp = compactPay || {};
  const bruto = round2(
    Number(mp.brutoComTaxasMp || 0) + Number(cp.brutoComTaxasMp || 0),
  );
  const taxas = round2(mp.taxas);
  const fonte =
    posId && compactPayId ? "ambos" : posId ? "machinePay" : "compactPay";

  return {
    fonte,
    machinePayPosId: posId || null,
    compactPayId: compactPayId || null,
    pix: round2(Number(mp.pix || 0) + Number(cp.pix || 0)),
    debito: round2(mp.debito),
    credito: round2(mp.credito),
    cartao: round2(Number(mp.cartao || 0) + Number(cp.cartao || 0)),
    app: round2(cp.app),
    brutoComTaxasMp: bruto,
    cartaoPix: bruto,
    taxas,
    liquido: round2(Number(mp.liquido || 0) + Number(cp.liquido || 0)),
    percentualTaxaMedia:
      compactPay && bruto > 0
        ? Number(((taxas / bruto) * 100).toFixed(4))
        : Number(mp.percentualTaxaMedia || 0),
    fisico: round2(cp.fisico),
    valorFaturamento: round2(
      Number(mp.brutoComTaxasMp || 0) + Number(cp.total || 0),
    ),
    valorMachinePay: round2(mp.brutoComTaxasMp),
    valorCompactPay: round2(cp.total),
    machinePay,
    compactPay,
    erros,
  };
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

      if (!maquina.machinePayPosId && !maquina.compactPayId) {
        return res.status(400).json({
          error:
            "Esta máquina ainda não possui ID da Machine Pay nem da CompactPay cadastrado.",
        });
      }

      const dados = await consultarPagamentosMaquina(maquina, inicio, fim);

      return res.json({
        maquinaId: maquina.id,
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
      // `fonte`); máquina com os dois IDs soma as duas (fonte "ambos").
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
          try {
            const dados = await consultarPagamentosMaquina(maquina, inicio, fim);
            dados.erros.forEach((item) =>
              console.error(
                `[PagamentosDigitais] Erro ao consultar ${item.fonte} da máquina ${maquina.id}:`,
                item.erro,
              ),
            );
            return {
              maquinaId: maquina.id,
              nome: maquina.nome,
              codigo: maquina.codigo,
              valorFicha: Number(maquina.valorFicha || 0),
              lojaId: maquina.lojaId,
              loja: maquina.loja?.nome || null,
              ...dados,
            };
          } catch (err) {
            console.error(
              `[PagamentosDigitais] Erro ao consultar máquina ${maquina.id}:`,
              err.message,
            );
            return null;
          }
        }),
      );

      const maquinasComDados = resultados.filter(Boolean);
      const somar = (campo) =>
        round2(
          maquinasComDados.reduce(
            (acc, item) => acc + Number(item[campo] || 0),
            0,
          ),
        );

      return res.json({
        totalBrutoComTaxasMp: somar("valorFaturamento"),
        totalPix: somar("pix"),
        totalCartao: somar("cartao"),
        totalLiquido: somar("liquido"),
        totalMachinePay: somar("valorMachinePay"),
        totalCompactPay: somar("valorCompactPay"),
        totalFisicoCompactPay: somar("fisico"),
        totalAppCompactPay: somar("app"),
        maquinaCount: maquinasComDados.length,
        maquinaCountMachinePay: maquinasComDados.filter(
          (item) => item.machinePayPosId,
        ).length,
        maquinaCountCompactPay: maquinasComDados.filter(
          (item) => item.compactPayId,
        ).length,
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

            // Máquina com os dois IDs fecha nos dois sistemas.
            if (maquinaFechamento?.compactPayId?.trim()) {
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
