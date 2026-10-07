// Integração com a loja Gira Kids (girakids-loja.krionoficial.com.br).
//
// A loja é um app React em cima do Firebase: o login passa pela Cloud
// Function `loginUser` (devolve um customToken), que é trocado por um idToken
// no Firebase Auth. Com o idToken (Bearer) chamamos as mesmas Cloud Functions
// que a tela "Histórico de pedidos" usa: `listOrdersHistory` (lista/busca) e
// `getOrderAdmin` (detalhe — o "Ver pedido" do menu "Mais ações").

const FUNCTIONS_URL =
  process.env.GIRAKIDS_FUNCTIONS_URL ||
  "https://us-central1-girakids-5c1a0.cloudfunctions.net";
// Chave pública do app web do Firebase (vem no próprio site da loja).
const FIREBASE_API_KEY =
  process.env.GIRAKIDS_FIREBASE_API_KEY ||
  "AIzaSyDu4jcA7nvpsgAAOyRDVpwyaAGcx4XcnMo";

const TAMANHO_PAGINA = 50;
const MAXIMO_PAGINAS = 6;

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Configure ${name} no ambiente do backend`);
  }
  return value;
};

let sessao = null;

const login = async () => {
  const respostaLogin = await fetch(`${FUNCTIONS_URL}/loginUser`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: required("GIRAKIDS_EMAIL"),
      password: required("GIRAKIDS_PASSWORD"),
    }),
  });

  if (respostaLogin.status === 401) {
    throw new Error("Login da Gira Kids recusado. Confira e-mail e senha.");
  }
  const dadosLogin = await respostaLogin.json().catch(() => ({}));
  if (!respostaLogin.ok || !dadosLogin.customToken) {
    throw new Error(
      dadosLogin.error || `Gira Kids respondeu com status ${respostaLogin.status}`,
    );
  }

  const respostaToken = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: dadosLogin.customToken,
        returnSecureToken: true,
      }),
    },
  );
  const dadosToken = await respostaToken.json().catch(() => ({}));
  if (!respostaToken.ok || !dadosToken.idToken) {
    throw new Error("Não foi possível autenticar na Gira Kids (Firebase).");
  }

  const validadeSegundos = Number(dadosToken.expiresIn || 3600);
  sessao = {
    idToken: dadosToken.idToken,
    usuarioId: dadosLogin.user?.id || dadosToken.localId,
    // Renova 5 minutos antes de vencer.
    expiraEm: Date.now() + (validadeSegundos - 300) * 1000,
  };
  return sessao;
};

const obterSessao = async () =>
  sessao && sessao.expiraEm > Date.now() ? sessao : login();

const chamarFuncao = async (nome, parametros, tentarDeNovo = true) => {
  const { idToken, usuarioId } = await obterSessao();
  const query = new URLSearchParams();
  Object.entries({ requesterUserId: usuarioId, ...parametros }).forEach(
    ([chave, valor]) => {
      if (valor != null && valor !== "") query.set(chave, String(valor));
    },
  );

  const resposta = await fetch(`${FUNCTIONS_URL}/${nome}?${query}`, {
    headers: { Authorization: `Bearer ${idToken}` },
    cache: "no-store",
  });

  if ((resposta.status === 401 || resposta.status === 403) && tentarDeNovo) {
    sessao = null;
    return chamarFuncao(nome, parametros, false);
  }

  const texto = await resposta.text();
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    dados = null;
  }
  if (!resposta.ok || !dados) {
    throw new Error(
      dados?.error ||
        dados?.message ||
        `Gira Kids respondeu com status ${resposta.status}`,
    );
  }
  return dados;
};

// ---------------------------------------------------------------------------
// Endereço
// ---------------------------------------------------------------------------

// A Gira Kids guarda logradouro + número (+ às vezes complemento) num texto
// só, ex.: "Avenida Luiz Carpaneda 120", "Rua X, 45 - Apto 3",
// "Rua Y 12 Quadra 5 Lote 7". Separamos em logradouro / número / complemento
// — o usuário ainda confere e pode corrigir antes de gravar no VIPP.
const PALAVRAS_COMPLEMENTO =
  /^(apto?|apt|ap|apartamento|sala|sl|bloco|bl|casa|cs|loja|lj|lote|lt|qd|quadra|fundos|frente|galp[aã]o|andar|conj(unto)?|cj|box|km|edif[ií]cio|ed|torre|ch[aá]cara|s[ií]tio|fazenda|condom[ií]nio|cond|t[eé]rreo|sobreloja|pavilh[aã]o|unidade|un|compl(emento)?|setor|res(idencial)?)\b/i;
const NUMERO = /^(\d+[A-Za-z]?|s\/?n|sn)$/i;

const limparComplemento = (texto) =>
  String(texto || "")
    .replace(/^[\s,.;:–-]+/, "")
    .replace(/[\s,;–-]+$/, "")
    .trim();

export const separarEndereco = (texto) => {
  const endereco = String(texto || "").replace(/\s+/g, " ").trim();
  if (!endereco) return { logradouro: "", numero: "", complemento: "" };

  // Com vírgula: "Logradouro, 123 - complemento"
  const virgula = endereco.indexOf(",");
  if (virgula > 0) {
    const logradouro = endereco.slice(0, virgula).trim();
    const resto = endereco.slice(virgula + 1).trim();
    const match = resto.match(/^(\d+[A-Za-z]?|s\/?n|sn)\b(.*)$/i);
    if (match) {
      return {
        logradouro,
        numero: match[1].toUpperCase().replace(/^SN$/, "S/N"),
        complemento: limparComplemento(match[2]),
      };
    }
  }

  // Sem vírgula: procura o número que vem no fim ou antes de uma palavra de
  // complemento (assim "Rua 7 de Setembro 120" não pega o 7).
  const partes = endereco.split(" ");
  const candidatos = partes
    .map((parte, indice) => ({ parte, indice }))
    .filter(({ parte, indice }) => indice > 0 && NUMERO.test(parte));

  const escolhido =
    candidatos.find(({ indice }) => {
      const resto = partes.slice(indice + 1).join(" ");
      return !resto || PALAVRAS_COMPLEMENTO.test(limparComplemento(resto));
    }) || candidatos[candidatos.length - 1];

  if (!escolhido) {
    return { logradouro: endereco, numero: "S/N", complemento: "" };
  }

  return {
    logradouro: partes.slice(0, escolhido.indice).join(" ").replace(/[,\s]+$/, ""),
    numero: escolhido.parte.toUpperCase().replace(/^SN$/, "S/N"),
    complemento: limparComplemento(partes.slice(escolhido.indice + 1).join(" ")),
  };
};

const formatarCep = (cep) => {
  const digitos = String(cep || "").replace(/\D/g, "");
  return digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
};

const textoObservacoes = (observacoes) => {
  if (!observacoes) return "";
  if (typeof observacoes === "string") return observacoes.trim();
  return Object.values(observacoes)
    .filter((valor) => typeof valor === "string" && valor.trim())
    .join(" | ");
};

const nomeMetodoEnvio = (metodo) =>
  ({
    PAC: "PAC - Correios",
    SEDEX: "SEDEX - Correios",
    TRANSPORTADORA_PARCEIRA: "Transportadora parceira",
    RETIRAR_LOCAL: "Retirar no local",
  })[metodo] || metodo || "-";

const resumoPedido = (pedido) => ({
  id: pedido.id,
  numero: pedido.order_sequence || pedido.search_code || null,
  cliente: pedido.customer_name || "-",
  data: pedido.created_at || null,
  cidade: pedido.delivery_city || "",
  uf: pedido.delivery_state || "",
  cep: formatarCep(pedido.delivery_cep),
  metodoEnvio: pedido.shipping_method || "",
  metodoEnvioNome: nomeMetodoEnvio(pedido.shipping_method),
  pesoGramas: Number(pedido.total_weight || 0),
  total: Number(pedido.total_amount || 0),
  status: pedido.status || "",
});

export const detalharPedido = (pedido) => {
  const endereco = separarEndereco(pedido.delivery_address);
  return {
    ...resumoPedido(pedido),
    prazoEntregaDias: pedido.shipping_delivery_days || null,
    enderecoOriginal: pedido.delivery_address || "",
    observacoes: textoObservacoes(pedido.observations),
    destinatario: {
      nome: pedido.customer_name || "",
      cep: formatarCep(pedido.delivery_cep),
      logradouro: endereco.logradouro,
      numero: endereco.numero,
      complemento: endereco.complemento,
      bairro: pedido.delivery_neighborhood || "",
      cidade: pedido.delivery_city || "",
      uf: String(pedido.delivery_state || "").toUpperCase().slice(0, 2),
      telefone: pedido.customer_phone || "",
      email: pedido.customer_email || "",
      documento: String(pedido.document_number || "").replace(/\D/g, ""),
    },
  };
};

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const buscarPedidosGiraKids = async ({ nome, inicio, fim }) => {
  const pedidos = [];
  let cursor;

  for (let pagina = 0; pagina < MAXIMO_PAGINAS; pagina += 1) {
    const dados = await chamarFuncao("listOrdersHistory", {
      search: nome,
      startDate: inicio,
      endDate: fim,
      limit: TAMANHO_PAGINA,
      cursor,
    });
    pedidos.push(...(dados.items || []));
    cursor = dados.nextCursor;
    if (!cursor) break;
  }

  return {
    pedidos: pedidos.map(resumoPedido),
    temMais: Boolean(cursor),
  };
};

export const obterPedidoGiraKids = async (pedidoId) => {
  const dados = await chamarFuncao("getOrderAdmin", { orderId: pedidoId });
  if (!dados.order) {
    throw new Error("Pedido não encontrado na Gira Kids.");
  }
  return detalharPedido(dados.order);
};
