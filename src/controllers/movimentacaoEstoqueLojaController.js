import MovimentacaoEstoqueLoja from "../models/MovimentacaoEstoqueLoja.js";
import MovimentacaoEstoqueLojaProduto from "../models/MovimentacaoEstoqueLojaProduto.js";
import { Loja, Usuario, Produto } from "../models/index.js";

// Listar todas as movimentações de estoque de loja
export const listarMovimentacoesEstoqueLoja = async (req, res) => {
  try {
    const movimentacoes = await MovimentacaoEstoqueLoja.findAll({
      order: [["dataMovimentacao", "DESC"]],
      include: [
        { model: Loja, attributes: ["id", "nome"] },
        { model: Usuario, attributes: ["id", "nome"] },
        {
          model: MovimentacaoEstoqueLojaProduto,
          as: "produtosEnviados",
          include: [
            { model: Produto, as: "produto", attributes: ["id", "nome"] },
          ],
        },
      ],
    });
    res.json(movimentacoes);
  } catch (error) {
    res.status(500).json({ error: "Erro ao listar movimentações" });
  }
};

// Criar nova movimentação
export const criarMovimentacaoEstoqueLoja = async (req, res) => {
  try {
    const { lojaId, produtos, observacao, dataMovimentacao } = req.body;
    // usuarioId será preenchido automaticamente
    const usuarioId = req.usuario?.id;
    console.log("[DEBUG] Payload recebido:", req.body);
    if (!lojaId || !Array.isArray(produtos) || produtos.length === 0) {
      console.error("[ERRO] Loja ou produtos ausentes", { lojaId, produtos });
      return res
        .status(400)
        .json({ error: "Loja e pelo menos um produto são obrigatórios" });
    }
    // Checar se todos os produtos têm produtoId, quantidade e tipoMovimentacao
    for (const [idx, item] of produtos.entries()) {
      if (!item.produtoId || !item.quantidade || !item.tipoMovimentacao) {
        console.error(`[ERRO] Produto inválido no índice ${idx}:`, item);
        return res.status(400).json({
          error:
            "Produto, quantidade e tipoMovimentacao são obrigatórios para cada item",
          item,
          idx,
        });
      }
    }
    const movimentacao = await MovimentacaoEstoqueLoja.create({
      lojaId,
      usuarioId,
      observacao,
      dataMovimentacao: dataMovimentacao || new Date(),
    });
    // Salvar produtos enviados
    for (const [idx, item] of produtos.entries()) {
      try {
        await MovimentacaoEstoqueLojaProduto.create({
          movimentacaoEstoqueLojaId: movimentacao.id,
          produtoId: item.produtoId,
          quantidade: item.quantidade,
          tipoMovimentacao: item.tipoMovimentacao,
        });
      } catch (err) {
        console.error(
          `[ERRO] Falha ao criar produto na movimentação (idx ${idx}):`,
          item,
          err
        );
        throw err;
      }
    }
    // Retornar movimentação com produtos
    const movimentacaoCompleta = await MovimentacaoEstoqueLoja.findByPk(
      movimentacao.id,
      {
        include: [
          { model: Loja, attributes: ["id", "nome"] },
          { model: Usuario, attributes: ["id", "nome"] },
          {
            model: MovimentacaoEstoqueLojaProduto,
            as: "produtosEnviados",
            include: [
              { model: Produto, as: "produto", attributes: ["id", "nome"] },
            ],
          },
        ],
      }
    );
    res.status(201).json(movimentacaoCompleta);
  } catch (error) {
    console.error("[ERRO] Exception geral ao criar movimentação:", error);
    res
      .status(500)
      .json({ error: "Erro ao criar movimentação", details: error.message });
  }
};

// Editar movimentação
export const editarMovimentacaoEstoqueLoja = async (req, res) => {
  try {
    const { id } = req.params;
    const { lojaId, usuarioId, produtos, observacao, dataMovimentacao } =
      req.body;
    const movimentacao = await MovimentacaoEstoqueLoja.findByPk(id);
    if (!movimentacao) {
      return res.status(404).json({ error: "Movimentação não encontrada" });
    }
    movimentacao.lojaId = lojaId || movimentacao.lojaId;
    movimentacao.usuarioId = usuarioId || movimentacao.usuarioId;
    movimentacao.observacao = observacao || movimentacao.observacao;
    movimentacao.dataMovimentacao =
      dataMovimentacao || movimentacao.dataMovimentacao;
    movimentacao.atualizadoEm = new Date();
    await movimentacao.save();
    // Atualizar produtos enviados
    if (Array.isArray(produtos)) {
      await MovimentacaoEstoqueLojaProduto.destroy({
        where: { movimentacaoEstoqueLojaId: movimentacao.id },
      });
      for (const item of produtos) {
        await MovimentacaoEstoqueLojaProduto.create({
          movimentacaoEstoqueLojaId: movimentacao.id,
          produtoId: item.produtoId,
          quantidade: item.quantidade,
        });
      }
    }
    // Retornar movimentação com produtos
    const movimentacaoCompleta = await MovimentacaoEstoqueLoja.findByPk(
      movimentacao.id,
      {
        include: [
          { model: Loja, attributes: ["id", "nome"] },
          { model: Usuario, attributes: ["id", "nome"] },
          {
            model: MovimentacaoEstoqueLojaProduto,
            as: "produtosEnviados",
            include: [
              { model: Produto, as: "produto", attributes: ["id", "nome"] },
            ],
          },
        ],
      }
    );
    res.json(movimentacaoCompleta);
  } catch (error) {
    res.status(500).json({ error: "Erro ao editar movimentação" });
  }
};

// Deletar movimentação
export const deletarMovimentacaoEstoqueLoja = async (req, res) => {
  try {
    const { id } = req.params;
    const movimentacao = await MovimentacaoEstoqueLoja.findByPk(id);
    if (!movimentacao) {
      return res.status(404).json({ error: "Movimentação não encontrada" });
    }
    await MovimentacaoEstoqueLojaProduto.destroy({
      where: { movimentacaoEstoqueLojaId: movimentacao.id },
    });
    await movimentacao.destroy();
    res.json({ message: "Movimentação excluída com sucesso" });
  } catch (error) {
    res.status(500).json({ error: "Erro ao excluir movimentação" });
  }
};
