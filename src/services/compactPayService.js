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

const ehPagamentoAppAgarra = (venda) =>
  String(venda.provider || "").toLowerCase() === "agarramais_app" ||
  String(venda.payment_type || "").toLowerCase() === "pagamento_app_agarra" ||
  /aplicativo agarra/i.test(String(venda.descricao || ""));

// Crédito lançado à mão pelo painel do CompactPay não é dinheiro recebido,
// então não conta como faturamento. Já o pagamento feito pelo app Agarra
// conta aqui (o CompactPay deixa ele fora do faturamento dele, mas pra
// gente é dinheiro que a máquina recebeu) e vem separado em `totalApp`.
const contaComoFaturamento = (venda) => {
  const provider = String(venda.provider || "").toLowerCase();
  const paymentType = String(venda.payment_type || "").toLowerCase();
  const descricao = String(venda.descricao || "").toLowerCase();
  if (provider === "manual" || paymentType === "lancamento_painel") return false;
  return !/lancado pelo painel/.test(descricao);
};

const classificarForma = (venda) => {
  if (venda.kind === "pagamento_fisico") return "fisico";
  if (ehPagamentoAppAgarra(venda)) return "app";
  if (venda.card_brand) return "cartao";
  return "pix";
};

// `inicio`/`fim` no formato YYYY-MM-DD (dias em horário de Brasília — o
// CompactPay já trata o fim como o dia inteiro).
//
// O total é somado a partir da lista de vendas (e não do `resumo`), porque
// o `resumo` do CompactPay zera o período depois que ele recebe um
// fechamento, enquanto as vendas continuam vindo (marcadas como
// `fechado`). Assim o valor de um mês já fechado continua aparecendo no
// Ranking/Dashboard/Relatórios.
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
      forma: classificarForma(venda),
      contaFaturamento: !venda.is_test && contaComoFaturamento(venda),
      fechado: Boolean(venda.fechado),
    };
  });

  // Teste, devolvido e lançamento manual do painel não contam como
  // faturamento.
  const reais = transacoes.filter((t) => t.contaFaturamento && !t.jaDevolvido);
  const somar = (lista) =>
    Number(lista.reduce((soma, t) => soma + t.valor, 0).toFixed(2));

  return {
    inicio: inicio || null,
    fim: fim || null,
    transacoes,
    total: somar(reais),
    totalPix: somar(reais.filter((t) => t.forma === "pix")),
    totalCartao: somar(reais.filter((t) => t.forma === "cartao")),
    totalFisico: somar(reais.filter((t) => t.forma === "fisico")),
    totalApp: somar(reais.filter((t) => t.forma === "app")),
    quantidade: reais.length,
    resumo: dados?.resumo || null,
  };
};

// Mesmo formato de consultarFechamentoMachinePay, pra o Registrar Dinheiro
// e os totais (Dashboard/Ranking/Relatórios) tratarem as duas iguais. O
// CompactPay não informa taxa por venda, então taxas = 0 e líquido = bruto.
// `brutoComTaxasMp`/`cartaoPix` é só o digital (Pix + cartão + app Agarra),
// igual na
// Machine Pay; o físico (noteiro/moedeiro contado pela placa) vem à parte
// em `fisico`, porque esse dinheiro é recolhido e registrado como
// "Dinheiro" no Registrar Dinheiro.
export const consultarFechamentoCompactPay = async ({
  compactPayId,
  inicio,
  fim,
}) => {
  const dados = await consultarTransacoesCompactPay({
    compactPayId,
    inicio: String(inicio).slice(0, 10),
    fim: String(fim).slice(0, 10),
  });
  const digital = Number(
    (dados.totalPix + dados.totalCartao + dados.totalApp).toFixed(2),
  );

  return {
    pix: dados.totalPix,
    debito: 0,
    credito: 0,
    cartao: dados.totalCartao,
    app: dados.totalApp,
    brutoComTaxasMp: digital,
    cartaoPix: digital,
    taxas: 0,
    liquido: digital,
    percentualTaxaMedia: 0,
    fisico: dados.totalFisico,
    total: dados.total,
    quantidade: dados.quantidade,
  };
};

// Registra o fechamento do período no CompactPay (equivalente ao
// fecharFechamentoMachinePay). Diferente da Machine Pay, isso não apaga as
// vendas: elas só passam a sair marcadas como "fechado", então não é
// preciso preservar nada antes. Se o período já tinha fechamento lá (409),
// devolve jaExistia em vez de erro.
export const fecharFechamentoCompactPay = async ({ compactPayId, inicio, fim }) => {
  const params = new URLSearchParams({
    data_inicio: String(inicio).slice(0, 10),
    data_fim: String(fim).slice(0, 10),
  });

  try {
    const fechamento = await fetchCompactPay(
      `/maquinas/${idPath(compactPayId)}/fechamentos?${params}`,
      { method: "POST" },
    );
    return {
      concluido: true,
      jaExistia: false,
      fechamentoId: fechamento?.id ?? null,
      totalPagamentos: Number(fechamento?.total_pagamentos || 0),
    };
  } catch (error) {
    if (/ja existe fechamento/i.test(error.message || "")) {
      return { concluido: true, jaExistia: true, fechamentoId: null };
    }
    throw error;
  }
};

const dataBrasilia = (data) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(
    new Date(data),
  );

// Total recebido (faturamento real) entre dois instantes. A API do
// CompactPay só filtra por dia, então busca os dias inteiros e corta pelo
// horário aqui.
export const calcularTotalRecebidoCompactPay = async ({
  compactPayId,
  inicio,
  fim,
}) => {
  const inicioData = new Date(inicio);
  const fimData = new Date(fim);

  const { transacoes } = await consultarTransacoesCompactPay({
    compactPayId,
    inicio: dataBrasilia(inicioData),
    fim: dataBrasilia(fimData),
  });

  const total = transacoes
    .filter((t) => t.contaFaturamento && !t.jaDevolvido)
    .filter((t) => {
      const data = t.data ? new Date(t.data) : null;
      return !data || (data > inicioData && data <= fimData);
    })
    .reduce((soma, t) => soma + t.valor, 0);

  return Number(total.toFixed(2));
};

// Equivalente a calcularEstoqueRealMachinePay: cada valorDesconto recebido
// desde a última coleta libera 1 pulso/prêmio sem gerar movimentação.
export const calcularEstoqueRealCompactPay = async ({
  compactPayId,
  valorDesconto,
  totalPosAnterior,
  dataUltimaMovimentacao,
}) => {
  const totalRecebido = await calcularTotalRecebidoCompactPay({
    compactPayId,
    inicio: dataUltimaMovimentacao,
    fim: new Date(),
  });

  const pulsos = Math.floor(totalRecebido / valorDesconto);

  return {
    estoqueReal: Math.max(0, totalPosAnterior - pulsos),
    totalRecebidoDesdeUltimaMovimentacao: totalRecebido,
    pulsos,
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
