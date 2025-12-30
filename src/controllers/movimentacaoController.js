import {
  Movimentacao,
  MovimentacaoProduto,
  Maquina,
  Usuario,
  Produto,
  EstoqueLoja,
  Loja,
} from "../models/index.js";
import { Op } from "sequelize";

// US08, US09, US10 - Registrar movimentação completa
export const registrarMovimentacao = async (req, res) => {
  try {
    const {
      maquinaId,
      dataColeta,
      totalPre,
      sairam,
      abastecidas,
      fichas,
      contadorMaquina,
      contadorIn,
      contadorOut,
      observacoes,
      tipoOcorrencia,
      retiradaEstoque,
      produtos, // Array de { produtoId, quantidadeSaiu, quantidadeAbastecida }
      quantidade_notas_entrada,
      valor_entrada_maquininha_pix,
    } = req.body;

    // Validações
    if (
      !maquinaId ||
      totalPre === undefined ||
      sairam === undefined ||
      abastecidas === undefined
    ) {
      return res.status(400).json({
        error: "maquinaId, totalPre, sairam e abastecidas são obrigatórios",
      });
    }

    // Buscar máquina para pegar valorFicha
    const maquina = await Maquina.findByPk(maquinaId);
    if (!maquina) {
      return res.status(404).json({ error: "Máquina não encontrada" });
    }

    // Calcular valor faturado: fichas + notas + digital
    const valorFaturado =
      (fichas ? fichas * parseFloat(maquina.valorFicha) : 0) +
      (quantidade_notas_entrada ? parseFloat(quantidade_notas_entrada) : 0) +
      (valor_entrada_maquininha_pix
        ? parseFloat(valor_entrada_maquininha_pix)
        : 0);

    // Criar movimentação
    const movimentacao = await Movimentacao.create({
      maquinaId,
      usuarioId: req.usuario.id,
      dataColeta: dataColeta || new Date(),
      totalPre,
      sairam,
      abastecidas,
      fichas: fichas || 0,
      contadorMaquina,
      contadorIn,
      contadorOut,
      valorFaturado,
      observacoes,
      tipoOcorrencia: tipoOcorrencia || "Normal",
      retiradaEstoque: retiradaEstoque || false,
      quantidade_notas_entrada: quantidade_notas_entrada ?? null,
      valor_entrada_maquininha_pix: valor_entrada_maquininha_pix ?? null,
    });

    // Se produtos foram informados, registrar detalhes
    if (produtos && produtos.length > 0) {
      const detalhesProdutos = produtos.map((p) => ({
        movimentacaoId: movimentacao.id,
        produtoId: p.produtoId,
        quantidadeSaiu: p.quantidadeSaiu || 0,
        quantidadeAbastecida: p.quantidadeAbastecida || 0,
      }));

      await MovimentacaoProduto.bulkCreate(detalhesProdutos);

      // Descontar do estoque da loja os produtos abastecidos
      for (const produto of produtos) {
        if (produto.quantidadeAbastecida && produto.quantidadeAbastecida > 0) {
          // Buscar estoque do produto na loja da máquina
          const estoqueLoja = await EstoqueLoja.findOne({
            where: {
              lojaId: maquina.lojaId,
              produtoId: produto.produtoId,
            },
          });

          if (estoqueLoja) {
            // Descontar a quantidade abastecida (não permite ficar negativo)
            const novaQuantidade = Math.max(
              0,
              estoqueLoja.quantidade - produto.quantidadeAbastecida
            );
            await estoqueLoja.update({ quantidade: novaQuantidade });
          }
        }
      }
    }

    // Buscar movimentação completa para retornar
    const movimentacaoCompleta = await Movimentacao.findByPk(movimentacao.id, {
      include: [
        {
          model: Maquina,
          as: "maquina",
          attributes: ["id", "codigo", "nome"],
        },
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nome", "email"],
        },
        {
          model: MovimentacaoProduto,
          as: "detalhesProdutos",
          include: [
            {
              model: Produto,
              as: "produto",
              attributes: ["id", "nome", "categoria"],
            },
          ],
        },
      ],
    });

    res.locals.entityId = movimentacao.id;
    res.status(201).json(movimentacaoCompleta);
  } catch (error) {
    console.error("Erro ao registrar movimentação:", error);
    res.status(500).json({ error: "Erro ao registrar movimentação" });
  }
};

