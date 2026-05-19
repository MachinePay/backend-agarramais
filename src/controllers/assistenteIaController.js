import { Op } from "sequelize";
import { Loja, EstoqueLoja, Produto } from "../models/index.js";
import { gerarRelatorioImpressaoPorLoja } from "./relatorioController.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MODELO_PADRAO = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const TODAS_AS_LOJAS = "__TODAS_AS_LOJAS__";

const normalizar = (valor) =>
  String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const formatarMoeda = (valor) =>
  Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const hojeIso = () => new Date().toISOString().slice(0, 10);

const extrairTextoResposta = (resposta) => {
  if (typeof resposta?.output_text === "string") return resposta.output_text;

  const textos = [];
  for (const item of resposta?.output || []) {
    for (const conteudo of item?.content || []) {
      if (conteudo?.type === "output_text" && conteudo?.text) {
        textos.push(conteudo.text);
      }
    }
  }

  return textos.join("\n").trim();
};

const schemaComandoVoz = {
  type: "object",
  additionalProperties: false,
  required: [
    "intent",
    "lojaId",
    "lojaNome",
    "periodo",
    "respostaCurta",
    "precisaConfirmacao",
    "camposFaltantes",
  ],
  properties: {
    intent: {
      type: "string",
      enum: [
        "CONSULTAR_ESTOQUE",
        "GERAR_RELATORIO_LOJA",
        "ABRIR_MOVIMENTACOES",
        "AJUDA",
        "DESCONHECIDO",
      ],
    },
    lojaId: { type: ["string", "null"] },
    lojaNome: { type: ["string", "null"] },
    periodo: {
      type: "object",
      additionalProperties: false,
      required: ["dataInicio", "dataFim", "descricao"],
      properties: {
        dataInicio: { type: ["string", "null"] },
        dataFim: { type: ["string", "null"] },
        descricao: { type: ["string", "null"] },
      },
    },
    respostaCurta: { type: "string" },
    precisaConfirmacao: { type: "boolean" },
    camposFaltantes: {
      type: "array",
      items: { type: "string" },
    },
  },
};

const chamarOpenAIParaInterpretar = async ({ texto, lojas }) => {
  if (!process.env.OPENAI_API_KEY) {
    const erro = new Error("OPENAI_API_KEY nao configurada no backend");
    erro.status = 500;
    throw erro;
  }

  if (typeof fetch !== "function") {
    const erro = new Error(
      "fetch nativo indisponivel. Execute o backend em Node.js 18 ou superior.",
    );
    erro.status = 500;
    throw erro;
  }

  const listaLojas = lojas
    .map((loja) => `- ${loja.nome} | id: ${loja.id}`)
    .join("\n");

  const resposta = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO_PADRAO,
      instructions: [
        "Voce interpreta comandos de voz em portugues para um dashboard operacional.",
        "Retorne apenas JSON estruturado conforme o schema.",
        "Use as lojas disponiveis para resolver lojaId quando o nome bater ou for muito parecido.",
        "Se o usuario pedir estoque de cada loja, todas as lojas ou geral, use lojaId \"__TODAS_AS_LOJAS__\".",
        "Para relatorio de loja, dataInicio e dataFim devem estar em YYYY-MM-DD.",
        `A data de hoje e ${hojeIso()}.`,
        "Se faltar loja ou periodo para relatorio, marque precisaConfirmacao e liste camposFaltantes.",
        "Abrir aba de movimentacoes deve ser intent ABRIR_MOVIMENTACOES.",
        `Lojas disponiveis:\n${listaLojas || "- nenhuma loja cadastrada"}`,
      ].join("\n"),
      input: texto,
      text: {
        format: {
          type: "json_schema",
          name: "comando_dashboard",
          strict: true,
          schema: schemaComandoVoz,
        },
      },
      max_output_tokens: 700,
    }),
  });

  const payload = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    const mensagem =
      payload?.error?.message || "Falha ao interpretar comando com OpenAI";
    const erro = new Error(mensagem);
    erro.status = resposta.status;
    throw erro;
  }

  const textoJson = extrairTextoResposta(payload);
  if (!textoJson) {
    const erro = new Error("OpenAI nao retornou uma interpretacao valida");
    erro.status = 502;
    throw erro;
  }

  return JSON.parse(textoJson);
};

const buscarLojasAtivas = () =>
  Loja.findAll({
    where: { ativo: true },
    attributes: ["id", "nome", "cidade", "estado", "endereco"],
    order: [["nome", "ASC"]],
    raw: true,
  });

const resolverLoja = (interpretacao, lojas) => {
  if (interpretacao.lojaId === TODAS_AS_LOJAS) return TODAS_AS_LOJAS;

  const lojaPorId = lojas.find((loja) => loja.id === interpretacao.lojaId);
  if (lojaPorId) return lojaPorId;

  const alvo = normalizar(interpretacao.lojaNome);
  if (!alvo) return null;

  return (
    lojas.find((loja) => normalizar(loja.nome) === alvo) ||
    lojas.find((loja) => normalizar(loja.nome).includes(alvo)) ||
    lojas.find((loja) => alvo.includes(normalizar(loja.nome))) ||
    null
  );
};

