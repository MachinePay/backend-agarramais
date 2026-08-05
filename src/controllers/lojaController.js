import { sequelize } from "../database/connection.js";
import {
  Loja,
  Maquina,
  UsuarioLoja,
  Movimentacao,
  MovimentacaoProduto,
  AlertaMovimentacao,
  AlertaIgnorado,
  EstoqueLoja,
  MovimentacaoEstoqueLoja,
  MovimentacaoEstoqueLojaProduto,
  GastoFixoLoja,
  GastoTotalFixoLoja,
  FechamentoMensalRelatorio,
  Manutencao,
  ManutencaoUsuario,
  Sangria,
  RegistroDinheiro,
  GastoVariavel,
} from "../models/index.js";

const VALOR_FICHA_PADRAO_DEFAULT = 2.5;

const normalizarValorFichaPadrao = (valor) => {
  if (valor === undefined || valor === null || valor === "") {
    return { informado: false, valor: undefined };
  }

  const valorNormalizado = Number(
    typeof valor === "string" ? valor.replace(",", ".") : valor,
  );

  if (!Number.isFinite(valorNormalizado) || valorNormalizado <= 0) {
    return { informado: true, invalido: true };
  }

  return {
    informado: true,
    valor: Number(valorNormalizado.toFixed(2)),
  };
};

// US04 - Listar todas as lojas
export const listarLojas = async (req, res) => {
  try {
    let lojas;

    // Se for ADMIN, vê todas as lojas
    if (req.usuario.role === "ADMIN") {
      lojas = await Loja.findAll({
        include: [
          {
            model: Maquina,
            as: "maquinas",
            attributes: ["id", "codigo", "nome", "tipo", "ativo"],
          },
        ],
        order: [["nome", "ASC"]],
      });
    } else {
      // Funcionário vê apenas lojas permitidas
      const permissoes = await UsuarioLoja.findAll({
        where: { usuarioId: req.usuario.id },
        include: [
          {
            model: Loja,
            include: [
              {
                model: Maquina,
                as: "maquinas",
                attributes: ["id", "codigo", "nome", "tipo", "ativo"],
              },
            ],
          },
        ],
      });

      lojas = permissoes.map((p) => p.Loja);
    }

    res.json(lojas);
  } catch (error) {
    console.error("Erro ao listar lojas:", error);
    res.status(500).json({ error: "Erro ao listar lojas" });
  }
};

// US04 - Obter loja por ID
export const obterLoja = async (req, res) => {
  try {
    const loja = await Loja.findByPk(req.params.id, {
      include: [
        {
          model: Maquina,
          as: "maquinas",
        },
      ],
    });

    if (!loja) {
      return res.status(404).json({ error: "Loja não encontrada" });
    }

    res.json(loja);
  } catch (error) {
    console.error("Erro ao obter loja:", error);
    res.status(500).json({ error: "Erro ao obter loja" });
  }
};

// US04 - Criar loja
export const criarLoja = async (req, res) => {
  try {
    const {
      nome,
      endereco,
      cidade,
      estado,
      responsavel,
      telefone,
      valorFichaPadrao,
    } = req.body;

    if (!nome) {
      return res.status(400).json({ error: "Nome da loja é obrigatório" });
    }

    const valorFichaNormalizado = normalizarValorFichaPadrao(valorFichaPadrao);
    if (valorFichaNormalizado.invalido) {
      return res.status(400).json({
        error: "valorFichaPadrao deve ser um número maior que zero",
      });
    }

    const loja = await Loja.create({
      nome,
      endereco,
      cidade,
      estado,
      responsavel,
      telefone,
      valorFichaPadrao: valorFichaNormalizado.informado
        ? valorFichaNormalizado.valor
        : VALOR_FICHA_PADRAO_DEFAULT,
    });

    res.locals.entityId = loja.id;
    res.status(201).json(loja);
  } catch (error) {
    console.error("Erro ao criar loja:", error);
    res.status(500).json({ error: "Erro ao criar loja" });
  }
};

