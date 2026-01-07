import MovimentacaoEstoqueLoja from "../models/MovimentacaoEstoqueLoja.js";
import MovimentacaoEstoqueLojaProduto from "../models/MovimentacaoEstoqueLojaProduto.js";
import { Loja, Usuario, Produto } from "../models/index.js";

// Listar todas as movimentações de estoque de loja
export const listarMovimentacoesEstoqueLoja = async (req, res) => {
  try {
    const movimentacoes = await MovimentacaoEstoqueLoja.findAll({
      order: [["dataMovimentacao", "DESC"]],
      include: [
        { model: Loja, as: "loja", attributes: ["id", "nome"] },
        { model: Usuario, as: "usuario", attributes: ["id", "nome"] },
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
    // usuarioId será preenchido automaticamente pelo middleware de autenticação
    const usuarioId = req.usuario?.id;

    console.log("[DEBUG] Payload recebido:", req.body);

    // 1. Validação
    if (!lojaId || !Array.isArray(produtos) || produtos.length === 0) {
      console.error("[ERRO] Loja ou produtos ausentes", { lojaId, produtos });
      return res
        .status(400)
        .json({ error: "Loja e Produtos são obrigatórios." });
    }

    // 2. Criar a Movimentação (Header)
    const movimentacao = await MovimentacaoEstoqueLoja.create({
      lojaId,
      usuarioId,
      observacao,
      dataMovimentacao: dataMovimentacao || new Date(),
    });

    console.log("[DEBUG] Movimentacao criada ID:", movimentacao.id);

    // 3. Salvar produtos enviados (Itens)
    for (const [idx, item] of produtos.entries()) {
      try {
        await MovimentacaoEstoqueLojaProduto.create({
          movimentacaoEstoqueLojaId: movimentacao.id,
          produtoId: item.produtoId,
          quantidade: Number(item.quantidade),
          tipoMovimentacao: item.tipoMovimentacao || "saida", // Valor padrão caso não venha
        });
      } catch (err) {
        console.error(`[ERRO] Falha ao criar produto idx ${idx}:`, item, err);
        // Não vamos parar a requisição inteira se um produto falhar, mas logamos o erro.
        // Se quiser que pare tudo, use uma Transaction do Sequelize.
      }
    }

    // 4. Retornar movimentação completa com os produtos inclusos
    const movimentacaoCompleta = await MovimentacaoEstoqueLoja.findByPk(
      movimentacao.id,
      {
        include: [
          { model: Loja, as: "loja", attributes: ["id", "nome"] },
          { model: Usuario, as: "usuario", attributes: ["id", "nome"] },
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

    return res.status(201).json(movimentacaoCompleta);
  } catch (err) {
    console.error("[ERRO] Exception geral ao criar movimentação:", err);
    return res.status(500).json({
      error: "Erro interno ao criar movimentação",
      details: err.message,
    });
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

    // Atualiza campos
    movimentacao.lojaId = lojaId || movimentacao.lojaId;
    movimentacao.usuarioId = usuarioId || movimentacao.usuarioId;
    movimentacao.observacao = observacao || movimentacao.observacao;
    movimentacao.dataMovimentacao =
      dataMovimentacao || movimentacao.dataMovimentacao;

    // Se seu model tiver timestamps automáticos, não precisa desta linha:
    // movimentacao.atualizadoEm = new Date();

    await movimentacao.save();

    // Atualizar produtos enviados (Remove antigos e cria novos)
    if (Array.isArray(produtos)) {
      await MovimentacaoEstoqueLojaProduto.destroy({
        where: { movimentacaoEstoqueLojaId: movimentacao.id },
      });

      for (const item of produtos) {
        await MovimentacaoEstoqueLojaProduto.create({
          movimentacaoEstoqueLojaId: movimentacao.id,
          produtoId: item.produtoId,
          quantidade: Number(item.quantidade),
          tipoMovimentacao: item.tipoMovimentacao || "saida",
        });
      }
    }

    // Retornar movimentação completa
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

    return res.json(movimentacaoCompleta);
  } catch (error) {
    console.error("Erro ao editar:", error);
    return res.status(500).json({ error: "Erro ao editar movimentação" });
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

    // Remove os produtos associados primeiro
    await MovimentacaoEstoqueLojaProduto.destroy({
      where: { movimentacaoEstoqueLojaId: movimentacao.id },
    });

    // Remove a movimentação
    await movimentacao.destroy();

    return res.json({ message: "Movimentação excluída com sucesso" });
  } catch (error) {
    console.error("Erro ao excluir:", error);
    return res.status(500).json({ error: "Erro ao excluir movimentação" });
  }
};
