import {
  ResumoVendaLojaProduto,
  Movimentacao,
  MovimentacaoProduto,
  Loja,
  Produto,
} from "../models/index.js";
import { Op } from "sequelize";

// Gera e retorna o resumo de vendas por loja/produto (consulta dinâmica, não grava)
export const getResumoVendaLojaProduto = async (req, res) => {
  try {
    // Filtros opcionais
    const { loja, produto } = req.query;
    // Busca todas as lojas
    const lojas = await Loja.findAll();
    // Busca todos os produtos
    const produtos = await Produto.findAll();
    // Busca todas as movimentações
    const movimentacoes = await Movimentacao.findAll({
      include: [
        { model: Loja, as: "maquina", include: [{ model: Loja, as: "loja" }] },
        {
          model: MovimentacaoProduto,
          as: "detalhesProdutos",
          include: [{ model: Produto, as: "produto" }],
        },
      ],
    });
    // Monta o resumo
    const resumo = {};
    movimentacoes.forEach((mov) => {
      const lojaNome = mov.maquina?.loja?.nome;
      if (!lojaNome) return;
      mov.detalhesProdutos?.forEach((mp) => {
        if (!mp.produto) return;
        const produtoNome = mp.produto.nome;
        if (!resumo[lojaNome]) resumo[lojaNome] = {};
        if (!resumo[lojaNome][produtoNome]) resumo[lojaNome][produtoNome] = 0;
        resumo[lojaNome][produtoNome] += mp.quantidadeSaiu || 0;
      });
    });
    // Transforma em array
    let resultado = [];
    Object.entries(resumo).forEach(([loja, produtos]) => {
      Object.entries(produtos).forEach(([produto, quantidade]) => {
        resultado.push({ loja, produto, quantidade });
      });
    });
    // Filtros opcionais
    if (loja) resultado = resultado.filter((r) => r.loja === loja);
    if (produto) resultado = resultado.filter((r) => r.produto === produto);
    res.json(resultado);
  } catch (error) {
    console.error("Erro ao gerar resumo de vendas por loja/produto:", error);
    res
      .status(500)
      .json({ error: "Erro ao gerar resumo de vendas por loja/produto" });
  }
};
