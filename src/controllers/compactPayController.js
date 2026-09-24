import { Op } from "sequelize";
import { Maquina, Loja } from "../models/index.js";
import {
  consultarMaquinaCompactPay,
  consultarStatusCompactPay,
  consultarTransacoesCompactPay,
  devolverPagamentoCompactPay,
  enviarCreditoCompactPay,
  verificarOnlineCompactPay,
} from "../services/compactPayService.js";

const atributosMaquina = ["id", "codigo", "nome", "compactPayId", "lojaId", "ativo"];

const hojeBrasilia = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );

const listarMaquinasComCompactPay = async () => {
  const maquinas = await Maquina.findAll({
    where: {
      ativo: true,
      compactPayId: {
        [Op.ne]: null,
      },
    },
    attributes: atributosMaquina,
    include: [{ model: Loja, as: "loja", attributes: ["id", "nome"] }],
    order: [["codigo", "ASC"]],
  });

  return maquinas.filter((maquina) => maquina.compactPayId?.trim());
};

const buscarMaquinaCompactPay = async (id) => {
  const maquina = await Maquina.findByPk(id, {
    attributes: atributosMaquina,
    include: [{ model: Loja, as: "loja", attributes: ["id", "nome"] }],
  });

  if (!maquina) {
    const error = new Error("Maquina nao encontrada.");
    error.status = 404;
    throw error;
  }

  if (!maquina.compactPayId) {
    const error = new Error("Esta maquina nao possui ID da CompactPay.");
    error.status = 400;
    throw error;
  }

  return maquina;
};

export const listarMaquinasCompactPay = async (req, res) => {
  try {
    res.json(await listarMaquinasComCompactPay());
  } catch (error) {
    console.error("[CompactPay] Erro ao listar maquinas:", error);
    res.status(500).json({ error: "Erro ao listar maquinas CompactPay." });
  }
};

export const consultarStatusMaquinas = async (req, res) => {
  try {
    const maquinas = await listarMaquinasComCompactPay();

    const resultados = await Promise.all(
      maquinas.map(async (maquina) => {
        try {
          const status = await consultarStatusCompactPay({
            compactPayId: maquina.compactPayId,
          });
          return {
            maquinaId: maquina.id,
            compactPayId: maquina.compactPayId,
            status,
          };
        } catch (error) {
          return {
            maquinaId: maquina.id,
            compactPayId: maquina.compactPayId,
            status: {
              online: false,
              status: "erro",
              erro: error.message,
              consultadoEm: new Date().toISOString(),
            },
          };
        }
      }),
    );

    res.json({ resultados });
  } catch (error) {
    console.error("[CompactPay] Erro ao consultar status:", error);
    res.status(500).json({ error: "Erro ao consultar status CompactPay." });
  }
};

export const verificarOnline = async (req, res) => {
  try {
    const maquina = await buscarMaquinaCompactPay(req.params.id);
    const status = await verificarOnlineCompactPay({
      compactPayId: maquina.compactPayId,
    });

    res.json({
      maquinaId: maquina.id,
      compactPayId: maquina.compactPayId,
      status,
    });
  } catch (error) {
    console.error("[CompactPay] Erro ao verificar online:", error);
    res.status(error.status || 502).json({
      error: error.message || "Nao foi possivel verificar a placa.",
    });
  }
};

export const enviarCredito = async (req, res) => {
  try {
    const valor = Number(req.body?.valor);
    if (!Number.isFinite(valor) || valor <= 0) {
      return res.status(400).json({ error: "Informe um valor maior que zero." });
    }

    const maquina = await buscarMaquinaCompactPay(req.params.id);
    const resultado = await enviarCreditoCompactPay({
      compactPayId: maquina.compactPayId,
      valor,
    });

    res.json({
      maquinaId: maquina.id,
      compactPayId: maquina.compactPayId,
      ...resultado,
    });
  } catch (error) {
    console.error("[CompactPay] Erro ao enviar credito:", error);
    res.status(error.status || 502).json({
      error: error.message || "Nao foi possivel enviar credito pela CompactPay.",
    });
  }
};

