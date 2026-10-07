import { Op } from "sequelize";
import { CorreiosPostagem, Usuario } from "../models/index.js";
import {
  buscarPedidosGiraKids,
  obterPedidoGiraKids,
} from "../services/giraKidsService.js";
import {
  cotarServicosVipp,
  criarPostagemVipp,
  baixarPdfsPostagemVipp,
} from "../services/vippService.js";

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

// Pedidos sendo gravados agora — evita duas gravações simultâneas do mesmo
// pedido (duplo clique / duas abas).
const gravacoesEmAndamento = new Set();

const resumoPostagem = (postagem) =>
  postagem && {
    id: postagem.id,
    etiqueta: postagem.etiqueta,
    servico: postagem.servico,
    valorFrete: postagem.valorFrete != null ? Number(postagem.valorFrete) : null,
    vippIdConhecimento: postagem.vippIdConhecimento,
    criadoEm: postagem.createdAt,
    criadoPor: postagem.usuario?.nome || null,
  };

const buscarPostagensDosPedidos = async (pedidoIds) => {
  if (!pedidoIds.length) return new Map();
  const postagens = await CorreiosPostagem.findAll({
    where: { pedidoGiraKidsId: { [Op.in]: pedidoIds } },
    include: [{ model: Usuario, as: "usuario", attributes: ["nome"] }],
    order: [["createdAt", "DESC"]],
  });
  const mapa = new Map();
  postagens.forEach((postagem) => {
    if (!mapa.has(postagem.pedidoGiraKidsId)) {
      mapa.set(postagem.pedidoGiraKidsId, resumoPostagem(postagem));
    }
  });
  return mapa;
};

const responderErro = (res, error, mensagemPadrao) => {
  console.error(`[Correios] ${mensagemPadrao}:`, error);
  const configuracao = /^Configure /.test(error.message || "");
  res.status(error.status || (configuracao ? 500 : 502)).json({
    error: error.message || mensagemPadrao,
  });
};

export const buscarPedidos = async (req, res) => {
  try {
    const nome = String(req.query.nome || "").trim().slice(0, 100);
    const { inicio, fim } = req.query;

    if (!FORMATO_DATA.test(String(inicio)) || !FORMATO_DATA.test(String(fim))) {
      return res.status(400).json({ error: "Informe o período (de / até)." });
    }
    if (inicio > fim) {
      return res.status(400).json({ error: "A data inicial é maior que a final." });
    }

    const { pedidos, temMais } = await buscarPedidosGiraKids({ nome, inicio, fim });
    const postagens = await buscarPostagensDosPedidos(pedidos.map((p) => p.id));

    res.json({
      pedidos: pedidos.map((pedido) => ({
        ...pedido,
        postagem: postagens.get(pedido.id) || null,
      })),
      temMais,
    });
  } catch (error) {
    responderErro(res, error, "Erro ao buscar pedidos na Gira Kids");
  }
};

export const detalharPedido = async (req, res) => {
  try {
    const pedido = await obterPedidoGiraKids(req.params.id);
    const postagens = await buscarPostagensDosPedidos([pedido.id]);
    res.json({ ...pedido, postagem: postagens.get(pedido.id) || null });
  } catch (error) {
    responderErro(res, error, "Erro ao abrir o pedido na Gira Kids");
  }
};

export const cotar = async (req, res) => {
  try {
    const resultado = await cotarServicosVipp(req.body || {});
    res.json(resultado);
  } catch (error) {
    const validacao = /inválido|Informe|Peso deve/.test(error.message || "");
    if (validacao) return res.status(400).json({ error: error.message });
    responderErro(res, error, "Erro ao cotar no VIPP");
  }
};

export const criarPostagem = async (req, res) => {
  const { pedidoId, destinatario, carga, servicoId, forcar } = req.body || {};

  if (!pedidoId || !destinatario || !carga || !servicoId) {
    return res.status(400).json({ error: "Dados da postagem incompletos." });
  }
  if (gravacoesEmAndamento.has(pedidoId)) {
    return res
      .status(409)
      .json({ error: "Este pedido já está sendo gravado. Aguarde." });
  }

  gravacoesEmAndamento.add(pedidoId);
  try {
    const existentes = await buscarPostagensDosPedidos([pedidoId]);
    if (existentes.has(pedidoId) && forcar !== true) {
      return res.status(409).json({
        error: "Este pedido já foi postado no VIPP.",
        postagem: existentes.get(pedidoId),
      });
    }

    // Busca o pedido de novo na Gira Kids: número e cliente vêm da fonte,
    // não do navegador.
    const pedido = await obterPedidoGiraKids(pedidoId);

    const resultado = await criarPostagemVipp({
      destinatario,
      carga,
      servicoId,
      observacao: pedido.numero ? `PEDIDO GIRA KIDS ${pedido.numero}` : "",
    });

    const postagem = await CorreiosPostagem.create({
      pedidoGiraKidsId: pedido.id,
      numeroPedido: pedido.numero ? String(pedido.numero) : null,
      cliente: pedido.cliente,
      vippIdConhecimento: resultado.idConhecimento,
      etiqueta: resultado.etiqueta || null,
      servico: resultado.servico.nome,
      valorFrete: resultado.servico.valor || null,
      usuarioId: req.usuario.id,
    });

    res.status(201).json({
      postagemId: postagem.id,
      etiqueta: resultado.etiqueta,
      servico: resultado.servico,
      arquivos: resultado.arquivos,
      errosPdf: resultado.errosPdf,
    });
  } catch (error) {
    const validacao = /^Preencha|inválido|Informe|Peso deve|não está disponível|indisponível/.test(
      error.message || "",
    );
    if (validacao) return res.status(400).json({ error: error.message });
    responderErro(res, error, "Erro ao criar a postagem no VIPP");
  } finally {
    gravacoesEmAndamento.delete(pedidoId);
  }
};

export const baixarPdfs = async (req, res) => {
  try {
    const postagem = await CorreiosPostagem.findByPk(req.params.id);
    if (!postagem) {
      return res.status(404).json({ error: "Postagem não encontrada." });
    }
    const { arquivos } = await baixarPdfsPostagemVipp(postagem.vippIdConhecimento);
    res.json({
      arquivos: arquivos.map((arquivo) => ({
        ...arquivo,
        nome: arquivo.nome.replace(
          postagem.vippIdConhecimento,
          postagem.etiqueta || postagem.vippIdConhecimento,
        ),
      })),
    });
  } catch (error) {
    responderErro(res, error, "Erro ao baixar os PDFs no VIPP");
  }
};
