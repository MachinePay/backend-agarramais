import {
  listarClientesMachinePay,
  listarCaixasCliente,
  criarLojaECaixa,
} from "../services/machinePayCaixasService.js";

// Um caixa por vez por cliente: a sequência é criada pelo navegador chamando
// esta rota um nome de cada vez; isto evita duas abas criando juntas.
const criacoesEmAndamento = new Set();

const responderErro = (res, error, mensagemPadrao) => {
  console.error(`[MachinePay Caixas] ${mensagemPadrao}:`, error.message);
  res.status(error.status || 502).json({ error: error.message || mensagemPadrao });
};

export const listarClientes = async (req, res) => {
  try {
    res.json({ clientes: await listarClientesMachinePay() });
  } catch (error) {
    responderErro(res, error, "Erro ao listar clientes da Machine Pay");
  }
};

export const listarCaixas = async (req, res) => {
  try {
    res.json(await listarCaixasCliente(req.params.clienteId));
  } catch (error) {
    responderErro(res, error, "Erro ao buscar caixas do cliente");
  }
};

export const criarCaixa = async (req, res) => {
  const clienteId = String(req.body?.clienteId || "");
  if (!clienteId) {
    return res.status(400).json({ error: "Escolha o cliente." });
  }
  if (criacoesEmAndamento.has(clienteId)) {
    return res.status(409).json({
      error: "Já tem um caixa sendo criado para este cliente. Aguarde.",
    });
  }

  criacoesEmAndamento.add(clienteId);
  try {
    const resultado = await criarLojaECaixa({ clienteId, nome: req.body?.nome });
    res.locals.entityId = resultado.idCaixa;
    res.status(201).json(resultado);
  } catch (error) {
    responderErro(res, error, "Erro ao criar loja e caixa");
  } finally {
    criacoesEmAndamento.delete(clienteId);
  }
};
