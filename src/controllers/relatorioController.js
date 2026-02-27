// src/controllers/relatorioController.js
import {
  Sequelize,
  Op,
  fn,
  col,
  cast,
  where as sequelizeWhere,
} from "sequelize";
import {
  Movimentacao,
  MovimentacaoProduto,
  Maquina,
  Loja,
  Produto,
  AlertaIgnorado,
  RegistroDinheiro,
  GastoVariavel,
  GastoFixoLoja,
  GastoTotalFixoLoja,
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

const calcularTotalFixoAtualDaLoja = async (lojaId) => {
  const gastosFixos = await GastoFixoLoja.findAll({
    where: {
      [Op.and]: [sequelizeWhere(cast(col("lojaid"), "text"), String(lojaId))],
    },
    attributes: ["valor"],
    raw: true,
  });

  return gastosFixos.reduce((acc, item) => acc + Number(item.valor || 0), 0);
};

const obterTotaisFixosMensais = async (lojaId, mesesIntervalo) => {
  if (!mesesIntervalo.length) return new Map();

  const totaisMensais = await GastoTotalFixoLoja.findAll({
    where: {
      [Op.and]: [sequelizeWhere(cast(col("lojaid"), "text"), String(lojaId))],
      [Op.or]: mesesIntervalo.map((m) => ({ ano: m.ano, mes: m.mes })),
    },
    raw: true,
  });

  const mapaTotais = new Map(
    totaisMensais.map((item) => [
      `${item.ano}-${String(item.mes).padStart(2, "0")}`,
      Number(item.valorTotal || 0),
    ]),
  );

  const faltantes = mesesIntervalo.filter(
    (m) => !mapaTotais.has(`${m.ano}-${String(m.mes).padStart(2, "0")}`),
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
          "[Relatorio] Falha ao persistir total fixo mensal, seguindo com cálculo em memória:",
          error.message,
        );
      }

      mapaTotais.set(
        `${item.ano}-${String(item.mes).padStart(2, "0")}`,
        totalAtual,
      );
    }
  }

  return mapaTotais;
};

