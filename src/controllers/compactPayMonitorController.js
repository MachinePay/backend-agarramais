import { Op } from "sequelize";
import { Maquina, Loja } from "../models/index.js";
import {
  listarAlertasCompactPay,
  listarEventosDispositivoCompactPay,
  listarQuedasCompactPay,
  listarResumoDiaCompactPay,
  listarSaudeCompactPay,
  normalizarDataUtc,
} from "../services/compactPayService.js";

// Monitoramento das placas CompactPay. Diferente da Machine Pay, o histórico
// (quedas, saúde, alertas) já fica guardado no CompactPay: aqui só cruzamos
// com as máquinas cadastradas na Agarramais (compactPayId) — placas de outros
// clientes que o usuário de integração enxergue ficam de fora.

const FUSO = "America/Sao_Paulo";
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 24 * 60 * 60 * 1000;

const dataBrasil = (data = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(data);

const somarDias = (dataIso, dias) =>
  dataBrasil(new Date(new Date(`${dataIso}T12:00:00Z`).getTime() + dias * DIA_MS));

// Dia de Brasília (UTC-3) → intervalo UTC "naive" que o CompactPay entende.
const intervaloUtc = (inicio, fim) => ({
  dataInicio: `${inicio}T03:00:00`,
  dataFim: `${somarDias(fim, 1)}T02:59:59`,
});

const lerPeriodo = (query, diasPadrao) => {
  const hoje = dataBrasil();
  const fim = REGEX_DATA.test(query.dataFim || "") ? query.dataFim : hoje;
  const inicio = REGEX_DATA.test(query.dataInicio || "")
    ? query.dataInicio
    : somarDias(fim, -(diasPadrao - 1));
  return inicio <= fim ? { inicio, fim } : { inicio: fim, fim: inicio };
};

const responderErro = (res, error, mensagem) => {
  console.error(`[CompactPay Monitor] ${mensagem}:`, error.message);
  res.status(error.status || 502).json({ error: error.message || mensagem });
};

async function maquinasVinculadas() {
  const maquinas = await Maquina.findAll({
    where: { ativo: true, compactPayId: { [Op.ne]: null } },
    attributes: ["id", "codigo", "nome", "lojaId", "compactPayId"],
    include: [{ model: Loja, as: "loja", attributes: ["id", "nome"] }],
    order: [["codigo", "ASC"]],
  });
  return maquinas
    .filter((m) => m.compactPayId?.trim())
    .map((m) => ({
      maquinaId: m.id,
      codigo: m.codigo,
      nome: m.nome,
      lojaId: m.lojaId,
      lojaNome: m.loja?.nome || null,
      compactPayId: m.compactPayId.trim(),
    }));
}

const formatarQueda = (q) => ({
  id: q.id,
  compactPayId: String(q.maquina_id),
  data: normalizarDataUtc(q.created_at),
  inicioEstimado: normalizarDataUtc(q.inicio_estimado),
  reconectouEm: normalizarDataUtc(q.reconectou_em),
  ligouEm: normalizarDataUtc(q.ligou_em),
  duracaoOfflineSegundos:
    q.duracao_offline_segundos === null || q.duracao_offline_segundos === undefined
      ? null
      : Math.round(q.duracao_offline_segundos),
  tipo: q.tipo,
  categoria: q.categoria || "desconhecido",
  categoriaLabel: q.categoria_label || q.categoria || "Sem detalhes",
  motivo: q.motivo || "",
  detalhes: q.detalhes || null,
  motivoTecnico: q.motivo_tecnico || null,
});

// GET /api/compact-pay/monitor/painel — situação atual de todas as placas
export const obterPainel = async (req, res) => {
  try {
    const vinculadas = await maquinasVinculadas();
    if (!vinculadas.length) {
      return res.json({ atualizadoEm: new Date(), maquinas: [], alertas: [] });
    }

    const hoje = dataBrasil();
    const [saude, resumoDia, alertas, quedasHoje] = await Promise.all([
      listarSaudeCompactPay(),
      listarResumoDiaCompactPay().catch(() => []),
      listarAlertasCompactPay().catch(() => []),
      listarQuedasCompactPay(intervaloUtc(hoje, hoje)).catch(() => ({ quedas: [] })),
    ]);

    const saudePorId = new Map(saude.map((s) => [String(s.id_hardware), s]));
    const resumoPorId = new Map(resumoDia.map((r) => [String(r.id_hardware), r]));
    const idsVinculados = new Set(vinculadas.map((v) => v.compactPayId));

    const quedasPorId = new Map();
    for (const q of quedasHoje.quedas) {
      const id = String(q.maquina_id);
      quedasPorId.set(id, (quedasPorId.get(id) || 0) + 1);
    }

    const alertasVinculados = alertas
      .filter((a) => idsVinculados.has(String(a.maquina?.id_hardware)))
      .map((a) => ({
        id: a.id,
        tipo: a.tipo,
        severidade: a.severidade,
        titulo: a.titulo,
        mensagem: a.mensagem,
        detectadoEm: normalizarDataUtc(a.detected_at),
        compactPayId: String(a.maquina.id_hardware),
      }));

    const agora = Date.now();
    const maquinas = vinculadas.map((v) => {
      const s = saudePorId.get(v.compactPayId);
      const r = resumoPorId.get(v.compactPayId);
      const ultimoSinal = normalizarDataUtc(s?.ultimo_sinal);
      const online = Boolean(s?.status_online);
      return {
        ...v,
        encontrada: Boolean(s),
        nomeCompactPay: s?.nome || r?.nome || null,
        localizacao: s?.localizacao || null,
        status: s ? s.health_status : "nao_encontrada",
        online,
        ultimoSinal,
        offlineHaMinutos:
          !online && ultimoSinal ? Math.round((agora - new Date(ultimoSinal)) / 60000) : null,
        wifiQualidade: s?.wifi_quality ?? null,
        wifiRssi: s?.wifi_rssi ?? null,
        wifiStatus: s?.wifi_status || "sem_leitura",
        firmwareVersao: s?.firmware_version || null,
        firmwareAlvo: s?.firmware_target_version || null,
        firmwareStatus: s?.firmware_update_status || null,
        firmwareAlerta: Boolean(s?.firmware_alert),
        pulsoAlerta: Boolean(s?.pulse_alert),
        ultimoPulso: s?.ultimo_pulso
          ? {
              data: normalizarDataUtc(s.ultimo_pulso.data),
              status: s.ultimo_pulso.status || "",
              descricao: s.ultimo_pulso.descricao || "",
            }
          : null,
        ultimoPagamento: s?.ultimo_pagamento
          ? {
              data: normalizarDataUtc(s.ultimo_pagamento.data),
              valor: Number(s.ultimo_pagamento.valor || 0),
              tipo: s.ultimo_pagamento.payment_type || s.ultimo_pagamento.provider || "",
            }
          : null,
        uptimeSegundos: s?.uptime_seconds ?? null,
        memoriaLivre: s?.free_heap_bytes ?? null,
        ultimoReset: s?.last_reset_reason || null,
        reconexoesWifi: s?.wifi_reconnect_count ?? null,
        reconexoesMqtt: s?.mqtt_reconnect_count ?? null,
        desconexoesWifi: s?.wifi_disconnect_count ?? null,
        motivoDesconexaoWifi: s?.wifi_disconnect_reason ?? null,
        pulsosCurtos: s?.short_pulse_count ?? null,
        ultimoReinicioForcado: s?.last_forced_restart_reason
          ? {
              motivo: s.last_forced_restart_reason,
              data: normalizarDataUtc(s.last_forced_restart_at),
            }
          : null,
        faturamentoHoje: Number(r?.faturamento || 0),
        quedasHoje: quedasPorId.get(v.compactPayId) || 0,
        alertas: alertasVinculados
          .filter((a) => a.compactPayId === v.compactPayId)
          .map((a) => a.tipo),
      };
    });

    res.json({ atualizadoEm: new Date(), maquinas, alertas: alertasVinculados });
  } catch (error) {
    responderErro(res, error, "Erro ao montar painel CompactPay");
  }
};

// GET /api/compact-pay/monitor/quedas?dataInicio=&dataFim=&compactPayId=
// Uma consulta por placa: o CompactPay devolve no máximo 500 quedas por
// chamada, e assim o total de cada placa vem exato mesmo passando disso.
export const listarQuedas = async (req, res) => {
  try {
    const { inicio, fim } = lerPeriodo(req.query, 1);
    let vinculadas = await maquinasVinculadas();
    if (req.query.compactPayId) {
      vinculadas = vinculadas.filter((v) => v.compactPayId === String(req.query.compactPayId));
    }

    const intervalo = intervaloUtc(inicio, fim);
    const resultados = await Promise.all(
      vinculadas.map(async (v) => {
        try {
          const dados = await listarQuedasCompactPay({ compactPayId: v.compactPayId, ...intervalo });
          return { compactPayId: v.compactPayId, ...dados, erro: null };
        } catch (error) {
          return { compactPayId: v.compactPayId, quedas: [], total: 0, erro: error.message };
        }
      }),
    );

    const quedas = resultados
      .flatMap((r) => r.quedas.map(formatarQueda))
      .sort((a, b) => new Date(b.data) - new Date(a.data));

    res.json({
      periodo: { inicio, fim },
      totalPorMaquina: Object.fromEntries(resultados.map((r) => [r.compactPayId, r.total])),
      incompleto: resultados.some((r) => r.total > r.quedas.length),
      erros: resultados.filter((r) => r.erro).map((r) => ({ compactPayId: r.compactPayId, erro: r.erro })),
      quedas,
    });
  } catch (error) {
    responderErro(res, error, "Erro ao listar quedas CompactPay");
  }
};

// GET /api/compact-pay/monitor/maquinas/:compactPayId/eventos — diagnóstico da placa
export const listarEventosPlaca = async (req, res) => {
  try {
    const vinculadas = await maquinasVinculadas();
    const { compactPayId } = req.params;
    if (!vinculadas.some((v) => v.compactPayId === compactPayId)) {
      return res.status(404).json({ error: "Placa não cadastrada em nenhuma máquina." });
    }
    const eventos = await listarEventosDispositivoCompactPay({ compactPayId });
    res.json({ compactPayId, eventos });
  } catch (error) {
    responderErro(res, error, "Erro ao buscar diagnóstico da placa");
  }
};
