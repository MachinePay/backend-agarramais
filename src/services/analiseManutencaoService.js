import { Op } from "sequelize";
import { Manutencao, Maquina, Loja } from "../models/index.js";

// Análise de manutenções repetidas: a IA (OpenAI, mesmo provedor da IAgarra)
// agrupa manutenções que são o mesmo problema mesmo com títulos diferentes
// ("garra fraca" / "garra soltando prêmio"). Contagem e datas são sempre
// recalculadas aqui a partir dos ids que ela devolve. Sem chave ou se a IA
// falhar, cai num agrupamento simples por título + máquina.

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MODELO = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const CACHE_MS = 30 * 60 * 1000;
const MAX_MANUTENCOES = 300;

const cache = new Map();

const normalizar = (texto) =>
  String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const schemaAnalise = {
  type: "object",
  additionalProperties: false,
  required: ["grupos"],
  properties: {
    grupos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "problema",
          "escopo",
          "ids",
          "gravidade",
          "explicacao",
          "recomendacao",
        ],
        properties: {
          problema: { type: "string" },
          escopo: { type: "string", enum: ["MAQUINA", "LOJA", "GERAL"] },
          ids: { type: "array", items: { type: "string" } },
          gravidade: { type: "string", enum: ["BAIXA", "MEDIA", "ALTA"] },
          explicacao: { type: "string" },
          recomendacao: { type: "string" },
        },
      },
    },
  },
};

const extrairTexto = (resposta) => {
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

const agruparComIa = async (manutencoes, dias) => {
  const linhas = manutencoes.map((m) =>
    [
      `id: ${m.id}`,
      `data: ${new Date(m.createdAt).toISOString().slice(0, 10)}`,
      `loja: ${m.loja?.nome || "-"}`,
      `maquina: ${m.maquina?.nome || "-"}`,
      `status: ${m.status}`,
      `titulo: ${m.titulo}`,
      `descricao: ${String(m.descricao || "").slice(0, 200)}`,
      m.solucao ? `solucao: ${String(m.solucao).slice(0, 150)}` : null,
    ]
      .filter(Boolean)
      .join(" | "),
  );

  const resposta = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO,
      instructions: [
        "Voce e a IAgarra e analisa manutencoes de maquinas de pelucia (gruas) de uma rede de lojas.",
        `Recebe as manutencoes dos ultimos ${dias} dias e encontra PROBLEMAS QUE SE REPETEM.`,
        "Agrupe manutencoes que descrevem o mesmo problema, mesmo com palavras diferentes (ex: 'garra fraca' e 'garra nao segura premio').",
        "escopo MAQUINA: mesmo problema na mesma maquina. LOJA: mesmo problema em maquinas diferentes da mesma loja. GERAL: mesmo problema em varias lojas.",
        "So retorne grupos com 2 ou mais manutencoes. Uma manutencao pode estar em no maximo um grupo. Use apenas ids que existem na lista.",
        "problema: nome curto do problema em portugues (ex: 'Garra fraca').",
        "gravidade ALTA quando se repete muito em pouco tempo ou para a maquina; MEDIA quando e recorrente; BAIXA quando e pequeno.",
        "explicacao: 1 frase dizendo o padrao (onde e com que frequencia). recomendacao: 1 frase pratica do que fazer (ex: trocar a peca em vez de ajustar de novo).",
        "Se nada se repete, retorne grupos vazio.",
      ].join("\n"),
      input: linhas.join("\n"),
      text: {
        format: {
          type: "json_schema",
          name: "analise_manutencoes",
          strict: true,
          schema: schemaAnalise,
        },
      },
      max_output_tokens: 2000,
    }),
  });

  const payload = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new Error(payload?.error?.message || "Falha na análise com OpenAI");
  }
  const texto = extrairTexto(payload);
  if (!texto) throw new Error("OpenAI não retornou a análise");
  return JSON.parse(texto).grupos || [];
};

// Fallback sem IA: mesmo título (normalizado) na mesma máquina/loja.
const agruparSimples = (manutencoes) => {
  const mapa = new Map();
  for (const m of manutencoes) {
    const chave = `${normalizar(m.titulo)}|${m.maquinaId || m.lojaId || "-"}`;
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(m);
  }
  return [...mapa.values()]
    .filter((lista) => lista.length >= 2)
    .map((lista) => ({
      problema: lista[0].titulo,
      escopo: lista[0].maquinaId ? "MAQUINA" : "LOJA",
      ids: lista.map((m) => m.id),
      gravidade: lista.length >= 4 ? "ALTA" : "MEDIA",
      explicacao: "",
      recomendacao: "",
    }));
};

