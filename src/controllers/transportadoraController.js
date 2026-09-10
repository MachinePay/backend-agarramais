const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MODELO_BUSCA_TRANSPORTADORAS =
  process.env.OPENAI_MODEL_TRANSPORTADORAS ||
  process.env.OPENAI_MODEL ||
  "gpt-4.1-mini";

const ORIGEM_PADRAO = "São Paulo (SP), Brasil";

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

const schemaBuscaTransportadoras = {
  type: "object",
  additionalProperties: false,
  required: ["transportadoras", "resumo"],
  properties: {
    transportadoras: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "nome",
          "telefone",
          "whatsapp",
          "cidadeBase",
          "motivoRelevancia",
          "fonte",
        ],
        properties: {
          nome: { type: "string" },
          telefone: { type: ["string", "null"] },
          whatsapp: { type: ["string", "null"] },
          cidadeBase: { type: ["string", "null"] },
          motivoRelevancia: { type: "string" },
          fonte: { type: ["string", "null"] },
        },
      },
    },
    resumo: { type: "string" },
  },
};

const chamarOpenAIParaBuscarTransportadoras = async ({
  estadoDestino,
  cidadeDestino,
  peso,
  dimensoes,
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

  const detalhesCarga = [];
  if (peso) detalhesCarga.push(`Peso aproximado da carga: ${peso} kg.`);
  if (dimensoes)
    detalhesCarga.push(`Dimensoes/tamanho aproximado do produto: ${dimensoes}.`);

  const pedido = [
    `Origem: ${ORIGEM_PADRAO}.`,
    `Destino: ${cidadeDestino} - ${estadoDestino}, Brasil.`,
    ...detalhesCarga,
    "Encontre transportadoras que realizam esse frete.",
  ].join("\n");

  const resposta = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO_BUSCA_TRANSPORTADORAS,
      tools: [{ type: "web_search" }],
      instructions: [
        "Voce e um especialista senior em logistica e fretes rodoviarios no Brasil, com foco em encontrar transportadoras de carga (nao correios, nao motoboy) que atendam rotas especificas entre estados.",
        "Use a ferramenta de busca na web para pesquisar em multiplas fontes: sites oficiais de transportadoras, marketplaces e guias de frete (ex: Transvias, oHub, CargoX, Central do Frete, FreteRapido, Guia da Carga, listas do Google Maps) e diretorios setoriais.",
        "Priorize transportadoras que declarem explicitamente atender a rota entre a origem e o destino informados, ou que atuem na regiao de destino com coleta em Sao Paulo.",
        "Se peso e/ou dimensoes forem informados, priorize transportadoras compativeis com esse tipo de carga (ex: cargas pequenas/fracionadas vs cargas grandes/paletizadas).",
        "Retorne no maximo 8 transportadoras, ordenadas da mais relevante para a menos relevante.",
        "Para cada transportadora, preencha telefone e whatsapp no formato brasileiro com DDD (ex: (11) 91234-5678) somente quando encontrar essa informacao em uma fonte confiavel. Nunca invente numero de telefone ou whatsapp: se nao encontrar, retorne null.",
        "No campo fonte, informe o nome do site onde a informacao foi encontrada (ex: site oficial, Transvias, oHub, Google Maps).",
        "No campo resumo, escreva 2 a 3 frases resumindo o resultado da busca em portugues.",
        "Retorne apenas o JSON estruturado conforme o schema, sem texto adicional.",
      ].join("\n"),
      input: pedido,
      text: {
        format: {
          type: "json_schema",
          name: "busca_transportadoras",
          strict: true,
          schema: schemaBuscaTransportadoras,
        },
      },
      max_output_tokens: 2000,
    }),
  });

  const payload = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    const mensagem =
      payload?.error?.message || "Falha ao buscar transportadoras com a IA";
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

export const buscarTransportadoras = async (req, res) => {
  try {
    const { estadoDestino, cidadeDestino, peso, dimensoes } = req.body;

    if (!estadoDestino || !String(estadoDestino).trim()) {
      return res.status(400).json({ error: "Estado de destino e obrigatorio" });
    }

    if (!cidadeDestino || !String(cidadeDestino).trim()) {
      return res.status(400).json({ error: "Cidade de destino e obrigatoria" });
    }

    const resultado = await chamarOpenAIParaBuscarTransportadoras({
      estadoDestino: String(estadoDestino).trim(),
      cidadeDestino: String(cidadeDestino).trim(),
      peso: peso ? String(peso).trim() : "",
      dimensoes: dimensoes ? String(dimensoes).trim() : "",
    });

    return res.json(resultado);
  } catch (error) {
    console.error("Erro ao buscar transportadoras:", error);
    return res
      .status(error.status || 500)
      .json({ error: error.message || "Erro ao buscar transportadoras" });
  }
};
