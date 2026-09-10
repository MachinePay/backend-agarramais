import {
  CAMPOS_PRODUTO,
  CATALOGO_CAIXAS,
  calcularPedido,
  precisaAnaliseIA,
} from "../services/pedidoCalculoEngine.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MODELO_CALCULADORA =
  process.env.OPENAI_MODEL_CALCULADORA ||
  process.env.OPENAI_MODEL ||
  "gpt-4.1-mini";

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

const normalizarProdutosPersonalizados = (lista) => {
  if (!Array.isArray(lista)) return [];

  return lista
    .map((item) => ({
      nome: String(item?.nome || "").trim(),
      quantidade: Number(item?.quantidade) || 0,
      pesoUnitario: item?.pesoUnitario ? Number(item.pesoUnitario) : null,
      altura: item?.altura ? Number(item.altura) : null,
      largura: item?.largura ? Number(item.largura) : null,
      comprimento: item?.comprimento ? Number(item.comprimento) : null,
    }))
    .filter((item) => item.nome && item.quantidade > 0);
};

const somarPesoProdutosPersonalizados = (produtosPersonalizados) =>
  produtosPersonalizados.reduce((soma, item) => {
    if (!item.pesoUnitario) return soma;
    return soma + item.pesoUnitario * item.quantidade;
  }, 0);

export const calcular = (req, res) => {
  try {
    const { quantidades, produtosPersonalizados } = req.body;

    const resultadoEngine = calcularPedido(quantidades);
    const produtosCustom = normalizarProdutosPersonalizados(
      produtosPersonalizados,
    );
    const pesoProdutosCustom = somarPesoProdutosPersonalizados(produtosCustom);

    return res.json({
      quantidades: resultadoEngine.quantidades,
      nfTotal: resultadoEngine.nfTotal,
      pesoTotal: resultadoEngine.pesoTotal + pesoProdutosCustom,
      pesoEngine: resultadoEngine.pesoTotal,
      pesoProdutosPersonalizados: pesoProdutosCustom,
      caixaLegado: resultadoEngine.caixaLegado,
      produtosPersonalizados: produtosCustom,
      precisaAnaliseIA: precisaAnaliseIA(
        resultadoEngine.caixaLegado,
        produtosCustom,
      ),
    });
  } catch (error) {
    console.error("Erro ao calcular pedido:", error);
    return res
      .status(500)
      .json({ error: "Erro ao calcular pedido" });
  }
};

const schemaAnaliseCaixas = {
  type: "object",
  additionalProperties: false,
  required: ["caixasSugeridas", "resumo"],
  properties: {
    caixasSugeridas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dimensoes", "tipo", "itensAlocados", "justificativa"],
        properties: {
          dimensoes: {
            type: "string",
            description: "Formato AxLxC em cm, ex: 40x40x40",
          },
          tipo: { type: "string", enum: ["padrao", "nova"] },
          itensAlocados: { type: "string" },
          justificativa: { type: "string" },
        },
      },
    },
    resumo: { type: "string" },
  },
};