const montarResumoEstoque = (estoques, lojas) => {
  const porLoja = new Map(
    lojas.map((loja) => [
      loja.id,
      {
        loja,
        produtos: [],
        totalItens: 0,
        produtosBaixoEstoque: 0,
      },
    ]),
  );

  for (const item of estoques) {
    const grupo = porLoja.get(item.lojaId);
    if (!grupo) continue;

    const quantidade = Number(item.quantidade || 0);
    const minimo = Number(item.estoqueMinimo || item.produto?.estoqueMinimo || 0);
    const produto = {
      id: item.produto?.id,
      nome: item.produto?.nome || "Produto",
      codigo: item.produto?.codigo || null,
      quantidade,
      estoqueMinimo: minimo,
      baixoEstoque: quantidade <= minimo,
    };

    grupo.produtos.push(produto);
    grupo.totalItens += quantidade;
    if (produto.baixoEstoque) grupo.produtosBaixoEstoque += 1;
  }

  return Array.from(porLoja.values()).map((grupo) => ({
    loja: grupo.loja,
    totalItens: grupo.totalItens,
    produtosBaixoEstoque: grupo.produtosBaixoEstoque,
    produtos: grupo.produtos.sort((a, b) => a.nome.localeCompare(b.nome)),
  }));
};

const executarConsultaEstoque = async ({ lojaResolvida, lojas }) => {
  const lojasConsultadas =
    lojaResolvida === TODAS_AS_LOJAS ? lojas : [lojaResolvida].filter(Boolean);

  if (!lojasConsultadas.length) {
    return {
      status: "precisa_confirmacao",
      mensagem: "Qual loja voce quer consultar?",
      camposFaltantes: ["loja"],
    };
  }

  const estoques = await EstoqueLoja.findAll({
    where: {
      ativo: true,
      lojaId: { [Op.in]: lojasConsultadas.map((loja) => loja.id) },
    },
    include: [
      {
        model: Produto,
        as: "produto",
        attributes: ["id", "nome", "codigo", "emoji", "estoqueMinimo"],
      },
    ],
    order: [[{ model: Produto, as: "produto" }, "nome", "ASC"]],
  });

  const resumo = montarResumoEstoque(estoques, lojasConsultadas);
  const totalGeral = resumo.reduce((acc, loja) => acc + loja.totalItens, 0);
  const texto =
    resumo.length === 1
      ? `${resumo[0].loja.nome} tem ${resumo[0].totalItens} itens em estoque.`
      : `As ${resumo.length} lojas consultadas somam ${totalGeral} itens em estoque.`;

  return {
    status: "executado",
    tipo: "estoque",
    mensagem: texto,
    dados: { lojas: resumo, totalGeral },
  };
};

const montarResumoRelatorio = (relatorio) => {
  const totais = relatorio?.totais || {};
  const loja = relatorio?.loja?.nome || "Loja";

  return [
    `${loja}: ${Number(totais.fichas || 0)} fichas e ${Number(totais.produtosSairam || 0)} produtos sairam no periodo.`,
    `Bruto consolidado: ${formatarMoeda(totais.valorBrutoConsolidadoLojaMaquinas)}. Liquido consolidado: ${formatarMoeda(totais.valorLiquidoConsolidadoLojaMaquinas)}.`,
    `Gasto total do periodo: ${formatarMoeda(totais.gastoTotalPeriodo)}.`,
  ].join(" ");
};

const executarRelatorioLoja = async ({ interpretacao, lojaResolvida }) => {
  if (!lojaResolvida || lojaResolvida === TODAS_AS_LOJAS) {
    return {
      status: "precisa_confirmacao",
      mensagem: "De qual loja voce quer gerar o relatorio?",
      camposFaltantes: ["loja"],
    };
  }

  const { dataInicio, dataFim } = interpretacao.periodo || {};
  if (!dataInicio || !dataFim) {
    return {
      status: "precisa_confirmacao",
      mensagem: "Qual periodo devo usar para gerar o relatorio?",
      camposFaltantes: ["periodo"],
    };
  }

  const relatorio = await gerarRelatorioImpressaoPorLoja({
    lojaId: lojaResolvida.id,
    dataInicio,
    dataFim,
  });

  return {
    status: "executado",
    tipo: "relatorio-loja",
    mensagem: montarResumoRelatorio(relatorio),
    dados: relatorio,
  };
};

export const processarComandoAssistenteIa = async (req, res) => {
  try {
    const texto = String(req.body?.texto || req.body?.transcricao || "").trim();

    if (!texto) {
      return res.status(400).json({ error: "texto e obrigatorio" });
    }

    const lojas = await buscarLojasAtivas();
    const interpretacao = await chamarOpenAIParaInterpretar({ texto, lojas });
    const lojaResolvida = resolverLoja(interpretacao, lojas);

    let resultado;
    if (interpretacao.intent === "CONSULTAR_ESTOQUE") {
      resultado = await executarConsultaEstoque({ lojaResolvida, lojas });
    } else if (interpretacao.intent === "GERAR_RELATORIO_LOJA") {
      resultado = await executarRelatorioLoja({ interpretacao, lojaResolvida });
    } else if (interpretacao.intent === "ABRIR_MOVIMENTACOES") {
      resultado = {
        status: "executado",
        tipo: "navegacao",
        mensagem: "Abrindo a aba de movimentacoes.",
        acao: { tipo: "navegar", rota: "/movimentacoes" },
      };
    } else {
      resultado = {
        status: "nao_entendido",
        mensagem:
          interpretacao.respostaCurta ||
          "Nao entendi o comando. Posso consultar estoque, abrir movimentacoes ou gerar relatorio de uma loja por periodo.",
      };
    }

    return res.json({
      transcricao: texto,
      interpretacao,
      lojaResolvida:
        lojaResolvida && lojaResolvida !== TODAS_AS_LOJAS ? lojaResolvida : null,
      resultado,
    });
  } catch (error) {
    console.error("Erro no assistente de IA:", error);
    return res.status(error.status || 500).json({
      error: "Erro ao processar comando do assistente",
      message: error.message,
    });
  }
};
