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
} from "../models/index.js";

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

const calcularTotalFixoAtualDaLoja = async (lojaId) => {
  const gastos = await GastoFixoLoja.findAll({
    where: {
      [Op.and]: [sequelizeWhere(cast(col("lojaid"), "text"), String(lojaId))],
    },
    attributes: [[fn("SUM", col("valor")), "total"]],
    raw: true,
  });

  return Number(gastos?.[0]?.total || 0);
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

  const faltantes = mesesIntervalo.filter(
    (item) => !mapa.has(`${item.ano}-${String(item.mes).padStart(2, "0")}`),
  );

  if (faltantes.length) {
    const totalAtual = await calcularTotalFixoAtualDaLoja(lojaId);

    for (const item of faltantes) {
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

      mapa.set(`${item.ano}-${String(item.mes).padStart(2, "0")}`, totalAtual);
    }
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

const registroDinheiroController = {
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
        observacoes,
        gastosVariaveis = [],
      } = req.body;

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

      const totalGastosVariaveisNovos = gastosVariaveisNormalizados.reduce(
        (acc, item) => acc + Number(item.valor || 0),
        0,
      );

      const gastosPeriodo = await calcularGastosPeriodo(
        loja,
        inicioDoDia(inicioPeriodo),
        fimDoDia(fimPeriodo),
      );

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

      const dadosRegistro = {
        lojaId: loja,
        maquinaId: registrarTotalLoja ? null : maquina || null,
        registrarTotalLoja: !!registrarTotalLoja,
        inicio,
        fim,
        valorDinheiro: valorDinheiro || 0,
        valorCartaoPix: valorCartaoPix || 0,
        gastoFixoPeriodo: gastosPeriodo.gastoFixoPeriodo,
        gastoVariavelPeriodo: gastoVariavelPeriodoFinal,
        gastoProdutosPeriodo: gastosPeriodo.gastoProdutosPeriodo,
        gastoTotalPeriodo: gastoTotalPeriodoFinal,
        observacoes,
      };

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
            "gastoFixoPeriodo",
            "gastoVariavelPeriodo",
            "gastoProdutosPeriodo",
            "gastoTotalPeriodo",
            "observacoes",
          ],
          transaction,
        });

        if (gastosVariaveisNormalizados.length > 0) {
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
        return res.status(201).json(registro);
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
      const registros = await RegistroDinheiro.findAll({
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
