// Integração com a API do CompactPay (FastAPI, /api/v1). Diferente da
// Machine Pay (scraping do painel cyberpix), aqui é uma API JSON de verdade:
// faz login com um usuário do CompactPay, guarda o JWT e usa o id_hardware
// da máquina (ex: "1000") como identificador em todas as chamadas.

const DEFAULT_API_URL = "https://compactpayback.onrender.com/api/v1";

// O token do CompactPay expira em 60 min; renova um pouco antes pra não
// pegar 401 no meio de uma consulta.
const TOKEN_TTL_MS = 50 * 60 * 1000;

let _tokenCache = null;

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Configure ${name} no ambiente do backend`);
  }
  return value;
};

const getApiUrl = () =>
  (process.env.COMPACT_PAY_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");

const login = async () => {
  if (_tokenCache && _tokenCache.expiraEm > Date.now()) {
    return _tokenCache.token;
  }

  const response = await fetch(`${getApiUrl()}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      username: required("COMPACT_PAY_LOGIN"),
      password: required("COMPACT_PAY_PASSWORD"),
    }),
  });

  if (!response.ok) {
    throw new Error("Falha ao autenticar no CompactPay");
  }

  const { access_token: token } = await response.json();
  _tokenCache = { token, expiraEm: Date.now() + TOKEN_TTL_MS };
  return token;
};

const extrairMensagemErro = (json, status) => {
  const detail = json?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  return `CompactPay respondeu com status ${status}`;
};

const fetchCompactPay = async (path, options = {}, tentativa = 0) => {
  const token = await login();
  const response = await fetch(`${getApiUrl()}${path}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // Token pode ter sido invalidado antes do TTL (ex: troca de SECRET_KEY);
  // tenta de novo uma vez com login novo.
  if (response.status === 401 && tentativa === 0) {
    _tokenCache = null;
    return fetchCompactPay(path, options, 1);
  }

  const texto = await response.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const error = new Error(extrairMensagemErro(json, response.status));
    error.status = response.status === 404 ? 404 : 502;
    throw error;
  }

  return json;
};

// O CompactPay devolve datetimes em UTC sem sufixo de fuso
// ("2026-09-23T14:00:00"); marca como UTC pro navegador converter certo.
const normalizarDataUtc = (valor) => {
  if (!valor) return null;
  const texto = String(valor);
  return /(Z|[+-]\d{2}:?\d{2})$/.test(texto) ? texto : `${texto}Z`;
};

const idPath = (compactPayId) => encodeURIComponent(String(compactPayId).trim());

export const consultarMaquinaCompactPay = async ({ compactPayId }) => {
  const lista = await fetchCompactPay(
    `/maquinas?periodo=dia&id_hardware=${idPath(compactPayId)}`,
  );
  const maquina = Array.isArray(lista) ? lista[0] : null;

  if (!maquina) {
    const error = new Error(
      `Maquina ${compactPayId} nao encontrada no CompactPay (ou o usuario de integracao nao tem acesso a ela).`,
    );
    error.status = 404;
    throw error;
  }

  return maquina;
};

export const consultarStatusCompactPay = async ({ compactPayId }) => {
  const maquina = await consultarMaquinaCompactPay({ compactPayId });

  return {
    consultadoEm: new Date().toISOString(),
    online: Boolean(maquina.status_online),
    status: maquina.status_online ? "online" : "offline",
    statusOperacional: maquina.status_operacional,
    nomeCompactPay: maquina.nome || null,
    clienteNome: maquina.cliente_nome || null,
    ultimoSinal: normalizarDataUtc(maquina.ultimo_sinal),
    ultimaTransacaoEm: normalizarDataUtc(maquina.ultimo_pagamento_em),
    wifiQualidade: maquina.wifi_quality ?? null,
    firmware: maquina.firmware_version || null,
    faturamentoHoje: Number(maquina.faturamento || 0),
  };
};

// Manda um ping pela placa e espera o PONG (o CompactPay segura a resposta
// por até ~6s). Mais lento que o status acima, mas confirma na hora.
export const verificarOnlineCompactPay = async ({ compactPayId }) => {
  const resultado = await fetchCompactPay(
    `/maquinas/${idPath(compactPayId)}/verificar-online`,
    { method: "POST" },
  );

  return {
    consultadoEm: new Date().toISOString(),
    online: Boolean(resultado?.online),
    status: resultado?.online ? "online" : "offline",
    mensagem: resultado?.message || "",
  };
};

// `inicio`/`fim` no formato YYYY-MM-DD (dias em horário de Brasília — o
// CompactPay já trata o fim como o dia inteiro).
export const consultarTransacoesCompactPay = async ({
  compactPayId,
  inicio,
  fim,
}) => {
  const params = new URLSearchParams({ registro: "todos" });
  if (inicio && fim) {
    params.set("data_inicio", String(inicio).slice(0, 10));
    params.set("data_fim", String(fim).slice(0, 10));
  } else {
    params.set("periodo", "dia");
  }

  const dados = await fetchCompactPay(
    `/maquinas/${idPath(compactPayId)}/historico?${params}`,
  );

  const transacoes = (dados?.vendas || []).map((venda) => {
    const jaDevolvido = Boolean(venda.refunded_at);
    const metodo = [venda.payment_type, venda.card_brand, venda.bank_name]
      .filter(Boolean)
      .join(" · ");

    return {
      id: String(venda.id),
      historicoId: venda.kind === "pagamento" ? venda.id : null,
      data: normalizarDataUtc(venda.data),
      tipo: metodo || venda.provider || "Transacao",
      status: venda.situacao || "-",
      valor: Number(venda.valor || 0),
      isTeste: Boolean(venda.is_test),
      pulsoStatus: venda.pulse_status || "",
      descricao: venda.descricao || "",
      jaDevolvido,
      podeDevolver: Boolean(venda.can_refund) && !jaDevolvido,
    };
  });

  // Teste e devolvido não contam como faturamento.
  const reais = transacoes.filter((t) => !t.isTeste && !t.jaDevolvido);

  return {
    inicio: inicio || null,
    fim: fim || null,
    transacoes,
    total: Number(
      reais.reduce((soma, t) => soma + t.valor, 0).toFixed(2),
    ),
    quantidade: reais.length,
    resumo: dados?.resumo || null,
  };
};

// Libera crédito remoto na placa (o CompactPay registra como TESTE, não
// entra no faturamento). O comando pode ir direto ou entrar na fila se a
// placa estiver processando outro pagamento.
export const enviarCreditoCompactPay = async ({ compactPayId, valor }) => {
  const resultado = await fetchCompactPay(
    `/maquinas/${idPath(compactPayId)}/credito-teste`,
    { method: "POST", body: { valor } },
  );

  return {
    sucesso: Boolean(resultado?.ok),
    valor: resultado?.valor ?? valor,
    commandId: resultado?.command_id || null,
    commandStatus: resultado?.command_status || null,
  };
};

export const devolverPagamentoCompactPay = async ({
  compactPayId,
  historicoId,
}) => {
  const resultado = await fetchCompactPay(
    `/maquinas/${idPath(compactPayId)}/pagamentos/${encodeURIComponent(historicoId)}/extorno`,
    { method: "POST" },
  );

  return {
    sucesso: Boolean(resultado?.ok),
    paymentId: resultado?.payment_id || null,
    devolvidoEm: normalizarDataUtc(resultado?.refunded_at),
  };
};
