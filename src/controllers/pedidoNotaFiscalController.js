import { Op } from "sequelize";
import { PedidoNotaFiscal } from "../models/index.js";
import {
  buscarNotasRecebidas,
  buscarNotaPorPedido,
} from "../services/nfemailService.js";

const camposEditaveis = [
  "clienteNome",
  "numeroPedido",
  "dataPedido",
  "numeroNota",
  "dataNota",
  "tipoFrete",
  "transportadora",
  "numeroColeta",
  "teveCotacao",
  "dataCotacao",
  "valorNota",
  "chaveAcessoNFe",
  "observacoes",
];

const extrairPayload = (body) => {
  const payload = {};
  for (const campo of camposEditaveis) {
    if (body[campo] !== undefined) payload[campo] = body[campo];
  }
  return payload;
};

const pedidoNotaFiscalController = {
  async criar(req, res) {
    try {
      const payload = extrairPayload(req.body);

      if (!payload.clienteNome || !String(payload.clienteNome).trim()) {
        return res.status(400).json({ error: "clienteNome é obrigatório." });
      }
      if (!payload.numeroPedido || !String(payload.numeroPedido).trim()) {
        return res.status(400).json({ error: "numeroPedido é obrigatório." });
      }

      const registro = await PedidoNotaFiscal.create({
        ...payload,
        usuarioId: req.usuario?.id || null,
        origemDados: "MANUAL",
      });

      return res.status(201).json(registro);
    } catch (error) {
      console.error("Erro ao criar pedido/nota fiscal:", error);
      return res.status(500).json({ error: "Erro ao criar pedido/nota fiscal." });
    }
  },

  async listar(req, res) {
    try {
      const { clienteNome, numeroPedido, dataInicio, dataFim, teveCotacao } =
        req.query;

      const where = {};
      if (clienteNome) where.clienteNome = { [Op.iLike]: `%${clienteNome}%` };
      if (numeroPedido) where.numeroPedido = { [Op.iLike]: `%${numeroPedido}%` };
      if (teveCotacao !== undefined) where.teveCotacao = teveCotacao === "true";

      if (dataInicio || dataFim) {
        where.dataPedido = {
          [Op.between]: [
            dataInicio || "1970-01-01",
            dataFim || new Date().toISOString().slice(0, 10),
          ],
        };
      }

      const registros = await PedidoNotaFiscal.findAll({
        where,
        order: [["dataPedido", "DESC"], ["createdAt", "DESC"]],
      });

      return res.json(registros);
    } catch (error) {
      console.error("Erro ao listar pedidos/notas fiscais:", error);
      return res
        .status(500)
        .json({ error: "Erro ao listar pedidos/notas fiscais." });
    }
  },

  async atualizar(req, res) {
    try {
      const { id } = req.params;
      const payload = extrairPayload(req.body);

      const registro = await PedidoNotaFiscal.findByPk(id);
      if (!registro) {
        return res.status(404).json({ error: "Registro não encontrado." });
      }

      await registro.update(payload);
      return res.json(registro);
    } catch (error) {
      console.error("Erro ao atualizar pedido/nota fiscal:", error);
      return res
        .status(500)
        .json({ error: "Erro ao atualizar pedido/nota fiscal." });
    }
  },

  async excluir(req, res) {
    try {
      const { id } = req.params;
      const excluidas = await PedidoNotaFiscal.destroy({ where: { id } });

      if (!excluidas) {
        return res.status(404).json({ error: "Registro não encontrado." });
      }

      return res.json({ success: true, id });
    } catch (error) {
      console.error("Erro ao excluir pedido/nota fiscal:", error);
      return res
        .status(500)
        .json({ error: "Erro ao excluir pedido/nota fiscal." });
    }
  },

  async excluirEmLote(req, res) {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res
          .status(400)
          .json({ error: "Informe um array de ids para exclusão em lote." });
      }

      const idsValidos = ids
        .map((item) => String(item || "").trim())
        .filter((item) => item.length > 0);

      const excluidas = await PedidoNotaFiscal.destroy({
        where: { id: { [Op.in]: idsValidos } },
      });

      return res.json({
        success: true,
        solicitadas: idsValidos.length,
        excluidas,
      });
    } catch (error) {
      console.error("Erro ao excluir pedidos/notas fiscais em lote:", error);
      return res
        .status(500)
        .json({ error: "Erro ao excluir pedidos/notas fiscais em lote." });
    }
  },

  // Preenche numeroNota/dataNota/tipoFrete/transportadora/valorNota a partir
  // da NFeMail, casando pelo numeroPedido. Nunca sobrescreve numeroColeta ou
  // teveCotacao/dataCotacao, que são controle interno do time comercial.
  async sincronizarNFeMail(req, res) {
    try {
      const { numeroPedido, dataInicial, dataFinal } = req.body || {};

      const notas = numeroPedido
        ? await buscarNotaPorPedido(numeroPedido)
        : await buscarNotasRecebidas({ dataInicial, dataFinal });

      if (notas.length === 0) {
        return res.json({ atualizados: 0, criados: 0, notasEncontradas: 0 });
      }

      let atualizados = 0;
      let criados = 0;

      for (const nota of notas) {
        if (!nota.numeroPedido) continue;

        const existente = await PedidoNotaFiscal.findOne({
          where: { numeroPedido: nota.numeroPedido },
        });

        const dadosNota = {
          numeroNota: nota.numeroNota ?? existente?.numeroNota ?? null,
          dataNota: nota.dataNota ?? existente?.dataNota ?? null,
          tipoFrete: nota.tipoFrete ?? existente?.tipoFrete ?? null,
          transportadora:
            nota.transportadora ?? existente?.transportadora ?? null,
          valorNota: nota.valorNota ?? existente?.valorNota ?? null,
          chaveAcessoNFe:
            nota.chaveAcessoNFe ?? existente?.chaveAcessoNFe ?? null,
          origemDados: "NFEMAIL",
        };

        if (existente) {
          await existente.update(dadosNota);
          atualizados += 1;
        } else if (nota.clienteNome) {
          await PedidoNotaFiscal.create({
            clienteNome: nota.clienteNome,
            numeroPedido: nota.numeroPedido,
            usuarioId: req.usuario?.id || null,
            ...dadosNota,
          });
          criados += 1;
        }
      }

      return res.json({ atualizados, criados, notasEncontradas: notas.length });
    } catch (error) {
      console.error("Erro ao sincronizar com a NFeMail:", error);
      return res
        .status(error.status || 500)
        .json({ error: error.message || "Erro ao sincronizar com a NFeMail." });
    }
  },
};

export default pedidoNotaFiscalController;
