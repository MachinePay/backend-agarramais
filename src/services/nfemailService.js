// Integração com a API REST da NFeMail (https://dev.nfemail.com.br).
// Autenticação: HTTP Basic com o CNPJ da empresa (sem formatação) + API key
// gerada no painel NFeMail (Conta > Empresas > gerar chave de API).
// A NFeMail não expõe webhook, então a sincronização é sempre sob demanda
// (polling), disparada pelo usuário comercial na tela de Pedidos/Notas Fiscais.

const NFEMAIL_API_BASE_URL =
  process.env.NFEMAIL_API_BASE_URL || "https://api.nfemail.com.br";

const credenciaisConfiguradas = () =>
  Boolean(process.env.NFEMAIL_CNPJ && process.env.NFEMAIL_API_KEY);

const montarAuthHeader = () => {
  if (!credenciaisConfiguradas()) {
    const erro = new Error(
      "NFEMAIL_CNPJ/NFEMAIL_API_KEY não configuradas no backend",
    );
    erro.status = 500;
    throw erro;
  }

  const cnpj = String(process.env.NFEMAIL_CNPJ).replace(/\D/g, "");
  const credenciais = Buffer.from(
    `${cnpj}:${process.env.NFEMAIL_API_KEY}`,
  ).toString("base64");

  return `Basic ${credenciais}`;
};

const chamarNFeMail = async (path, params = {}) => {
  if (typeof fetch !== "function") {
    const erro = new Error(
      "fetch nativo indisponível. Execute o backend em Node.js 18 ou superior.",
    );
    erro.status = 500;
    throw erro;
  }

  const url = new URL(path, NFEMAIL_API_BASE_URL);
  Object.entries(params).forEach(([chave, valor]) => {
    if (valor !== undefined && valor !== null && valor !== "") {
      url.searchParams.set(chave, valor);
    }
  });

  const resposta = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: montarAuthHeader(),
      Accept: "application/json",
    },
  });

  const textoBruto = await resposta.text();
  let payload = null;
  try {
    payload = textoBruto ? JSON.parse(textoBruto) : null;
  } catch {
    payload = null;
  }

  // Log temporário de diagnóstico: mostra exatamente o que a NFeMail devolveu,
  // já que o schema de resposta não é 100% documentado publicamente. Remover
  // depois de confirmar o formato real.
  console.log(
    `[nfemailService] GET ${url.pathname}${url.search} -> status ${resposta.status}`,
  );
  console.log(
    `[nfemailService] corpo bruto (até 1000 chars): ${textoBruto.slice(0, 1000)}`,
  );

  if (!resposta.ok) {
    const mensagem =
      payload?.mensagem || payload?.message || "Falha ao consultar a NFeMail";
    const erro = new Error(mensagem);
    erro.status = resposta.status;
    throw erro;
  }

  return payload;
};

// A NFeMail não documenta publicamente o schema exato de resposta; esta
// normalização é tolerante a variações de nome de campo e deve ser ajustada
// assim que houver uma API key real para validar o primeiro retorno.
export const normalizarNotaNFeMail = (raw) => {
  if (!raw || typeof raw !== "object") return null;

  const numeroNota = raw.numero ?? raw.numeroNota ?? raw.nNF ?? null;
  const numeroPedido =
    raw.pedido ?? raw.numeroPedido ?? raw.codigoPedido ?? raw.codPedido ?? null;
  const clienteNome =
    raw.cliente ?? raw.nomeCliente ?? raw.destinatario ?? raw.razaoSocial ?? null;
  const dataNota =
    raw.dataEmissao ?? raw.data ?? raw.dhEmi ?? raw.emissao ?? null;
  const transportadora =
    raw.transportadora ?? raw.transportadoraNome ?? raw.nomeTransportadora ?? null;
  const tipoFreteRaw = raw.tipoFrete ?? raw.frete ?? raw.modFrete ?? null;
  const tipoFrete = tipoFreteRaw
    ? String(tipoFreteRaw).toUpperCase().includes("FOB")
      ? "FOB"
      : String(tipoFreteRaw).toUpperCase().includes("CIF")
        ? "CIF"
        : null
    : null;
  const valorNota = raw.valor ?? raw.valorTotal ?? raw.vNF ?? null;
  const chaveAcessoNFe = raw.chave ?? raw.chaveAcesso ?? raw.chNFe ?? null;

  return {
    numeroNota: numeroNota != null ? String(numeroNota) : null,
    numeroPedido: numeroPedido != null ? String(numeroPedido) : null,
    clienteNome: clienteNome != null ? String(clienteNome) : null,
    dataNota,
    transportadora,
    tipoFrete,
    valorNota,
    chaveAcessoNFe,
  };
};

export const buscarNotasRecebidas = async ({ dataInicial, dataFinal } = {}) => {
  const payload = await chamarNFeMail("/api/NFeRecebidas", {
    dataInicial,
    dataFinal,
  });
  const lista = Array.isArray(payload) ? payload : payload?.dados || [];
  return lista.map(normalizarNotaNFeMail).filter(Boolean);
};

export const buscarNotaPorPedido = async (numeroPedido) => {
  const payload = await chamarNFeMail("/api/NotasFiscais", {
    pedido: numeroPedido,
  });
  const lista = Array.isArray(payload) ? payload : payload?.dados || [];
  return lista.map(normalizarNotaNFeMail).filter(Boolean);
};

// Lista as notas fiscais EMITIDAS pela empresa (notas de venda para os
// clientes) via /api/NotasFiscais, paginado. Diferente de NFeRecebidas, que
// traz notas de COMPRA recebidas de fornecedores — por isso não serve para
// o fluxo comercial de "nota emitida para o cliente X no pedido Y".
export const buscarNotasEmitidas = async ({ page = 1, limit = 50 } = {}) => {
  const payload = await chamarNFeMail("/api/NotasFiscais", { page, limit });
  const lista = Array.isArray(payload) ? payload : payload?.dados || [];
  return lista.map(normalizarNotaNFeMail).filter(Boolean);
};

export const nfemailCredenciaisConfiguradas = credenciaisConfiguradas;
