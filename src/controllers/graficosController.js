// Controller exclusivo para gráficos
import RegistroDinheiro from "../models/RegistroDinheiro.js";

// Exemplo de agregação simples, pode ser expandido conforme necessidade dos gráficos
async function getDashboardGraficos(req, res) {
  try {
    // Buscar registros de dinheiro, pode adicionar filtros por data/loja se necessário
    const registros = await RegistroDinheiro.findAll();
    // Agregação por loja
    const totaisPorLoja = {};
    registros.forEach((reg) => {
      const lojaId = reg.lojaId || "SEM_LOJA";
      if (!totaisPorLoja[lojaId]) {
        totaisPorLoja[lojaId] = {
          lojaId,
          dinheiro: 0,
          cartaoPix: 0,
          cartaoPixLiquido: 0,
          taxaDeCartao: 0,
          percentualTaxaCartaoMedia: 0,
          gastoFixo: 0,
          gastoVariavel: 0,
          gastoProdutos: 0,
          gastoTotal: 0,
        };
      }
      totaisPorLoja[lojaId].dinheiro += Number(reg.valorDinheiro || 0);
      totaisPorLoja[lojaId].cartaoPix += Number(reg.valorCartaoPix || 0);
      totaisPorLoja[lojaId].cartaoPixLiquido += Number(
        reg.valorCartaoPixLiquido || 0,
      );
      totaisPorLoja[lojaId].taxaDeCartao += Number(reg.taxaDeCartao || 0);
      totaisPorLoja[lojaId].percentualTaxaCartaoMedia += Number(
        reg.percentualTaxaCartaoMedia || 0,
      );
      totaisPorLoja[lojaId].gastoFixo += Number(reg.gastoFixoPeriodo || 0);
      totaisPorLoja[lojaId].gastoVariavel += Number(
        reg.gastoVariavelPeriodo || 0,
      );
      totaisPorLoja[lojaId].gastoProdutos += Number(
        reg.gastoProdutosPeriodo || 0,
      );
      totaisPorLoja[lojaId].gastoTotal += Number(reg.gastoTotalPeriodo || 0);
    });
    // Agregação total geral
    const totaisGerais = Object.values(totaisPorLoja).reduce(
      (acc, loja) => {
        acc.dinheiro += loja.dinheiro;
        acc.cartaoPix += loja.cartaoPix;
        acc.cartaoPixLiquido += loja.cartaoPixLiquido;
        acc.taxaDeCartao += loja.taxaDeCartao;
        acc.percentualTaxaCartaoMedia += loja.percentualTaxaCartaoMedia;
        acc.gastoFixo += loja.gastoFixo;
        acc.gastoVariavel += loja.gastoVariavel;
        acc.gastoProdutos += loja.gastoProdutos;
        acc.gastoTotal += loja.gastoTotal;
        return acc;
      },
      {
        dinheiro: 0,
        cartaoPix: 0,
        cartaoPixLiquido: 0,
        taxaDeCartao: 0,
        percentualTaxaCartaoMedia: 0,
        gastoFixo: 0,
        gastoVariavel: 0,
        gastoProdutos: 0,
        gastoTotal: 0,
      },
    );
    res.json({ totaisPorLoja, totaisGerais });
  } catch (err) {
    res.status(500).json({
      error: "Erro ao gerar dados dos gráficos",
      details: err.message,
    });
  }
}

export { getDashboardGraficos };