const chamarOpenAIParaAnalisarCaixas = async ({
  quantidades,
  produtosPersonalizados,
  caixaLegado,
  pesoTotal,
}) => {
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

  const listaQuantidadesConhecidas = CAMPOS_PRODUTO.filter(
    ({ chave }) => quantidades[chave] > 0,
  )
    .map(({ chave, label }) => `- ${label}: ${quantidades[chave]} unidades`)
    .join("\n");

  const listaProdutosPersonalizados = produtosPersonalizados.length
    ? produtosPersonalizados
        .map((item) => {
          const dimensao =
            item.altura && item.largura && item.comprimento
              ? `${item.altura}x${item.largura}x${item.comprimento} cm (AxLxC) por unidade`
              : "dimensoes nao informadas";
          const pesoTexto = item.pesoUnitario
            ? `${item.pesoUnitario} kg por unidade`
            : "peso nao informado";
          return `- ${item.nome}: ${item.quantidade} unidades, ${dimensao}, ${pesoTexto}`;
        })
        .join("\n")
    : "Nenhum produto personalizado informado.";

  const listaCatalogoCaixas = CATALOGO_CAIXAS.map(
    (caixa) =>
      `- ${caixa.nome} (Altura x Largura x Comprimento em cm, volume interno ~${caixa.volumeLitros.toFixed(1)} litros)`,
  ).join("\n");

  const pedido = [
    `Resultado do motor de regras interno (baseado no catalogo conhecido) para os itens de catalogo: "${caixaLegado}".`,
    `Peso total estimado do pedido: ${pesoTotal.toFixed(2)} kg.`,
    "",
    "Itens de catalogo conhecido presentes no pedido:",
    listaQuantidadesConhecidas || "Nenhum item de catalogo conhecido.",
    "",
    "Produtos personalizados (fora do catalogo conhecido, informados manualmente pelo usuario):",
    listaProdutosPersonalizados,
  ].join("\n");

  const resposta = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO_CALCULADORA,
      instructions: [
        "Voce e um especialista em logistica e embalagem de pedidos para uma empresa de maquinas de pelucia/capsula (Agarra Mais / Gira Kids).",
        "O motor de regras interno da empresa ja tentou classificar o pedido usando faixas de quantidade conhecidas, mas nao conseguiu decidir com confianca (resultado 'Personalizada') e/ou existem produtos fora do catalogo conhecido que precisam da sua analise.",
        "Seu trabalho e sugerir a(s) melhor(es) caixa(s) de papelao para esse pedido, preferindo sempre reaproveitar uma das caixas do catalogo padrao da empresa quando ela comportar os itens (por volume E por dimensao - o maior lado de um item individual deve caber dentro do menor lado util da caixa escolhida).",
        `Catalogo de caixas padrao ja usadas pela empresa:\n${listaCatalogoCaixas}`,
        "Quando nenhuma caixa do catalogo comportar tudo, proponha dividir em mais de uma caixa do catalogo (explique a divisao no campo itensAlocados) antes de propor uma caixa nova.",
        "So proponha uma caixa 'nova' (tipo=nova) quando nenhuma combinacao das caixas padrao for razoavel; nesse caso, sugira dimensoes no formato AxLxC em cm que comportem os itens com folga pequena.",
        "Sempre leve em conta as dimensoes AxLxC dos produtos personalizados informados (nao so o peso) para decidir se cabem em pe, deitados etc dentro da caixa.",
        "Se um produto personalizado nao tiver dimensoes informadas, assuma que ele e pequeno/medio (parecido com uma pelucia media) e mencione essa suposicao na justificativa.",
        "Responda sempre em portugues, de forma objetiva.",
        "Retorne apenas o JSON estruturado conforme o schema, sem texto adicional.",
      ].join("\n"),
      input: pedido,
      text: {
        format: {
          type: "json_schema",
          name: "analise_caixas_pedido",
          strict: true,
          schema: schemaAnaliseCaixas,
        },
      },
      max_output_tokens: 1500,
    }),
  });

  const payload = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    const mensagem =
      payload?.error?.message || "Falha ao analisar caixas com a IA";
    const erro = new Error(mensagem);
    erro.status = resposta.status;
    throw erro;
  }

  const textoJson = extrairTextoResposta(payload);
  if (!textoJson) {
    const erro = new Error("A IA nao retornou um resultado valido");
    erro.status = 502;
    throw erro;
  }

  return JSON.parse(textoJson);
};

export const analisarComIA = async (req, res) => {
  try {
    const { quantidades, produtosPersonalizados, caixaLegado, pesoTotal } =
      req.body;

    if (!caixaLegado || typeof pesoTotal !== "number") {
      return res.status(400).json({
        error: "Envie caixaLegado e pesoTotal calculados previamente",
      });
    }

    const resultadoEngine = calcularPedido(quantidades);
    const produtosCustom = normalizarProdutosPersonalizados(
      produtosPersonalizados,
    );

    const analise = await chamarOpenAIParaAnalisarCaixas({
      quantidades: resultadoEngine.quantidades,
      produtosPersonalizados: produtosCustom,
      caixaLegado,
      pesoTotal,
    });

    return res.json(analise);
  } catch (error) {
    console.error("Erro ao analisar caixas com IA:", error);
    return res
      .status(error.status || 500)
      .json({ error: error.message || "Erro ao analisar caixas com IA" });
  }
};
