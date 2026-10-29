import { Op } from "sequelize";
import {
  Loja,
  Manutencao,
  Maquina,
  Movimentacao,
  Usuario,
} from "../models/index.js";

// Alertas da conferência com a placa CompactPay (ver
// conferenciaFichasService): ficam gravados como Manutencao com origem
// ALERTA_FICHAS / ALERTA_SAIDA. Aqui eles saem já "abertos" pra página de
// alertas — com a movimentação que gerou o alerta, a anterior (início do
// período conferido) e os números que a placa contou.

const ORIGENS = ["ALERTA_FICHAS", "ALERTA_SAIDA"];
const TIPO_POR_ORIGEM = { ALERTA_FICHAS: "fichas", ALERTA_SAIDA: "saida" };

const parseMoeda = (texto) => {
  if (!texto) return null;
  const numero = Number(texto.replace(/[^\d,-]/g, "").replace(",", "."));
  return Number.isFinite(numero) ? numero : null;
};

const capturar = (texto, regex) => texto.match(regex)?.slice(1) || [];

// O que a placa contou só existe na descrição do alerta (a CompactPay não
// guarda a contagem por período); o formato é o que conferenciaFichasService
// escreve.
const lerContagemCompactPay = (origem, descricao = "") => {
  if (origem === "ALERTA_FICHAS") {
    const [quantidade, valor, valorFicha] = capturar(
      descricao,
      /CompactPay:\s*(\d+)\s*fichas\s*\(([^)]*)\)\s*a\s*(.+?)\s*cada/,
    );
    return {
      quantidade: quantidade !== undefined ? Number(quantidade) : null,
      valor: parseMoeda(valor),
      valorFicha: parseMoeda(valorFicha),
    };
  }
  const [quantidade] = capturar(descricao, /CompactPay:\s*(\d+)\s*prêmio/);
  return {
    quantidade: quantidade !== undefined ? Number(quantidade) : null,
    valor: null,
    valorFicha: null,
  };
};

const lerQuantidadeLancada = (origem, descricao = "") => {
  const regex =
    origem === "ALERTA_FICHAS"
      ? /Movimentação:\s*(\d+)\s*fichas/
      : /Movimentação:\s*(\d+)\s*prêmio/;
  const [quantidade] = capturar(descricao, regex);
  return quantidade !== undefined ? Number(quantidade) : null;
};

const dataMovimentacao = (mov) => mov?.dataColeta || mov?.createdAt || null;

const resumoMovimentacao = (mov) =>
  mov
    ? {
        id: mov.id,
        data: dataMovimentacao(mov),
        fichas: mov.fichas,
        sairam: mov.sairam,
        totalPre: mov.totalPre,
        totalPos: mov.totalPos,
        abastecidas: mov.abastecidas,
        usuario: mov.usuario?.nome || null,
      }
    : null;

// GET /api/manutencoes/alertas-compactpay?status=PENDENTE|RESOLVIDA|TODAS
// &apenasContagem=1 devolve só { pendentes } (usado no badge do menu).
export const listarAlertasCompactPay = async (req, res) => {
  try {
    if (req.query.apenasContagem) {
      const pendentes = await Manutencao.count({
        where: { origem: { [Op.in]: ORIGENS }, status: "PENDENTE" },
      });
      return res.json({ pendentes });
    }

    const where = { origem: { [Op.in]: ORIGENS } };
    if (["PENDENTE", "RESOLVIDA"].includes(req.query.status)) {
      where.status = req.query.status;
    }

    const alertas = await Manutencao.findAll({
      where,
      include: [
        { model: Usuario, as: "criadoPor", attributes: ["id", "nome"] },
        { model: Usuario, as: "resolvidoPor", attributes: ["id", "nome"] },
        { model: Loja, as: "loja", attributes: ["id", "nome"] },
        {
          model: Maquina,
          as: "maquina",
          attributes: ["id", "nome", "codigo", "compactPayId", "valorFicha"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: 500,
    });

    const idsMovimentacao = alertas
      .map((alerta) => alerta.movimentacaoId)
      .filter(Boolean);
    const movimentacoes = idsMovimentacao.length
      ? await Movimentacao.findAll({
          where: { id: { [Op.in]: idsMovimentacao } },
          include: [{ model: Usuario, as: "usuario", attributes: ["nome"] }],
        })
      : [];
    const movPorId = new Map(movimentacoes.map((mov) => [mov.id, mov]));

    // Movimentação anterior de cada uma (início do período conferido).
    const anteriores = await Promise.all(
      movimentacoes.map(async (mov) => {
        const anterior = await Movimentacao.findOne({
          where: {
            maquinaId: mov.maquinaId,
            id: { [Op.ne]: mov.id },
            dataColeta: { [Op.lte]: dataMovimentacao(mov) },
          },
          include: [{ model: Usuario, as: "usuario", attributes: ["nome"] }],
          order: [["dataColeta", "DESC"]],
        });
        return [mov.id, anterior];
      }),
    );
    const anteriorPorId = new Map(anteriores);

    res.json(
      alertas.map((alerta) => {
        const mov = movPorId.get(alerta.movimentacaoId);
        const anterior = anteriorPorId.get(alerta.movimentacaoId);
        const tipo = TIPO_POR_ORIGEM[alerta.origem];
        const compactPay = lerContagemCompactPay(alerta.origem, alerta.descricao);
        const lancado =
          (tipo === "fichas" ? mov?.fichas : mov?.sairam) ??
          lerQuantidadeLancada(alerta.origem, alerta.descricao);
        const diferenca =
          lancado !== null && lancado !== undefined && compactPay.quantidade !== null
            ? Number(lancado) - compactPay.quantidade
            : null;
        const valorFicha =
          compactPay.valorFicha ?? (Number(alerta.maquina?.valorFicha) || null);

        return {
          id: alerta.id,
          tipo,
          titulo: alerta.titulo,
          descricao: alerta.descricao,
          status: alerta.status,
          criadoEm: alerta.createdAt,
          resolvidoEm: alerta.resolvidoEm,
          resolvidoPor: alerta.resolvidoPor?.nome || null,
          loja: alerta.loja ? { id: alerta.loja.id, nome: alerta.loja.nome } : null,
          maquina: alerta.maquina
            ? {
                id: alerta.maquina.id,
                nome: alerta.maquina.nome,
                codigo: alerta.maquina.codigo,
                compactPayId: alerta.maquina.compactPayId,
              }
            : null,
          periodo: {
            inicio: dataMovimentacao(anterior),
            fim: dataMovimentacao(mov),
          },
          lancado: lancado ?? null,
          lancadoPor: mov?.usuario?.nome || alerta.criadoPor?.nome || null,
          compactPay,
          diferenca,
          diferencaValor:
            tipo === "fichas" && diferenca !== null && valorFicha
              ? Number((diferenca * valorFicha).toFixed(2))
              : null,
          movimentacao: resumoMovimentacao(mov),
          movimentacaoAnterior: resumoMovimentacao(anterior),
        };
      }),
    );
  } catch (error) {
    console.error("Erro ao listar alertas CompactPay:", error);
    res.status(500).json({ error: "Erro ao listar alertas da CompactPay." });
  }
};