// Listar movimentações com filtros
export const listarMovimentacoes = async (req, res) => {
  try {
    const {
      maquinaId,
      lojaId,
      dataInicio,
      dataFim,
      usuarioId,
      limite = 50,
    } = req.query;

    const where = {};

    if (maquinaId) {
      where.maquinaId = maquinaId;
    }

    if (usuarioId) {
      where.usuarioId = usuarioId;
    }

    if (dataInicio || dataFim) {
      where.dataColeta = {};
      if (dataInicio) {
        where.dataColeta[Op.gte] = new Date(dataInicio);
      }
      if (dataFim) {
        where.dataColeta[Op.lte] = new Date(dataFim);
      }
    }

    const include = [
      {
        model: Maquina,
        as: "maquina",
        attributes: ["id", "codigo", "nome", "lojaId"],
      },
      {
        model: Usuario,
        as: "usuario",
        attributes: ["id", "nome"],
      },
      {
        model: MovimentacaoProduto,
        as: "detalhesProdutos",
        include: [
          {
            model: Produto,
            as: "produto",
            attributes: ["id", "nome"],
          },
        ],
      },
    ];

    // Filtrar por loja se especificado
    if (lojaId) {
      include[0].where = { lojaId };
    }

    const movimentacoes = await Movimentacao.findAll({
      where,
      include,
      order: [["dataColeta", "DESC"]],
      limit: parseInt(limite),
    });

    res.json(movimentacoes);
  } catch (error) {
    console.error("Erro ao listar movimentações:", error);
    res.status(500).json({ error: "Erro ao listar movimentações" });
  }
};

// Obter movimentação por ID
export const obterMovimentacao = async (req, res) => {
  try {
    const movimentacao = await Movimentacao.findByPk(req.params.id, {
      include: [
        {
          model: Maquina,
          as: "maquina",
          include: [
            {
              model: Loja,
              as: "loja",
              attributes: ["id", "nome"],
            },
          ],
        },
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nome", "email"],
        },
        {
          model: MovimentacaoProduto,
          as: "detalhesProdutos",
          include: [
            {
              model: Produto,
              as: "produto",
            },
          ],
        },
      ],
    });

    if (!movimentacao) {
      return res.status(404).json({ error: "Movimentação não encontrada" });
    }

    res.json(movimentacao);
  } catch (error) {
    console.error("Erro ao obter movimentação:", error);
    res.status(500).json({ error: "Erro ao obter movimentação" });
  }
};

// Atualizar movimentação (apenas observações e detalhes menores)
export const atualizarMovimentacao = async (req, res) => {
  try {
    const movimentacao = await Movimentacao.findByPk(req.params.id);

    if (!movimentacao) {
      return res.status(404).json({ error: "Movimentação não encontrada" });
    }

    // Apenas admin ou o próprio usuário que criou pode editar
    if (
      req.usuario.role !== "ADMIN" &&
      movimentacao.usuarioId !== req.usuario.id
    ) {
      return res
        .status(403)
        .json({ error: "Você não pode editar esta movimentação" });
    }

    const {
      observacoes,
      tipoOcorrencia,
      fichas,
      abastecidas,
      contadorIn,
      contadorOut,
      quantidade_notas_entrada,
      valor_entrada_maquininha_pix,
    } = req.body;

    // Preparar dados para atualização
    const updateData = {
      observacoes: observacoes ?? movimentacao.observacoes,
      tipoOcorrencia: tipoOcorrencia ?? movimentacao.tipoOcorrencia,
      fichas:
        fichas !== undefined ? parseInt(fichas) || 0 : movimentacao.fichas,
      abastecidas:
        abastecidas !== undefined
          ? parseInt(abastecidas) || 0
          : movimentacao.abastecidas,
      contadorIn:
        contadorIn !== undefined
          ? parseInt(contadorIn) || null
          : movimentacao.contadorIn,
      contadorOut:
        contadorOut !== undefined
          ? parseInt(contadorOut) || null
          : movimentacao.contadorOut,
      quantidade_notas_entrada:
        quantidade_notas_entrada !== undefined
          ? parseInt(quantidade_notas_entrada) || null
          : movimentacao.quantidade_notas_entrada,
      valor_entrada_maquininha_pix:
        valor_entrada_maquininha_pix !== undefined
          ? parseFloat(valor_entrada_maquininha_pix) || null
          : movimentacao.valor_entrada_maquininha_pix,
    };

    // Se fichas, notas ou digital foram atualizados, recalcular o valorFaturado
    if (
      fichas !== undefined ||
      quantidade_notas_entrada !== undefined ||
      valor_entrada_maquininha_pix !== undefined
    ) {
      const maquina = await Maquina.findByPk(movimentacao.maquinaId);
      if (maquina) {
        updateData.valorFaturado =
          updateData.fichas * parseFloat(maquina.valorFicha) +
          (updateData.quantidade_notas_entrada
            ? parseFloat(updateData.quantidade_notas_entrada)
            : 0) +
          (updateData.valor_entrada_maquininha_pix
            ? parseFloat(updateData.valor_entrada_maquininha_pix)
            : 0);
      }
    }

    await movimentacao.update(updateData);

    res.json(movimentacao);
  } catch (error) {
    console.error("Erro ao atualizar movimentação:", error);
    res.status(500).json({ error: "Erro ao atualizar movimentação" });
  }
};

// Deletar movimentação (apenas ADMIN)
export const deletarMovimentacao = async (req, res) => {
  try {
    const movimentacao = await Movimentacao.findByPk(req.params.id);

    if (!movimentacao) {
      return res.status(404).json({ error: "Movimentação não encontrada" });
    }

    await movimentacao.destroy();

    res.json({ message: "Movimentação deletada com sucesso" });
  } catch (error) {
    console.error("Erro ao deletar movimentação:", error);
    res.status(500).json({ error: "Erro ao deletar movimentação" });
  }
};