export const consultarTransacoes = async (req, res) => {
  try {
    const maquina = await buscarMaquinaCompactPay(req.params.id);

    // Mesmo comportamento da Machine Pay: só admin escolhe período, os
    // demais veem apenas o dia de hoje.
    const isAdmin = req.usuario?.role === "ADMIN";
    const hoje = hojeBrasilia();
    const periodo =
      isAdmin && req.query.inicio && req.query.fim
        ? { inicio: req.query.inicio, fim: req.query.fim }
        : { inicio: hoje, fim: hoje };

    const dados = await consultarTransacoesCompactPay({
      compactPayId: maquina.compactPayId,
      ...periodo,
    });

    res.json({
      maquinaId: maquina.id,
      compactPayId: maquina.compactPayId,
      ...dados,
    });
  } catch (error) {
    console.error("[CompactPay] Erro ao consultar transacoes:", error);
    res.status(error.status || 502).json({
      error: error.message || "Nao foi possivel consultar transacoes.",
    });
  }
};

export const devolverPagamento = async (req, res) => {
  try {
    const maquina = await buscarMaquinaCompactPay(req.params.id);
    const resultado = await devolverPagamentoCompactPay({
      compactPayId: maquina.compactPayId,
      historicoId: req.params.historicoId,
    });
    res.json(resultado);
  } catch (error) {
    console.error("[CompactPay] Erro ao devolver pagamento:", error);
    res.status(error.status || 502).json({
      error: error.message || "Nao foi possivel devolver o pagamento.",
    });
  }
};

// Usado pelo formulário da máquina para confirmar que o ID digitado existe
// no CompactPay antes de salvar.
export const validarId = async (req, res) => {
  try {
    const maquina = await consultarMaquinaCompactPay({
      compactPayId: req.params.compactPayId,
    });
    res.json({
      compactPayId: maquina.id_hardware,
      nome: maquina.nome || null,
      clienteNome: maquina.cliente_nome || null,
      online: Boolean(maquina.status_online),
    });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message });
  }
};

// Total recebido na CompactPay por máquina num período (dias YYYY-MM-DD),
// usado pelo campo "CompactPay" e pelo ranking de máquinas dos Relatórios.
// Soma só pagamentos reais: testes e devolvidos ficam de fora.
export const consultarTotais = async (req, res) => {
  try {
    const hoje = hojeBrasilia();
    const inicio = String(req.query.inicio || hoje).slice(0, 10);
    const fim = String(req.query.fim || hoje).slice(0, 10);

    let maquinas = await listarMaquinasComCompactPay();
    if (req.query.lojaId) {
      maquinas = maquinas.filter(
        (maquina) => String(maquina.lojaId) === String(req.query.lojaId),
      );
    }

    const resultados = await Promise.all(
      maquinas.map(async (maquina) => {
        const base = {
          maquinaId: maquina.id,
          codigo: maquina.codigo,
          nome: maquina.nome,
          lojaId: maquina.lojaId,
          compactPayId: maquina.compactPayId,
        };
        try {
          const dados = await consultarTransacoesCompactPay({
            compactPayId: maquina.compactPayId,
            inicio,
            fim,
          });
          return { ...base, total: dados.total, quantidade: dados.quantidade };
        } catch (error) {
          return { ...base, total: 0, quantidade: 0, erro: error.message };
        }
      }),
    );

    res.json({
      inicio,
      fim,
      total: Number(
        resultados.reduce((soma, item) => soma + item.total, 0).toFixed(2),
      ),
      quantidade: resultados.reduce((soma, item) => soma + item.quantidade, 0),
      maquinas: resultados,
    });
  } catch (error) {
    console.error("[CompactPay] Erro ao consultar totais:", error);
    res.status(500).json({ error: "Erro ao consultar totais CompactPay." });
  }
};