// Junta o que a IA devolveu com os dados reais: só ids válidos, sem repetir
// manutenção entre grupos, contagem e período calculados aqui.
const montarResultado = (grupos, manutencoes) => {
  const porId = new Map(manutencoes.map((m) => [String(m.id), m]));
  const usados = new Set();

  return grupos
    .map((g) => {
      const itens = [...new Set(g.ids.map(String))]
        .filter((id) => porId.has(id) && !usados.has(id))
        .map((id) => porId.get(id));
      if (itens.length < 2) return null;
      itens.forEach((m) => usados.add(String(m.id)));

      const datas = itens
        .map((m) => new Date(m.createdAt).getTime())
        .sort((a, b) => a - b);
      const nomes = (campo) => [
        ...new Set(itens.map((m) => m[campo]?.nome).filter(Boolean)),
      ];
      return {
        problema: g.problema,
        escopo: g.escopo,
        gravidade: g.gravidade,
        explicacao: g.explicacao,
        recomendacao: g.recomendacao,
        quantidade: itens.length,
        primeira: new Date(datas[0]).toISOString(),
        ultima: new Date(datas[datas.length - 1]).toISOString(),
        diasEntrePrimeiraEUltima: Math.max(
          1,
          Math.round((datas[datas.length - 1] - datas[0]) / 86400000),
        ),
        abertas: itens.filter((m) => m.status !== "RESOLVIDA").length,
        maquinas: nomes("maquina"),
        lojas: nomes("loja"),
        ids: itens.map((m) => m.id),
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.quantidade - a.quantidade ||
        new Date(b.ultima) - new Date(a.ultima),
    );
};

export async function analisarRepeticoes({ dias = 30 } = {}) {
  const periodo = Math.min(Math.max(parseInt(dias, 10) || 30, 7), 365);
  const desde = new Date(Date.now() - periodo * 86400000);

  const manutencoes = await Manutencao.findAll({
    where: { createdAt: { [Op.gte]: desde }, origem: "MANUAL" },
    include: [
      { model: Maquina, as: "maquina", attributes: ["id", "nome"] },
      { model: Loja, as: "loja", attributes: ["id", "nome"] },
    ],
    order: [["createdAt", "DESC"]],
    limit: MAX_MANUTENCOES,
  });

  const base = {
    dias: periodo,
    analisadas: manutencoes.length,
    geradoEm: new Date().toISOString(),
  };
  if (manutencoes.length < 2) return { ...base, fonte: "nenhuma", grupos: [] };

  // Mesmo conjunto de manutenções (e status) = mesma resposta: evita gastar
  // a API toda vez que alguém abre a página.
  const assinatura = `${periodo}|${manutencoes
    .map((m) => `${m.id}:${new Date(m.updatedAt).getTime()}`)
    .join(",")}`;
  const emCache = cache.get(periodo);
  if (
    emCache &&
    emCache.assinatura === assinatura &&
    Date.now() - emCache.em < CACHE_MS
  ) {
    return emCache.resultado;
  }

  let grupos;
  let fonte = "ia";
  let aviso = null;
  if (process.env.OPENAI_API_KEY && typeof fetch === "function") {
    try {
      grupos = await agruparComIa(manutencoes, periodo);
    } catch (erro) {
      console.error("[analiseManutencao] IA falhou, usando agrupamento simples:", erro.message);
      grupos = agruparSimples(manutencoes);
      fonte = "simples";
      aviso = "A IA não respondeu agora; agrupado só por título e máquina.";
    }
  } else {
    grupos = agruparSimples(manutencoes);
    fonte = "simples";
    aviso = "IA não configurada (OPENAI_API_KEY); agrupado só por título e máquina.";
  }

  const resultado = {
    ...base,
    fonte,
    aviso,
    grupos: montarResultado(grupos, manutencoes),
  };
  // Falha momentânea da IA não fica em cache: na próxima tenta de novo.
  if (fonte === "ia" || !process.env.OPENAI_API_KEY) {
    cache.set(periodo, { assinatura, em: Date.now(), resultado });
  }
  return resultado;
}
