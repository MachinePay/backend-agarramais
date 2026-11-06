import { sequelize } from "../database/connection.js";
import {
  ListaComprasPendente,
  ListaComprasLoja,
  ListaComprasProduto,
} from "../models/index.js";

const incluirLojasEProdutos = [
  {
    model: ListaComprasLoja,
    as: "lojas",
    include: [{ model: ListaComprasProduto, as: "produtos" }],
  },
];

const listaComprasPendenteController = {
  // GET /lista-compras-pendentes
  async listar(req, res) {
    try {
      const listas = await ListaComprasPendente.findAll({
        order: [["criadoEm", "DESC"]],
        include: [
          {
            model: ListaComprasLoja,
            as: "lojas",
            include: [{ model: ListaComprasProduto, as: "produtos" }],
          },
        ],
      });
      return res.json(listas);
    } catch (err) {
      console.error("Erro ao listar listas de compras:", err);
      return res
        .status(500)
        .json({ error: "Erro ao listar listas de compras." });
    }
  },

  // POST /lista-compras-pendentes
  async criar(req, res) {
    const t = await sequelize.transaction();
    try {
      const { lojas, usuarioId } = req.body;

      if (!Array.isArray(lojas) || lojas.length === 0) {
        await t.rollback();
        return res.status(400).json({ error: "lojas é obrigatório." });
      }

      const lista = await ListaComprasPendente.create(
        { usuarioId: usuarioId ?? req.usuario?.id ?? null },
        { transaction: t },
      );

      for (const lojaData of lojas) {
        const listaLoja = await ListaComprasLoja.create(
          {
            listaId: lista.id,
            lojaId: lojaData.lojaId,
            lojaNome: lojaData.lojaNome,
          },
          { transaction: t },
        );

        if (Array.isArray(lojaData.produtos)) {
          await ListaComprasProduto.bulkCreate(
            lojaData.produtos.map((p) => ({
              listaLojaId: listaLoja.id,
              produtoKey: p.key,
              produtoId: p.produtoId ?? null,
              produtoNome: p.produtoNome,
              produtoEmoji: p.produtoEmoji ?? "📦",
              produtoCodigo: p.produtoCodigo ?? "",
              quantidade: Number(p.quantidade) || 0,
            })),
            { transaction: t },
          );
        }
      }

      await t.commit();

      const criada = await ListaComprasPendente.findByPk(lista.id, {
        include: [
          {
            model: ListaComprasLoja,
            as: "lojas",
            include: [{ model: ListaComprasProduto, as: "produtos" }],
          },
        ],
      });
      return res.status(201).json(criada);
    } catch (err) {
      await t.rollback();
      console.error("Erro ao criar lista de compras:", err);
      return res.status(500).json({ error: "Erro ao criar lista de compras." });
    }
  },

  // DELETE /lista-compras-pendentes/:id
  async excluir(req, res) {
    try {
      const { id } = req.params;
      const lista = await ListaComprasPendente.findByPk(id);
      if (!lista) {
        return res.status(404).json({ error: "Lista não encontrada." });
      }
      // Cascata manual pois o Sequelize sync não garante ON DELETE CASCADE via FK
      const lojas = await ListaComprasLoja.findAll({ where: { listaId: id } });
      const lojaIds = lojas.map((l) => l.id);
      if (lojaIds.length > 0) {
        await ListaComprasProduto.destroy({ where: { listaLojaId: lojaIds } });
      }
      await ListaComprasLoja.destroy({ where: { listaId: id } });
      await lista.destroy();
      return res.status(204).send();
    } catch (err) {
      console.error("Erro ao excluir lista de compras:", err);
      return res
        .status(500)
        .json({ error: "Erro ao excluir lista de compras." });
    }
  },

  // DELETE /lista-compras-pendentes/:id/produto/:produtoId
  // Remove um produto específico de uma loja do pendente
  async removerProduto(req, res) {
    try {
      const { id, produtoId } = req.params;
      const { lojaId } = req.query;

      if (!lojaId) {
        return res
          .status(400)
          .json({ error: "lojaId é obrigatório na query." });
      }

      const listaLoja = await ListaComprasLoja.findOne({
        where: { listaId: id, lojaId },
      });
      if (!listaLoja) {
        return res
          .status(404)
          .json({ error: "Loja não encontrada no pendente." });
      }

      await ListaComprasProduto.destroy({
        where: { listaLojaId: listaLoja.id, produtoKey: produtoId },
      });

      // Se não sobrar nenhum produto na loja, remove a loja
      const restantes = await ListaComprasProduto.count({
        where: { listaLojaId: listaLoja.id },
      });
      if (restantes === 0) {
        await listaLoja.destroy();

        // Se não sobrar nenhuma loja, remove a lista
        const restantesLojas = await ListaComprasLoja.count({
          where: { listaId: id },
        });
        if (restantesLojas === 0) {
          await ListaComprasPendente.destroy({ where: { id } });
          return res.status(204).send();
        }
      }

      const atualizada = await ListaComprasPendente.findByPk(id, {
        include: [
          {
            model: ListaComprasLoja,
            as: "lojas",
            include: [{ model: ListaComprasProduto, as: "produtos" }],
          },
        ],
      });
      return res.json(atualizada);
    } catch (err) {
      console.error("Erro ao remover produto do pendente:", err);
      return res.status(500).json({ error: "Erro ao remover produto." });
    }
  },

  // PUT /lista-compras-pendentes/:id/produto/:produtoId?lojaId=
  // Corrige a quantidade de um produto antes de enviar pro estoque.
  async atualizarQuantidade(req, res) {
    try {
      const { id, produtoId } = req.params;
      const { lojaId } = req.query;
      const quantidade = parseInt(req.body?.quantidade, 10);

      if (!lojaId) {
        return res
          .status(400)
          .json({ error: "lojaId é obrigatório na query." });
      }
      if (!Number.isFinite(quantidade) || quantidade <= 0) {
        return res.status(400).json({
          error: "Quantidade inválida. Para tirar o produto, use remover.",
        });
      }

      const listaLoja = await ListaComprasLoja.findOne({
        where: { listaId: id, lojaId },
      });
      if (!listaLoja) {
        return res
          .status(404)
          .json({ error: "Loja não encontrada no pendente." });
      }

      const [atualizados] = await ListaComprasProduto.update(
        { quantidade },
        { where: { listaLojaId: listaLoja.id, produtoKey: produtoId } },
      );
      if (atualizados === 0) {
        return res
          .status(404)
          .json({ error: "Produto não encontrado no pendente." });
      }

      const atualizada = await ListaComprasPendente.findByPk(id, {
        include: incluirLojasEProdutos,
      });
      return res.json(atualizada);
    } catch (err) {
      console.error("Erro ao atualizar quantidade do pendente:", err);
      return res.status(500).json({ error: "Erro ao atualizar quantidade." });
    }
  },

  // POST /lista-compras-pendentes/:id/produto
  // Adiciona um produto numa loja do pendente (cria a loja se não estiver
  // na lista). Se o produto já estiver lá, soma a quantidade.
  async adicionarProduto(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const {
        lojaId,
        lojaNome,
        key,
        produtoId,
        produtoNome,
        produtoEmoji,
        produtoCodigo,
      } = req.body || {};
      const quantidade = parseInt(req.body?.quantidade, 10);

      if (!lojaId || !key || !produtoNome) {
        await t.rollback();
        return res
          .status(400)
          .json({ error: "Loja e produto são obrigatórios." });
      }
      if (!Number.isFinite(quantidade) || quantidade <= 0) {
        await t.rollback();
        return res.status(400).json({ error: "Informe a quantidade." });
      }

      const lista = await ListaComprasPendente.findByPk(id, {
        transaction: t,
      });
      if (!lista) {
        await t.rollback();
        return res.status(404).json({ error: "Lista não encontrada." });
      }

      const [listaLoja] = await ListaComprasLoja.findOrCreate({
        where: { listaId: id, lojaId },
        defaults: { listaId: id, lojaId, lojaNome: lojaNome || "" },
        transaction: t,
      });

      const existente = await ListaComprasProduto.findOne({
        where: { listaLojaId: listaLoja.id, produtoKey: key },
        transaction: t,
      });
      if (existente) {
        await existente.update(
          { quantidade: existente.quantidade + quantidade },
          { transaction: t },
        );
      } else {
        await ListaComprasProduto.create(
          {
            listaLojaId: listaLoja.id,
            produtoKey: key,
            produtoId: produtoId ?? null,
            produtoNome,
            produtoEmoji: produtoEmoji || "📦",
            produtoCodigo: produtoCodigo || "",
            quantidade,
          },
          { transaction: t },
        );
      }

      await t.commit();

      const atualizada = await ListaComprasPendente.findByPk(id, {
        include: incluirLojasEProdutos,
      });
      return res.status(201).json(atualizada);
    } catch (err) {
      await t.rollback();
      console.error("Erro ao adicionar produto ao pendente:", err);
      return res.status(500).json({ error: "Erro ao adicionar produto." });
    }
  },
};

export default listaComprasPendenteController;
