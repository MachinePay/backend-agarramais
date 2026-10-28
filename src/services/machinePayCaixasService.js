import crypto from "crypto";
import { loginMachinePay } from "./machinePayService.js";

// Criação de Loja + Caixa (Mercado Pago) pelo painel Machine Pay — mesma tela
// do "☰ Menu → Novo Caixa → Preencher Dados" (popup lojaecaixa.php).
//
// O formulário do popup manda nome_loja, nome_caixa e o access_token do
// Mercado Pago do cliente escolhido (cada <option> do select de clientes
// carrega o token). Esses tokens NUNCA saem do backend: o navegador só vê o
// nome do cliente e um id derivado (hash) do token.

const DEFAULT_LOGIN_URL = "https://www.cyberpix.com.br/pix-adesivo-clientes/";
const CACHE_CLIENTES_MS = 5 * 60 * 1000;

const urlPopup = () =>
  new URL(
    "lojaecaixa.php",
    process.env.MACHINE_PAY_LOGIN_URL || DEFAULT_LOGIN_URL,
  ).toString();

const decodificarHtml = (texto) =>
  String(texto || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/gi, " ");

const textoLimpo = (html) =>
  decodificarHtml(String(html || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

// Nunca deixa token do Mercado Pago escapar em mensagem de erro/log.
const semTokens = (texto) =>
  String(texto || "").replace(/APP_USR-[A-Za-z0-9-]+/g, "APP_USR-***");

const idDoToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex").slice(0, 20);

let cacheClientes = null;

const requisitarPopup = async ({ cookies, loginUrl }, corpo) => {
  const resposta = await fetch(urlPopup(), {
    method: corpo ? "POST" : "GET",
    headers: {
      Cookie: cookies,
      Referer: corpo ? urlPopup() : loginUrl,
      ...(corpo ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: corpo ? new URLSearchParams(corpo).toString() : undefined,
  });
  const html = await resposta.text();
  if (!resposta.ok) {
    throw new Error(`Machine Pay respondeu com status ${resposta.status}`);
  }
  return html;
};

const extrairClientes = (html) => {
  const select = html.match(/<select[^>]*id="cliente_criar"[\s\S]*?<\/select>/i)?.[0];
  if (!select) {
    throw new Error(
      "Não encontrei a lista de clientes na tela de Novo Caixa da Machine Pay.",
    );
  }
  return [...select.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)]
    .map(([, token, nome]) => ({ token: token.trim(), nome: textoLimpo(nome) }))
    .filter((cliente) => cliente.token && cliente.nome)
    .map((cliente) => ({ ...cliente, id: idDoToken(cliente.token) }));
};

const carregarClientes = async ({ forcar = false } = {}) => {
  if (!forcar && cacheClientes && cacheClientes.expiraEm > Date.now()) {
    return cacheClientes.lista;
  }
  const sessao = await loginMachinePay();
  const lista = extrairClientes(await requisitarPopup(sessao));
  cacheClientes = { lista, expiraEm: Date.now() + CACHE_CLIENTES_MS };
  return lista;
};

const obterCliente = async (clienteId) => {
  let cliente = (await carregarClientes()).find((item) => item.id === clienteId);
  if (!cliente) {
    cliente = (await carregarClientes({ forcar: true })).find(
      (item) => item.id === clienteId,
    );
  }
  if (!cliente) {
    const erro = new Error("Cliente não encontrado na Machine Pay.");
    erro.status = 404;
    throw erro;
  }
  return cliente;
};

export const listarClientesMachinePay = async () =>
  (await carregarClientes({ forcar: true }))
    .map(({ id, nome }) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

// "Buscar Caixas" do popup: lista os caixas que o cliente já tem.
export const listarCaixasCliente = async (clienteId) => {
  const cliente = await obterCliente(clienteId);
  const sessao = await loginMachinePay();
  const html = await requisitarPopup(sessao, {
    access_token: cliente.token,
    buscar_caixas: "",
  });

  const lista = html.match(/id="caixasModal"[\s\S]*?<\/ul>/i)?.[0] || "";
  const caixas = [...lista.matchAll(/<li>([\s\S]*?)<\/li>/gi)]
    .map(([, item]) => {
      const texto = textoLimpo(item);
      return {
        idCaixa: texto.match(/ID do Caixa:\s*(\d+)/i)?.[1] || "",
        nome: texto.match(/Cliente:\s*(.+)$/i)?.[1]?.trim() || "",
      };
    })
    .filter((caixa) => caixa.idCaixa || caixa.nome);

  return { cliente: cliente.nome, caixas };
};

const valorPorId = (html, id) => {
  const tag = html.match(new RegExp(`<[^>]*id="${id}"[^>]*>([\\s\\S]*?)</`, "i"));
  if (tag) return textoLimpo(tag[1]);
  return "";
};

// "Criar Loja e Caixa": mesmo nome na loja e no caixa.
export const criarLojaECaixa = async ({ clienteId, nome }) => {
  const nomeLimpo = String(nome || "").replace(/\s+/g, " ").trim();
  if (nomeLimpo.length < 2 || nomeLimpo.length > 60) {
    const erro = new Error("O nome do caixa deve ter de 2 a 60 caracteres.");
    erro.status = 400;
    throw erro;
  }

  const cliente = await obterCliente(clienteId);
  const sessao = await loginMachinePay();
  const html = await requisitarPopup(sessao, {
    nome_loja: nomeLimpo,
    nome_caixa: nomeLimpo,
    access_token: cliente.token,
  });

  const idCaixa = valorPorId(html, "idCaixa");
  const idLoja = valorPorId(html, "idLoja");
  const qrCodeUrl =
    html.match(/id="qrcode-url"[^>]*value="([^"]*)"/i)?.[1] ||
    html.match(/value="([^"]*)"[^>]*id="qrcode-url"/i)?.[1] ||
    "";

  if (!/^\d+$/.test(idCaixa)) {
    // Sem o ID do caixa na resposta: mostra o que a Machine Pay disse
    // (alerta/erro), sem tokens.
    const alerta =
      html.match(/alert\(\s*["'`]([^"'`]+)["'`]\s*\)/i)?.[1] ||
      textoLimpo(
        html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<select[\s\S]*?<\/select>/gi, " "),
      )
        .replace(/Criação de Loja e Caixa.*$/i, "")
        .slice(0, 300);
    const erro = new Error(
      `A Machine Pay não confirmou a criação de "${nomeLimpo}"${alerta ? `: ${semTokens(alerta)}` : "."}`,
    );
    erro.status = 502;
    throw erro;
  }

  return {
    cliente: cliente.nome,
    nome: nomeLimpo,
    loja: valorPorId(html, "loja") || nomeLimpo,
    idLoja,
    caixa: valorPorId(html, "caixa") || nomeLimpo,
    idCaixa,
    qrCodeUrl: decodificarHtml(qrCodeUrl),
  };
};

// ---- QR codes dos caixas ----
// Mesmo dado do "☰ → Consultar caixa" do painel (que mostra o JSON do POS no
// Mercado Pago), mas direto na API do Mercado Pago com o token do cliente.
// O campo qr_code é o texto do PIX; o navegador desenha o QR a partir dele.

const MP_API = "https://api.mercadopago.com";

const requisitarMercadoPago = async (token, caminho) => {
  const resposta = await fetch(`${MP_API}${caminho}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const erro = new Error(
      `Mercado Pago respondeu com status ${resposta.status}${dados?.message ? `: ${semTokens(dados.message)}` : ""}`,
    );
    erro.status = resposta.status === 404 ? 404 : 502;
    throw erro;
  }
  return dados;
};

export const listarCaixasMercadoPago = async (clienteId) => {
  const cliente = await obterCliente(clienteId);
  const caixas = [];
  for (let offset = 0; ; offset += 100) {
    const pagina = await requisitarMercadoPago(
      cliente.token,
      `/pos?limit=100&offset=${offset}`,
    );
    const resultados = pagina.results || [];
    caixas.push(
      ...resultados.map((pos) => ({
        idCaixa: String(pos.id),
        nome: pos.name || "",
        idLoja: pos.store_id ? String(pos.store_id) : "",
        temQr: Boolean(pos.qr?.image),
      })),
    );
    if (resultados.length < 100 || caixas.length >= (pagina.paging?.total || 0)) break;
  }
  caixas.sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR", { numeric: true, sensitivity: "base" }),
  );
  return { cliente: cliente.nome, caixas };
};

export const buscarQrCodesCaixas = async ({ clienteId, ids }) => {
  const lista = [...new Set((ids || []).map(String))].filter((id) => /^\d+$/.test(id));
  if (lista.length === 0 || lista.length > 200) {
    const erro = new Error("Escolha de 1 a 200 caixas.");
    erro.status = 400;
    throw erro;
  }

  const cliente = await obterCliente(clienteId);
  const resultados = new Array(lista.length);
  let proximo = 0;
  const trabalhar = async () => {
    while (proximo < lista.length) {
      const i = proximo++;
      try {
        const pos = await requisitarMercadoPago(cliente.token, `/pos/${lista[i]}`);
        resultados[i] = {
          idCaixa: lista[i],
          nome: pos.name || "",
          qrCode: pos.qr_code || "",
          erro: pos.qr_code ? "" : "Caixa sem QR code no Mercado Pago.",
        };
      } catch (error) {
        resultados[i] = { idCaixa: lista[i], nome: "", qrCode: "", erro: error.message };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, lista.length) }, trabalhar));

  return { cliente: cliente.nome, caixas: resultados };
};