// US04 - Atualizar loja
export const atualizarLoja = async (req, res) => {
  try {
    const loja = await Loja.findByPk(req.params.id);

    if (!loja) {
      return res.status(404).json({ error: "Loja não encontrada" });
    }

    const {
      nome,
      endereco,
      cidade,
      estado,
      responsavel,
      telefone,
      ativo,
      valorFichaPadrao,
    } = req.body;

    const valorFichaNormalizado = normalizarValorFichaPadrao(valorFichaPadrao);
    if (valorFichaNormalizado.invalido) {
      return res.status(400).json({
        error: "valorFichaPadrao deve ser um número maior que zero",
      });
    }

    await loja.update({
      nome: nome ?? loja.nome,
      endereco: endereco ?? loja.endereco,
      cidade: cidade ?? loja.cidade,
      estado: estado ?? loja.estado,
      responsavel: responsavel ?? loja.responsavel,
      telefone: telefone ?? loja.telefone,
      valorFichaPadrao: valorFichaNormalizado.informado
        ? valorFichaNormalizado.valor
        : loja.valorFichaPadrao,
      ativo: ativo ?? loja.ativo,
    });

    res.json(loja);
  } catch (error) {
    console.error("Erro ao atualizar loja:", error);
    res.status(500).json({ error: "Erro ao atualizar loja" });
  }
};

// US04 - Deletar loja
export const deletarLoja = async (req, res) => {
  try {
    const loja = await Loja.findByPk(req.params.id);

    if (!loja) {
      return res.status(404).json({ error: "Loja não encontrada" });
    }

    // Verificar se já está inativa (segunda tentativa = hard delete)
    if (!loja.ativo) {
      // Hard delete - deletar permanentemente, incluindo registros dependentes
      const maquinas = await Maquina.findAll({
        where: { lojaId: loja.id },
        attributes: ["id"],
      });
      const maquinaIds = maquinas.map((m) => m.id);

      await sequelize.transaction(async (t) => {
        const movimentacoes = await Movimentacao.findAll({
          where: { maquinaId: maquinaIds },
          attributes: ["id"],
          transaction: t,
        });
        const movimentacaoIds = movimentacoes.map((m) => m.id);
        await MovimentacaoProduto.destroy({
          where: { movimentacaoId: movimentacaoIds },
          transaction: t,
        });
        await Movimentacao.destroy({
          where: { maquinaId: maquinaIds },
          transaction: t,
        });

        await AlertaMovimentacao.destroy({
          where: { lojaId: loja.id },
          transaction: t,
        });
        await AlertaIgnorado.destroy({
          where: { maquinaId: maquinaIds },
          transaction: t,
        });

        const movimentacoesEstoque = await MovimentacaoEstoqueLoja.findAll({
          where: { lojaId: loja.id },
          attributes: ["id"],
          transaction: t,
        });
        const movimentacaoEstoqueIds = movimentacoesEstoque.map((m) => m.id);
        await MovimentacaoEstoqueLojaProduto.destroy({
          where: { movimentacaoEstoqueLojaId: movimentacaoEstoqueIds },
          transaction: t,
        });
        await MovimentacaoEstoqueLoja.destroy({
          where: { lojaId: loja.id },
          transaction: t,
        });

        await EstoqueLoja.destroy({ where: { lojaId: loja.id }, transaction: t });
        await UsuarioLoja.destroy({ where: { lojaId: loja.id }, transaction: t });
        await GastoFixoLoja.destroy({ where: { lojaId: loja.id }, transaction: t });
        await GastoTotalFixoLoja.destroy({
          where: { lojaId: loja.id },
          transaction: t,
        });
        await FechamentoMensalRelatorio.destroy({
          where: { lojaId: loja.id },
          transaction: t,
        });

        const manutencoes = await Manutencao.findAll({
          where: { lojaId: loja.id },
          attributes: ["id"],
          transaction: t,
        });
        const manutencaoIds = manutencoes.map((m) => m.id);
        await ManutencaoUsuario.destroy({
          where: { manutencaoId: manutencaoIds },
          transaction: t,
        });
        await Manutencao.destroy({ where: { lojaId: loja.id }, transaction: t });

        await Sangria.destroy({ where: { lojaId: loja.id }, transaction: t });
        await GastoVariavel.destroy({
          where: { lojaId: loja.id },
          transaction: t,
        });
        await RegistroDinheiro.destroy({
          where: { lojaId: loja.id },
          transaction: t,
        });

        await Maquina.destroy({ where: { lojaId: loja.id }, transaction: t });
        await loja.destroy({ transaction: t });
      });

      return res.json({ message: "Loja deletada permanentemente" });
    }

    // Primeira tentativa: Soft delete (marcar como inativo)
    await loja.update({ ativo: false });
    res.json({ message: "Loja desativada com sucesso" });
  } catch (error) {
    console.error("Erro ao deletar loja:", error);
    res.status(500).json({ error: "Erro ao deletar loja" });
  }
};