const calcularGastoFixoProporcionalPeriodo = async (lojaId, inicio, fim) => {
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

// --- DASHBOARD GERAL ---
export const dashboardRelatorio = async (req, res) => {
  try {
    const { lojaId, dataInicio, dataFim } = req.query;

    // 1. Configuração de Datas
    const fim = dataFim ? new Date(`${dataFim}T23:59:59`) : new Date();
    const inicio = dataInicio
      ? new Date(`${dataInicio}T00:00:00`)
      : new Date(new Date().setDate(fim.getDate() - 30));

    // 2. Filtros
    const whereMovimentacao = {
      dataColeta: { [Op.between]: [inicio, fim] },
    };

    const whereMaquina = {};
    if (lojaId) whereMaquina.lojaId = lojaId;

    // --- QUERY 1: TOTAIS GERAIS ---
    const totaisRaw = await Movimentacao.findAll({
      attributes: [
        [fn("SUM", col("fichas")), "totalFichas"],
        [fn("SUM", col("sairam")), "totalSairam"],
        [fn("SUM", col("valorFaturado")), "faturamentoTotal"],
        [fn("SUM", col("quantidade_notas_entrada")), "dinheiro"],
        [fn("SUM", col("valor_entrada_maquininha_pix")), "pix"],
      ],
      include: [
        {
          model: Maquina,
          as: "maquina",
          where: whereMaquina,
          attributes: [],
        },
      ],
      where: whereMovimentacao,
      raw: true,
    });

    const totaisDados = totaisRaw[0] || {};
    const faturamento = parseFloat(totaisDados.faturamentoTotal || 0);
    const saidas = parseInt(totaisDados.totalSairam || 0);
    const fichas = parseInt(totaisDados.totalFichas || 0);
    const dinheiroMovimentacao = parseFloat(totaisDados.dinheiro || 0);
    const pixMovimentacao = parseFloat(totaisDados.pix || 0);

    let dinheiro = dinheiroMovimentacao;
    let pix = pixMovimentacao;

    if (lojaId) {
      const registrosDinheiro = await RegistroDinheiro.findAll({
        where: {
          [Op.and]: [
            sequelizeWhere(cast(col("lojaId"), "text"), String(lojaId)),
          ],
          inicio: { [Op.lte]: fim },
          fim: { [Op.gte]: inicio },
        },
        raw: true,
      });

      const registrosPreferidos = registrosDinheiro.filter(
        (registro) =>
          registro.registrarTotalLoja === true ||
          registro.registrar_total_loja === true,
      );

      const baseRegistros =
        registrosPreferidos.length > 0
          ? registrosPreferidos
          : registrosDinheiro;

      const dinheiroRegistro = baseRegistros.reduce(
        (acc, registro) => acc + Number(registro.valorDinheiro || 0),
        0,
      );

      const cartaoPixRegistro = baseRegistros.reduce(
        (acc, registro) => acc + Number(registro.valorCartaoPix || 0),
        0,
      );

      if (dinheiroRegistro > 0 || cartaoPixRegistro > 0) {
        dinheiro = dinheiroRegistro;
        pix = cartaoPixRegistro;
      }
    }

    // --- QUERY 2: CUSTO DE PRODUTOS (TOTAL E DIÁRIO) ---
    const itensVendidos = await MovimentacaoProduto.findAll({
      attributes: ["quantidadeSaiu"],
      include: [
        {
          model: Produto,
          as: "produto",
          attributes: ["id", "nome", "codigo", "emoji", "custoUnitario"],
        },
        {
          model: Movimentacao,
          attributes: [],
          where: whereMovimentacao,
          include: [
            {
              model: Maquina,
              as: "maquina",
              where: whereMaquina,
              attributes: [],
            },
          ],
        },
      ],
      raw: true,
      nest: true,
    });

    const custoProdutosTotal = itensVendidos.reduce((acc, item) => {
      const qtd = item.quantidadeSaiu || 0;
      const custo = parseFloat(item.produto?.custoUnitario || 0);
      return acc + qtd * custo;
    }, 0);

    const itensVendidosPorDia = await MovimentacaoProduto.findAll({
      attributes: ["quantidadeSaiu"],
      include: [
        {
          model: Produto,
          as: "produto",
          attributes: ["custoUnitario"],
        },
        {
          model: Movimentacao,
          attributes: ["dataColeta"],
          where: whereMovimentacao,
          include: [
            {
              model: Maquina,
              as: "maquina",
              where: whereMaquina,
              attributes: [],
            },
          ],
        },
      ],
      raw: true,
      nest: true,
    });

    const custoProdutosPorDia = new Map();
    itensVendidosPorDia.forEach((item) => {
      const dataColeta = item.Movimentacao?.dataColeta;
      if (!dataColeta) return;

      const chaveData = new Date(dataColeta).toISOString().slice(0, 10);
      const qtd = Number(item.quantidadeSaiu || 0);
      const custoUnitario = Number(item.produto?.custoUnitario || 0);
      const custoItem = qtd * custoUnitario;

      custoProdutosPorDia.set(
        chaveData,
        Number(custoProdutosPorDia.get(chaveData) || 0) + custoItem,
      );
    });

    let custoFixoPeriodo = 0;
    let custoVariavelPeriodo = 0;
    if (lojaId) {
      custoFixoPeriodo = await calcularGastoFixoProporcionalPeriodo(
        lojaId,
        inicio,
        fim,
      );
      custoVariavelPeriodo = await calcularGastoVariavelPeriodo(
        lojaId,
        inicio,
        fim,
      );
    }

    const diasNoPeriodo =
      Math.floor(
        (inicioDoDia(fim).getTime() - inicioDoDia(inicio).getTime()) /
          DAY_IN_MS,
      ) + 1;
    const custoRateadoDiario =
      diasNoPeriodo > 0
        ? (Number(custoFixoPeriodo || 0) + Number(custoVariavelPeriodo || 0)) /
          diasNoPeriodo
        : 0;

    const custoTotal =
      Number(custoProdutosTotal || 0) +
      Number(custoFixoPeriodo || 0) +
      Number(custoVariavelPeriodo || 0);
    const lucro = faturamento - custoTotal;

    // --- QUERY 3: GRÁFICO FINANCEIRO ---
    const timelineRaw = await Movimentacao.findAll({
      attributes: [
        [fn("DATE", col("dataColeta")), "data"],
        [fn("SUM", col("valorFaturado")), "faturamento"],
      ],
      include: [
        {
          model: Maquina,
          as: "maquina",
          where: whereMaquina,
          attributes: [],
        },
      ],
      where: whereMovimentacao,
      group: [fn("DATE", col("dataColeta"))],
      order: [[fn("DATE", col("dataColeta")), "ASC"]],
      raw: true,
    });

    // --- QUERY 4: PERFORMANCE POR MÁQUINA ---
    const performanceRaw = await Movimentacao.findAll({
      attributes: [
        [col("maquina.nome"), "nome"],
        [fn("SUM", col("valorFaturado")), "faturamento"],
      ],
      include: [
        {
          model: Maquina,
          as: "maquina",
          where: whereMaquina,
          attributes: ["id", "nome", "capacidadePadrao"],
        },
      ],
      where: whereMovimentacao,
      group: ["maquina.id", "maquina.nome", "maquina.capacidadePadrao"],
      raw: true,
      nest: true,
    });

    const performanceMaquinas = await Promise.all(
      performanceRaw.map(async (p) => {
        const ultimaMov = await Movimentacao.findOne({
          where: { maquinaId: p.maquina.id },
          order: [["dataColeta", "DESC"]],
          attributes: ["totalPos"],
        });

        const estoqueAtual = ultimaMov ? ultimaMov.totalPos : 0;
        const capacidade = p.maquina.capacidadePadrao || 100;

        return {
          nome: p.maquina.nome,
          faturamento: parseFloat(p.faturamento || 0),
          ocupacao: ((estoqueAtual / capacidade) * 100).toFixed(1),
        };
      }),
    );

    // --- QUERY 5: RANKING DE PRODUTOS ---
    const rankingRaw = await MovimentacaoProduto.findAll({
      attributes: [
        [col("produto.nome"), "nome"],
        [fn("SUM", col("quantidadeSaiu")), "quantidade"],
      ],
      include: [
        { model: Produto, as: "produto", attributes: ["id", "nome"] },
        {
          model: Movimentacao,
          attributes: [],
          where: whereMovimentacao,
          include: [
            {
              model: Maquina,
              as: "maquina",
              where: whereMaquina,
              attributes: [],
            },
          ],
        },
      ],
      group: ["produto.id", "produto.nome"],
      order: [[fn("SUM", col("quantidadeSaiu")), "DESC"]],
      limit: 10,
      raw: true,
    });

    const rankingProdutos = rankingRaw.map((r) => ({
      nome: r.nome || "Desconhecido",
      quantidade: parseInt(r.quantidade || 0),
    }));

    const faturamentoPorDia = new Map(
      timelineRaw.map((t) => [
        String(t.data).slice(0, 10),
        Number(parseFloat(t.faturamento || 0)),
      ]),
    );

    const cursor = inicioDoDia(new Date(inicio));
    const fimDia = inicioDoDia(new Date(fim));
    const graficoFinanceiro = [];

    while (cursor <= fimDia) {
      const chaveData = cursor.toISOString().slice(0, 10);
      const faturamentoDia = Number(faturamentoPorDia.get(chaveData) || 0);
      const custoProdutosDia = Number(custoProdutosPorDia.get(chaveData) || 0);
      const custoDia = Number(custoProdutosDia + custoRateadoDiario);
      const lucroDia = Number(faturamentoDia - custoDia);

      graficoFinanceiro.push({
        data: chaveData,
        faturamento: Number(faturamentoDia.toFixed(2)),
        custo: Number(custoDia.toFixed(2)),
        lucro: Number(lucroDia.toFixed(2)),
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    // --- RESPOSTA FINAL ---
    res.json({
      totais: {
        faturamento,
        lucro,
        custoTotal,
        custoProdutosTotal,
        custoFixoPeriodo,
        custoVariavelPeriodo,
        saidas,
        fichas,
        dinheiro,
        pix,
      },
      graficoFinanceiro,
      performanceMaquinas,
      rankingProdutos,
    });
  } catch (error) {
    console.error("Erro Crítico no Dashboard:", error);
    res.status(500).json({
      error: "Erro interno ao processar dashboard.",
      details: error.message,
    });
  }
};

// --- ALERTAS DE INCONSISTÊNCIA (CORRIGIDO) ---
export const buscarAlertasDeInconsistencia = async (req, res) => {
  console.log("--- INICIANDO ALERTAS DE INCONSISTÊNCIA ---");
  try {
    // const usuarioId = req.usuario?.id; // Pode ser usado se necessário no futuro
    const maquinas = await Maquina.findAll({ where: { ativo: true } });
    const alertas = [];

    // Buscar alertas ignorados globalmente
    const ignorados = await AlertaIgnorado.findAll();
    const ignoradosSet = new Set(ignorados.map((a) => a.alertaId));

    for (const maquina of maquinas) {
      // Busca as duas últimas movimentações da máquina
      const movimentacoes = await Movimentacao.findAll({
        where: { maquinaId: maquina.id },
        order: [["dataColeta", "DESC"]],
        limit: 2,
        attributes: [
          "id",
          "contadorIn",
          "contadorOut",
          "fichas",
          "sairam",
          "dataColeta",
        ],
      });

      // CORREÇÃO APLICADA AQUI:
      // Se não houver pelo menos 2 movimentações, pula esta máquina.
      if (!movimentacoes || movimentacoes.length < 2) {
        continue;
      }

      const atual = movimentacoes[0]; // mais recente
      const anterior = movimentacoes[1];

      // OUT: diferença do campo contadorOut
      const diffOut = (atual.contadorOut || 0) - (anterior.contadorOut || 0);
      const diffIn = (atual.contadorIn || 0) - (anterior.contadorIn || 0);

      const alertaId = `${maquina.id}-${atual.id}`;

      // Pular alertas se a máquina não tem contadores (contador_out é 0 ou null)
      const temContadores =
        atual.contadorOut !== null && atual.contadorOut !== 0;

      // Se a diferença não bate com a quantidade de saída/fichas
      if (
        temContadores &&
        (diffOut !== (atual.sairam || 0) || diffIn !== (atual.fichas || 0)) &&
        !ignoradosSet.has(alertaId)
      ) {
        alertas.push({
          id: alertaId,
          tipo: "inconsistencia_contador",
          maquinaId: maquina.id,
          maquinaNome: maquina.nome,
          contador_out: atual.contadorOut || 0,
          contador_in: atual.contadorIn || 0,
          fichas: atual.fichas,
          sairam: atual.sairam,
          dataMovimentacao: atual.dataColeta,
          mensagem: `Inconsistência detectada: OUT (${diffOut}) esperado ${
            atual.sairam
          }, IN (${diffIn}) esperado ${atual.fichas}.\nOUT registrado: ${
            atual.contadorOut || 0
          } | IN registrado: ${atual.contadorIn || 0} | Fichas: ${
            atual.fichas
          }`,
        });
      }
    }

    res.json({ alertas });
  } catch (error) {
    res.status(500).json({
      error: "Erro ao buscar alertas de movimentação",
      message: error.message,
    });
  }
};

// --- IGNORAR ALERTA ---
export const ignorarAlertaMovimentacao = async (req, res) => {
  try {
    const { id } = req.params; // alertaId
    const usuarioId = req.usuario?.id;
    const { maquinaId } = req.body;
    if (!usuarioId || !maquinaId || !id) {
      return res.status(400).json({ error: "Dados obrigatórios ausentes." });
    }
    await AlertaIgnorado.create({
      alertaId: id,
      maquinaId,
      usuarioId,
    });
    res.json({ success: true });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Erro ao ignorar alerta", message: error.message });
  }
};

// --- BALANÇO SEMANAL ---
export const balançoSemanal = async (req, res) => {
  try {
    const { lojaId, dataInicio, dataFim } = req.query;

    const fim = dataFim ? new Date(dataFim) : new Date();
    const inicio = dataInicio
      ? new Date(dataInicio)
      : new Date(fim.getTime() - 7 * 24 * 60 * 60 * 1000);

    const whereMovimentacao = {
      dataColeta: {
        [Op.between]: [inicio, fim],
      },
    };

    const includeMaquina = {
      model: Maquina,
      as: "maquina",
      attributes: ["id", "codigo", "lojaId"],
      include: [
        {
          model: Loja,
          as: "loja",
          attributes: ["id", "nome"],
        },
      ],
    };

    if (lojaId) {
      includeMaquina.where = { lojaId };
    }

    const movimentacoes = await Movimentacao.findAll({
      where: whereMovimentacao,
      include: [
        includeMaquina,
        {
          model: MovimentacaoProduto,
          as: "detalhesProdutos",
          include: [
            {
              model: Produto,
              as: "produto",
              attributes: ["id", "nome", "categoria"],
            },
          ],
        },
      ],
    });

    const totais = movimentacoes.reduce(
      (acc, mov) => {
        acc.totalFichas += mov.fichas || 0;
        acc.totalFaturamento += parseFloat(mov.valorFaturado || 0);
        acc.totalSairam += mov.sairam || 0;
        acc.totalAbastecidas += mov.abastecidas || 0;
        return acc;
      },
      {
        totalFichas: 0,
        totalFaturamento: 0,
        totalSairam: 0,
        totalAbastecidas: 0,
      },
    );

    totais.mediaFichasPremio =
      totais.totalSairam > 0
        ? (totais.totalFichas / totais.totalSairam).toFixed(2)
        : 0;

    const produtosMap = {};
    movimentacoes.forEach((mov) => {
      mov.detalhesProdutos?.forEach((dp) => {
        const produtoNome = dp.produto?.nome || "Não especificado";
        if (!produtosMap[produtoNome]) {
          produtosMap[produtoNome] = {
            nome: produtoNome,
            quantidadeSaiu: 0,
            quantidadeAbastecida: 0,
          };
        }
        produtosMap[produtoNome].quantidadeSaiu += dp.quantidadeSaiu || 0;
        produtosMap[produtoNome].quantidadeAbastecida +=
          dp.quantidadeAbastecida || 0;
      });
    });

    const distribuicaoProdutos = Object.values(produtosMap)
      .map((p) => ({
        ...p,
        porcentagem:
          totais.totalSairam > 0
            ? ((p.quantidadeSaiu / totais.totalSairam) * 100).toFixed(2)
            : 0,
      }))
      .sort((a, b) => b.quantidadeSaiu - a.quantidadeSaiu);

    const lojasMap = {};
    movimentacoes.forEach((mov) => {
      const lojaNome = mov.maquina?.loja?.nome || "Não especificado";
      if (!lojasMap[lojaNome]) {
        lojasMap[lojaNome] = {
          nome: lojaNome,
          fichas: 0,
          faturamento: 0,
          sairam: 0,
          abastecidas: 0,
        };
      }
      lojasMap[lojaNome].fichas += mov.fichas || 0;
      lojasMap[lojaNome].faturamento += parseFloat(mov.valorFaturado || 0);
      lojasMap[lojaNome].sairam += mov.sairam || 0;
      lojasMap[lojaNome].abastecidas += mov.abastecidas || 0;
    });

    const distribuicaoLojas = Object.values(lojasMap)
      .map((l) => ({
        ...l,
        mediaFichasPremio: l.sairam > 0 ? (l.fichas / l.sairam).toFixed(2) : 0,
      }))
      .sort((a, b) => b.faturamento - a.faturamento);

    res.json({
      periodo: {
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
      },
      totais,
      distribuicaoProdutos,
      distribuicaoLojas,
      totalMovimentacoes: movimentacoes.length,
    });
  } catch (error) {
    console.error("Erro ao gerar balanço semanal:", error);
    res.status(500).json({ error: "Erro ao gerar balanço semanal" });
  }
};

// --- ALERTAS DE ESTOQUE ---
export const alertasEstoque = async (req, res) => {
  try {
    const { lojaId } = req.query;
    const whereMaquina = { ativo: true };

    if (lojaId) {
      whereMaquina.lojaId = lojaId;
    }

    const maquinas = await Maquina.findAll({
      where: whereMaquina,
      include: [
        {
          model: Loja,
          as: "loja",
          attributes: ["id", "nome"],
        },
      ],
    });

    const alertas = [];

    for (const maquina of maquinas) {
      const ultimaMovimentacao = await Movimentacao.findOne({
        where: { maquinaId: maquina.id },
        order: [["dataColeta", "DESC"]],
      });

      const estoqueAtual = ultimaMovimentacao ? ultimaMovimentacao.totalPos : 0;
      const estoqueMinimo =
        (maquina.capacidadePadrao * maquina.percentualAlertaEstoque) / 100;
      const percentualAtual = (estoqueAtual / maquina.capacidadePadrao) * 100;

      if (estoqueAtual < estoqueMinimo) {
        alertas.push({
          maquina: {
            id: maquina.id,
            codigo: maquina.codigo,
            nome: maquina.nome,
            loja: maquina.loja?.nome,
          },
          estoqueAtual,
          capacidadePadrao: maquina.capacidadePadrao,
          estoqueMinimo,
          percentualAtual: percentualAtual.toFixed(2),
          percentualAlerta: maquina.percentualAlertaEstoque,
          nivelAlerta:
            percentualAtual < 10
              ? "CRÍTICO"
              : percentualAtual < 20
                ? "ALTO"
                : "MÉDIO",
          ultimaAtualizacao: ultimaMovimentacao?.dataColeta,
        });
      }
    }

    alertas.sort(
      (a, b) => parseFloat(a.percentualAtual) - parseFloat(b.percentualAtual),
    );

    res.json({
      totalAlertas: alertas.length,
      alertas,
    });
  } catch (error) {
    console.error("Erro ao buscar alertas de estoque:", error);
    res.status(500).json({ error: "Erro ao buscar alertas de estoque" });
  }
};

// --- PERFORMANCE MÁQUINAS ---
export const performanceMaquinas = async (req, res) => {
  try {
    const { lojaId, dataInicio, dataFim } = req.query;

    const fim = dataFim ? new Date(dataFim) : new Date();
    const inicio = dataInicio
      ? new Date(dataInicio)
      : new Date(fim.getTime() - 30 * 24 * 60 * 60 * 1000);

    const whereMovimentacao = {
      dataColeta: {
        [Op.between]: [inicio, fim],
      },
    };

    const whereMaquina = {};
    if (lojaId) {
      whereMaquina.lojaId = lojaId;
    }

    const performance = await Movimentacao.findAll({
      attributes: [
        "maquinaId",
        [fn("COUNT", col("id")), "totalMovimentacoes"],
        [fn("SUM", col("fichas")), "totalFichas"],
        [fn("SUM", col("valorFaturado")), "totalFaturamento"],
        [fn("SUM", col("sairam")), "totalSairam"],
        [fn("AVG", col("mediaFichasPremio")), "mediaFichasPremioGeral"],
      ],
      where: whereMovimentacao,
      include: [
        {
          model: Maquina,
          as: "maquina",
          where: whereMaquina,
          attributes: ["id", "codigo", "nome", "tipo"],
          include: [
            {
              model: Loja,
              as: "loja",
              attributes: ["id", "nome"],
            },
          ],
        },
      ],
      group: ["maquinaId", "maquina.id", "maquina->loja.id"],
      order: [[fn("SUM", col("valorFaturado")), "DESC"]],
    });

    const resultado = performance.map((p) => ({
      maquina: {
        id: p.maquina.id,
        codigo: p.maquina.codigo,
        nome: p.maquina.nome,
        tipo: p.maquina.tipo,
        loja: p.maquina.loja?.nome,
      },
      metricas: {
        totalMovimentacoes: parseInt(p.getDataValue("totalMovimentacoes")),
        totalFichas: parseInt(p.getDataValue("totalFichas") || 0),
        totalFaturamento: parseFloat(p.getDataValue("totalFaturamento") || 0),
        totalSairam: parseInt(p.getDataValue("totalSairam") || 0),
        mediaFichasPremio: parseFloat(
          p.getDataValue("mediaFichasPremioGeral") || 0,
        ).toFixed(2),
      },
    }));

    res.json({
      periodo: {
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
      },
      performance: resultado,
    });
  } catch (error) {
    console.error("Erro ao gerar relatório de performance:", error);
    res.status(500).json({ error: "Erro ao gerar relatório de performance" });
  }
};

// --- RELATÓRIO DE IMPRESSÃO (RESTAURADO E CORRIGIDO) ---
const gerarRelatorioImpressaoPorLoja = async ({
  lojaId,
  dataInicio,
  dataFim,
}) => {
  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);
  fim.setHours(23, 59, 59, 999);

  const loja = await Loja.findByPk(lojaId);
  if (!loja) {
    const erro = new Error("Loja não encontrada");
    erro.status = 404;
    throw erro;
  }

  const registrosDinheiro = await RegistroDinheiro.findAll({
    where: {
      lojaId,
      inicio: { [Op.lte]: fim },
      fim: { [Op.gte]: inicio },
    },
    raw: true,
  });

  const movimentacoes = await Movimentacao.findAll({
    where: {
      dataColeta: {
        [Op.between]: [inicio, fim],
      },
    },
    include: [
      {
        model: Maquina,
        as: "maquina",
        where: { lojaId },
        attributes: ["id", "codigo", "nome"],
      },
      {
        model: MovimentacaoProduto,
        as: "detalhesProdutos",
        include: [
          {
            model: Produto,
            as: "produto",
            attributes: ["id", "nome", "codigo", "emoji", "custoUnitario"],
          },
        ],
      },
    ],
    order: [["dataColeta", "DESC"]],
  });

  let valorTotalLoja = 0;
  let valorDinheiroLoja = 0;
  let valorCartaoPixLoja = 0;
  let gastoTotalPeriodoSalvo = 0;
  registrosDinheiro.forEach((r) => {
    if (r.registrarTotalLoja) {
      valorTotalLoja +=
        parseFloat(r.valorDinheiro || 0) + parseFloat(r.valorCartaoPix || 0);
      valorDinheiroLoja += parseFloat(r.valorDinheiro || 0);
      valorCartaoPixLoja += parseFloat(r.valorCartaoPix || 0);
      gastoTotalPeriodoSalvo += parseFloat(
        r.gastoTotalPeriodo ?? r.gasto_total_periodo ?? 0,
      );
    }
  });

  const valorTotalLojaBruto = Number(valorTotalLoja.toFixed(2));
  const gastoFixoTotalPeriodo = await calcularGastoFixoProporcionalPeriodo(
    lojaId,
    inicio,
    fim,
  );
  const gastoVariavelTotalPeriodo = await calcularGastoVariavelPeriodo(
    lojaId,
    inicio,
    fim,
  );

  const valoresPorMaquina = {};
  registrosDinheiro.forEach((r) => {
    if (!r.registrarTotalLoja && r.maquinaId) {
      if (!valoresPorMaquina[r.maquinaId]) {
        valoresPorMaquina[r.maquinaId] = { dinheiro: 0, cartaoPix: 0 };
      }

      valoresPorMaquina[r.maquinaId].dinheiro += parseFloat(
        r.valorDinheiro || 0,
      );
      valoresPorMaquina[r.maquinaId].cartaoPix += parseFloat(
        r.valorCartaoPix || 0,
      );
    }
  });

  const totalFichas = movimentacoes.reduce(
    (sum, m) => sum + (m.fichas || 0),
    0,
  );
  const totalSairam = movimentacoes.reduce(
    (sum, m) => sum + (m.sairam || 0),
    0,
  );
  const totalAbastecidas = movimentacoes.reduce(
    (sum, m) => sum + (m.abastecidas || 0),
    0,
  );

  const produtosSairamMap = {};
  const produtosEntraramMap = {};
  const dadosPorMaquina = {};

  movimentacoes.forEach((mov) => {
    mov.detalhesProdutos?.forEach((mp) => {
      if (mp.quantidadeSaiu > 0) {
        const key = mp.produtoId;
        if (!produtosSairamMap[key]) {
          produtosSairamMap[key] = { produto: mp.produto, quantidade: 0 };
        }
        produtosSairamMap[key].quantidade += mp.quantidadeSaiu;
      }

      if (mp.quantidadeAbastecida > 0) {
        const key = mp.produtoId;
        if (!produtosEntraramMap[key]) {
          produtosEntraramMap[key] = { produto: mp.produto, quantidade: 0 };
        }
        produtosEntraramMap[key].quantidade += mp.quantidadeAbastecida;
      }
    });

    const maquinaId = mov.maquina.id;
    if (!dadosPorMaquina[maquinaId]) {
      dadosPorMaquina[maquinaId] = {
        maquina: {
          id: mov.maquina.id,
          codigo: mov.maquina.codigo,
          nome: mov.maquina.nome,
        },
        fichas: 0,
        totalSairam: 0,
        totalAbastecidas: 0,
        numMovimentacoes: 0,
        produtosSairam: {},
        produtosEntraram: {},
      };
    }

    dadosPorMaquina[maquinaId].fichas += mov.fichas || 0;
    dadosPorMaquina[maquinaId].totalSairam += mov.sairam || 0;
    dadosPorMaquina[maquinaId].totalAbastecidas += mov.abastecidas || 0;
    dadosPorMaquina[maquinaId].numMovimentacoes += 1;

    mov.detalhesProdutos?.forEach((mp) => {
      if (mp.quantidadeSaiu > 0) {
        const key = mp.produtoId;
        if (!dadosPorMaquina[maquinaId].produtosSairam[key]) {
          dadosPorMaquina[maquinaId].produtosSairam[key] = {
            produto: mp.produto,
            quantidade: 0,
          };
        }
        dadosPorMaquina[maquinaId].produtosSairam[key].quantidade +=
          mp.quantidadeSaiu;
      }

      if (mp.quantidadeAbastecida > 0) {
        const key = mp.produtoId;
        if (!dadosPorMaquina[maquinaId].produtosEntraram[key]) {
          dadosPorMaquina[maquinaId].produtosEntraram[key] = {
            produto: mp.produto,
            quantidade: 0,
          };
        }
        dadosPorMaquina[maquinaId].produtosEntraram[key].quantidade +=
          mp.quantidadeAbastecida;
      }
    });
  });

  const produtosSairam = Object.values(produtosSairamMap).sort(
    (a, b) => b.quantidade - a.quantidade,
  );

  const produtosEntraram = Object.values(produtosEntraramMap).sort(
    (a, b) => b.quantidade - a.quantidade,
  );

  const maquinasDetalhadas = Object.values(dadosPorMaquina).map((m) => {
    let custoProdutosSairam = 0;
    const produtosSairamDetalhados = Object.values(m.produtosSairam)
      .map((p) => {
        let custoUnitario = 0;
        if (p.produto.custoUnitario && Number(p.produto.custoUnitario) > 0) {
          custoUnitario = Number(p.produto.custoUnitario);
        } else if (p.produto.preco && Number(p.produto.preco) > 0) {
          custoUnitario = Number(p.produto.preco);
        }
        const custoTotal = custoUnitario * p.quantidade;
        custoProdutosSairam += custoTotal;
        return {
          id: p.produto.id,
          nome: p.produto.nome,
          codigo: p.produto.codigo,
          emoji: p.produto.emoji,
          quantidade: p.quantidade,
          custoUnitario,
          custoTotal,
        };
      })
      .sort((a, b) => b.quantidade - a.quantidade);

    const produtosEntraramDetalhados = Object.values(m.produtosEntraram)
      .map((p) => ({
        id: p.produto.id,
        nome: p.produto.nome,
        codigo: p.produto.codigo,
        emoji: p.produto.emoji,
        quantidade: p.quantidade,
      }))
      .sort((a, b) => b.quantidade - a.quantidade);

    const valorFicha = m.maquina.valorFicha
      ? Number(m.maquina.valorFicha)
      : 2.5;
    const lucroBruto =
      (valoresPorMaquina[m.maquina.id]?.dinheiro || 0) +
      (valoresPorMaquina[m.maquina.id]?.cartaoPix || 0) +
      (m.fichas || 0) * valorFicha;
    const lucroLiquido = lucroBruto - custoProdutosSairam;

    return {
      maquina: m.maquina,
      totais: {
        fichas: m.fichas,
        produtosSairam: m.totalSairam,
        produtosEntraram: m.totalAbastecidas,
        movimentacoes: m.numMovimentacoes,
        dinheiro: valoresPorMaquina[m.maquina.id]?.dinheiro || 0,
        cartaoPix: valoresPorMaquina[m.maquina.id]?.cartaoPix || 0,
        custoProdutosSairam,
        lucroLiquido,
      },
      produtosSairam: produtosSairamDetalhados,
      produtosEntraram: produtosEntraramDetalhados,
    };
  });

  const gastoProdutosTotalPeriodo = Number(
    maquinasDetalhadas
      .reduce((acc, m) => acc + Number(m.totais?.custoProdutosSairam || 0), 0)
      .toFixed(2),
  );

  const gastoTotalPeriodo = Number(gastoTotalPeriodoSalvo.toFixed(2));
  const valorTotalLojaLiquido = Number(
    (valorTotalLojaBruto - gastoTotalPeriodo).toFixed(2),
  );

  let valorMedioFicha = 2.5;
  if (Object.values(dadosPorMaquina).length > 0) {
    const somaValorFicha = Object.values(dadosPorMaquina).reduce((acc, m) => {
      const v = m.maquina.valorFicha ? Number(m.maquina.valorFicha) : 2.5;
      return acc + v;
    }, 0);
    valorMedioFicha = somaValorFicha / Object.values(dadosPorMaquina).length;
  }

  const valorFichasReais = totalFichas * valorMedioFicha;
  const valorTotal = valorTotalLojaBruto;
  const diferenca = valorFichasReais - valorTotal;
  let avisoFichas = null;

  if (Math.abs(diferenca) > 0.01) {
    avisoFichas = `Atenção: diferença entre valor das fichas em reais (R$ ${valorFichasReais.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}) e valor total da loja (R$ ${valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}). Diferença: R$ ${diferenca.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  }

  const graficoSaidaPorMaquina = maquinasDetalhadas.map((m) => ({
    maquina: m.maquina.nome,
    produtosSairam: m.totais.produtosSairam,
  }));

  const graficoSaidaPorProduto = produtosSairam.map((p) => ({
    produto: p.produto.nome,
    quantidade: p.quantidade,
  }));

  return {
    loja: {
      id: loja.id,
      nome: loja.nome,
      endereco: loja.endereco,
    },
    periodo: {
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
    },
    totais: {
      fichas: totalFichas,
      produtosSairam: totalSairam,
      produtosEntraram: totalAbastecidas,
      movimentacoes: movimentacoes.length,
      valorTotalLoja: valorTotalLojaLiquido,
      valorTotalLojaBruto,
      valorTotalLojaLiquido,
      gastoFixoTotalPeriodo,
      gastoVariavelTotalPeriodo,
      gastoProdutosTotalPeriodo,
      gastoTotalPeriodo,
      valorDinheiroLoja,
      valorCartaoPixLoja,
    },
    produtosSairam: produtosSairam.map((p) => ({
      id: p.produto.id,
      nome: p.produto.nome,
      codigo: p.produto.codigo,
      emoji: p.produto.emoji,
      quantidade: p.quantidade,
    })),
    produtosEntraram: produtosEntraram.map((p) => ({
      id: p.produto.id,
      nome: p.produto.nome,
      codigo: p.produto.codigo,
      emoji: p.produto.emoji,
      quantidade: p.quantidade,
    })),
    maquinas: maquinasDetalhadas,
    graficoSaidaPorMaquina,
    graficoSaidaPorProduto,
    avisoFichas,
  };
};

export const relatorioImpressao = async (req, res) => {
  try {
    const { lojaId, dataInicio, dataFim } = req.query;

    if (!lojaId) {
      return res.status(400).json({ error: "lojaId é obrigatório" });
    }

    if (!dataInicio || !dataFim) {
      return res
        .status(400)
        .json({ error: "dataInicio e dataFim são obrigatórios" });
    }

    const relatorio = await gerarRelatorioImpressaoPorLoja({
      lojaId,
      dataInicio,
      dataFim,
    });

    return res.json(relatorio);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error("Erro ao gerar relatório de impressão:", error);
    return res.status(500).json({
      error: "Erro ao gerar relatório de impressão",
      message:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const relatorioTodasLojas = async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;

    if (!dataInicio || !dataFim) {
      return res
        .status(400)
        .json({ error: "dataInicio e dataFim são obrigatórios" });
    }

    const lojas = await Loja.findAll({ where: { ativo: true }, raw: true });

    const respostas = await Promise.allSettled(
      lojas.map((loja) =>
        gerarRelatorioImpressaoPorLoja({
          lojaId: loja.id,
          dataInicio,
          dataFim,
        }),
      ),
    );

    const relatoriosPorLoja = respostas
      .map((resposta, index) => {
        if (resposta.status !== "fulfilled") return null;
        return {
          loja: lojas[index],
          dados: resposta.value,
        };
      })
      .filter(Boolean);

    if (!relatoriosPorLoja.length) {
      return res.status(404).json({
        error:
          "Não foi possível gerar o relatório consolidado para o período selecionado.",
      });
    }

    const lojasSemDados = respostas
      .map((resposta, index) => {
        if (resposta.status === "fulfilled") return null;
        return lojas[index]?.nome || `Loja ${index + 1}`;
      })
      .filter(Boolean);

    const produtosMap = new Map();

    const rankingLojas = relatoriosPorLoja.map(({ loja, dados }) => {
      const totais = dados?.totais || {};
      const lucroBruto = Number(
        totais.valorTotalLojaBruto ??
          Number(totais.valorDinheiroLoja || 0) +
            Number(totais.valorCartaoPixLoja || 0),
      );
      const custoTotal = Number(totais.gastoTotalPeriodo || 0);
      const custoVariavel = Number(totais.gastoVariavelTotalPeriodo || 0);
      const custoProdutos = Number(totais.gastoProdutosTotalPeriodo || 0);
      const custoFixo = Number(totais.gastoFixoTotalPeriodo || 0);
      const dinheiro = Number(totais.valorDinheiroLoja || 0);
      const cartaoPix = Number(totais.valorCartaoPixLoja || 0);
      const lucroLiquido = lucroBruto - custoTotal;

      (dados?.produtosSairam || []).forEach((produto) => {
        const id = String(produto.id ?? produto.codigo ?? produto.nome);
        const existente = produtosMap.get(id);
        const quantidade = Number(produto.quantidade || 0);

        if (!existente) {
          produtosMap.set(id, {
            id,
            nome: produto.nome || "Produto",
            codigo: produto.codigo || "S/C",
            emoji: produto.emoji || "📦",
            quantidade,
          });
          return;
        }

        existente.quantidade += quantidade;
      });

      return {
        lojaId: loja?.id,
        lojaNome: dados?.loja?.nome || loja?.nome || "Loja",
        lucroBruto,
        custoTotal,
        custoVariavel,
        custoProdutos,
        custoFixo,
        lucroLiquido,
        dinheiro,
        cartaoPix,
      };
    });

    const totais = rankingLojas.reduce(
      (acc, loja) => {
        acc.lucroBrutoTotal += loja.lucroBruto;
        acc.lucroLiquidoTotal += loja.lucroLiquido;
        acc.custoTotal += loja.custoTotal;
        acc.custoVariavelTotal += loja.custoVariavel;
        acc.custoProdutosTotal += loja.custoProdutos;
        acc.custoFixoTotal += loja.custoFixo;
        acc.dinheiroTotal += loja.dinheiro;
        acc.cartaoPixTotal += loja.cartaoPix;
        return acc;
      },
      {
        lucroBrutoTotal: 0,
        lucroLiquidoTotal: 0,
        custoTotal: 0,
        custoVariavelTotal: 0,
        custoProdutosTotal: 0,
        custoFixoTotal: 0,
        dinheiroTotal: 0,
        cartaoPixTotal: 0,
      },
    );

    const totalRecebimentos = totais.dinheiroTotal + totais.cartaoPixTotal;

    const rankingLojasComParticipacao = rankingLojas.map((loja) => ({
      ...loja,
      participacaoLucroBruto:
        totais.lucroBrutoTotal > 0
          ? (loja.lucroBruto / totais.lucroBrutoTotal) * 100
          : 0,
    }));

    const rankingProdutos = Array.from(produtosMap.values())
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 15);

    const rankingLucroLojas = [...rankingLojasComParticipacao]
      .sort((a, b) => b.lucroBruto - a.lucroBruto)
      .slice(0, 10);

    const rankingGastoLojas = [...rankingLojasComParticipacao]
      .sort((a, b) => b.custoTotal - a.custoTotal)
      .slice(0, 10);

    const participacaoLojas = [...rankingLojasComParticipacao]
      .sort((a, b) => b.participacaoLucroBruto - a.participacaoLucroBruto)
      .slice(0, 10);

    return res.json({
      tipo: "todas-lojas",
      periodo: {
        inicio: dataInicio,
        fim: dataFim,
      },
      totais,
      destaques: {
        lojaMaiorLucro: rankingLucroLojas[0] || null,
        lojaMaiorGasto: rankingGastoLojas[0] || null,
        lojaMaiorParticipacao: participacaoLojas[0] || null,
        produtoMaisSaiu: rankingProdutos[0] || null,
      },
      graficos: {
        rankingLucroLojas,
        rankingGastoLojas,
        participacaoLojas,
        rankingProdutos,
        pagamento: [
          {
            metodo: "Dinheiro",
            valor: totais.dinheiroTotal,
            percentual:
              totalRecebimentos > 0
                ? (totais.dinheiroTotal / totalRecebimentos) * 100
                : 0,
          },
          {
            metodo: "Cartão / Pix",
            valor: totais.cartaoPixTotal,
            percentual:
              totalRecebimentos > 0
                ? (totais.cartaoPixTotal / totalRecebimentos) * 100
                : 0,
          },
        ],
      },
      lojasSemDados,
      lojasComDados: relatoriosPorLoja.length,
    });
  } catch (error) {
    console.error("Erro ao gerar relatório consolidado de lojas:", error);
    return res.status(500).json({
      error: "Erro ao gerar relatório consolidado de lojas",
      message:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// --- ALERTAS DE MOVIMENTAÇÃO OUT ---
export const alertasMovimentacaoOut = async (req, res) => {
  try {
    const maquinas = await Maquina.findAll({
      where: { ativo: true },
      include: [{ model: Loja, as: "loja", attributes: ["nome"] }],
    });
    const alertas = [];
    const ignorados = await AlertaIgnorado.findAll();
    const ignoradosSet = new Set(ignorados.map((a) => a.alertaId));
    for (const maquina of maquinas) {
      const movimentacoes = await Movimentacao.findAll({
        where: { maquinaId: maquina.id },
        order: [["dataColeta", "DESC"]],
        limit: 2,
        attributes: [
          "id",
          "contadorOut",
          "contadorIn",
          "fichas",
          "sairam",
          "dataColeta",
        ],
      });
      if (!movimentacoes || movimentacoes.length < 2) continue;
      const atual = movimentacoes[0];
      const anterior = movimentacoes[1];
      const diffOut = (atual.contadorOut || 0) - (anterior.contadorOut || 0);
      const alertaId = `${maquina.id}-${atual.id}`;
      if (
        atual.contadorOut !== null &&
        atual.contadorOut !== 0 &&
        diffOut !== (atual.sairam || 0) &&
        !ignoradosSet.has(alertaId)
      ) {
        const referencia = anterior.contadorOut || 0;
        const inserido = atual.contadorOut || 0;
        const saidaCalculada = atual.sairam ?? 0;
        const diferenca = inserido - referencia - saidaCalculada;
        alertas.push({
          id: alertaId,
          tipo: "movimentacao_out",
          maquinaId: maquina.id,
          maquinaNome: maquina.nome,
          lojaNome: maquina.loja?.nome || maquina.lojaNome || null,
          contador_out: inserido,
          contador_out_anterior: referencia,
          sairam: saidaCalculada,
          dataMovimentacao: atual.dataColeta,
        });
      }
    }
    res.json({ alertas });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Erro ao buscar alertas OUT", message: error.message });
  }
};

// --- ALERTAS DE MOVIMENTAÇÃO IN ---
export const alertasMovimentacaoIn = async (req, res) => {
  try {
    const maquinas = await Maquina.findAll({
      where: { ativo: true },
      include: [{ model: Loja, as: "loja", attributes: ["nome"] }],
    });
    const alertas = [];
    const ignorados = await AlertaIgnorado.findAll();
    const ignoradosSet = new Set(ignorados.map((a) => a.alertaId));
    for (const maquina of maquinas) {
      const movimentacoes = await Movimentacao.findAll({
        where: { maquinaId: maquina.id },
        order: [["dataColeta", "DESC"]],
        limit: 2,
        attributes: [
          "id",
          "contadorOut",
          "contadorIn",
          "fichas",
          "sairam",
          "dataColeta",
        ],
      });
      if (!movimentacoes || movimentacoes.length < 2) continue;
      const atual = movimentacoes[0];
      const anterior = movimentacoes[1];
      const diffIn = (atual.contadorIn || 0) - (anterior.contadorIn || 0);
      const alertaId = `${maquina.id}-${atual.id}`;
      if (
        atual.contadorIn !== null &&
        atual.contadorIn !== 0 &&
        diffIn !== (atual.fichas || 0) &&
        !ignoradosSet.has(alertaId)
      ) {
        alertas.push({
          id: alertaId,
          tipo: "movimentacao_in",
          maquinaId: maquina.id,
          maquinaNome: maquina.nome,
          lojaNome: maquina.loja?.nome || maquina.lojaNome || null,
          contador_in: atual.contadorIn || 0,
          contador_in_anterior: anterior.contadorIn || 0,
          fichas: atual.fichas,
          dataMovimentacao: atual.dataColeta,
        });
      }
    }
    res.json({ alertas });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Erro ao buscar alertas IN", message: error.message });
  }
};
