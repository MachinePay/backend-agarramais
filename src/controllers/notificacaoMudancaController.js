import {
  NotificacaoMudanca,
  Maquina,
  Loja,
  Usuario,
  Produto,
} from "../models/index.js";

const includePadrao = [
  {
    model: Maquina,
    as: "maquina",
    attributes: ["id", "nome", "codigo", "capacidadePadrao"],
  },
  { model: Loja, as: "loja", attributes: ["id", "nome"] },
  { model: Usuario, as: "usuario", attributes: ["id", "nome"] },
  { model: Usuario, as: "resolvidoPor", attributes: ["id", "nome"] },
  { model: Produto, as: "produtoAnterior", attributes: ["id", "nome", "emoji"] },
  { model: Produto, as: "produtoNovo", attributes: ["id", "nome", "emoji"] },
];

const inteiroOuNull = (valor) => {
  const numero = parseInt(valor, 10);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
};

export const criarNotificacaoMudanca = async (req, res) => {
  try {
    const {
      tipo = "TROCA_PRODUTO",
      maquinaId,
      produtoAnteriorId,
      produtoNovoId,
      capacidadeSugerida,
      observacao,
    } = req.body;

    if (!maquinaId) {
      return res.status(400).json({ error: "maquinaId é obrigatório." });
    }

    const maquina = await Maquina.findByPk(maquinaId);
    if (!maquina) {
      return res.status(404).json({ error: "Máquina não encontrada." });
    }

    const notificacao = await NotificacaoMudanca.create({
      tipo,
      maquinaId,
      lojaId: maquina.lojaId,
      usuarioId: req.usuario.id,
      produtoAnteriorId: produtoAnteriorId || null,
      produtoNovoId: produtoNovoId || null,
      capacidadeAnterior: maquina.capacidadePadrao ?? null,
      capacidadeSugerida: inteiroOuNull(capacidadeSugerida),
      observacao: observacao?.trim() || null,
    });

    res.status(201).json(notificacao);
  } catch (error) {
    console.error("Erro ao criar notificação de mudança:", error);
    res.status(500).json({ error: "Erro ao criar notificação de mudança." });
  }
};

export const listarNotificacoesMudanca = async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (["PENDENTE", "APLICADA", "RECUSADA"].includes(status)) {
      where.status = status;
    }

    const notificacoes = await NotificacaoMudanca.findAll({
      where,
      include: includePadrao,
      order: [["createdAt", "DESC"]],
      limit: 500,
    });
    res.json(notificacoes);
  } catch (error) {
    console.error("Erro ao listar notificações de mudança:", error);
    res.status(500).json({ error: "Erro ao listar notificações de mudança." });
  }
};

export const contarNotificacoesPendentes = async (req, res) => {
  try {
    const pendentes = await NotificacaoMudanca.count({
      where: { status: "PENDENTE" },
    });
    res.json({ pendentes });
  } catch (error) {
    console.error("Erro ao contar notificações de mudança:", error);
    res.status(500).json({ error: "Erro ao contar notificações de mudança." });
  }
};

// Aplica o pedido: grava o novo padrão na máquina. O admin pode ajustar o
// valor sugerido pelo operador antes de aplicar.
export const aplicarNotificacaoMudanca = async (req, res) => {
  try {
    const notificacao = await NotificacaoMudanca.findByPk(req.params.id);
    if (!notificacao) {
      return res.status(404).json({ error: "Notificação não encontrada." });
    }
    if (notificacao.status !== "PENDENTE") {
      return res
        .status(400)
        .json({ error: "Esta notificação já foi resolvida." });
    }

    const capacidade =
      inteiroOuNull(req.body?.capacidade) ?? notificacao.capacidadeSugerida;
    if (capacidade === null || capacidade <= 0) {
      return res
        .status(400)
        .json({ error: "Informe um padrão (capacidade) maior que zero." });
    }

    const maquina = await Maquina.findByPk(notificacao.maquinaId);
    if (!maquina) {
      return res.status(404).json({ error: "Máquina não encontrada." });
    }

    await maquina.update({ capacidadePadrao: capacidade });
    await notificacao.update({
      status: "APLICADA",
      capacidadeAplicada: capacidade,
      resolvidoPorId: req.usuario.id,
      resolvidoEm: new Date(),
    });

    res.json(await NotificacaoMudanca.findByPk(notificacao.id, {
      include: includePadrao,
    }));
  } catch (error) {
    console.error("Erro ao aplicar notificação de mudança:", error);
    res.status(500).json({ error: "Erro ao aplicar notificação de mudança." });
  }
};

export const recusarNotificacaoMudanca = async (req, res) => {
  try {
    const notificacao = await NotificacaoMudanca.findByPk(req.params.id);
    if (!notificacao) {
      return res.status(404).json({ error: "Notificação não encontrada." });
    }
    if (notificacao.status !== "PENDENTE") {
      return res
        .status(400)
        .json({ error: "Esta notificação já foi resolvida." });
    }

    await notificacao.update({
      status: "RECUSADA",
      resolvidoPorId: req.usuario.id,
      resolvidoEm: new Date(),
    });

    res.json(await NotificacaoMudanca.findByPk(notificacao.id, {
      include: includePadrao,
    }));
  } catch (error) {
    console.error("Erro ao recusar notificação de mudança:", error);
    res.status(500).json({ error: "Erro ao recusar notificação de mudança." });
  }
};
