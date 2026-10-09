import { Op, fn, col, literal } from "sequelize";
import {
  Maquina,
  Loja,
  MachinePayStatus,
  MachinePayDiario,
  MachinePayEvento,
} from "../models/index.js";
import {
  coletarStatusMachinePay,
  dataBrasil,
  monitorConfigurado,
  obterUltimoErroColeta,
} from "../services/machinePayMonitorService.js";
import { MachinePayServiceError } from "../services/machinePayService.js";
import { intervaloMonitorMinutos } from "../jobs/machinePayMonitor.js";

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 24 * 60 * 60 * 1000;

const normalizar = (texto) =>
  String(texto || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const listaParam = (valor) =>
  String(valor || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const lerPeriodo = (query, diasPadrao) => {
  const hoje = dataBrasil();
  const fim = REGEX_DATA.test(query.dataFim || "") ? query.dataFim : hoje;
  const inicio = REGEX_DATA.test(query.dataInicio || "")
    ? query.dataInicio
    : dataBrasil(new Date(new Date(`${fim}T12:00:00Z`).getTime() - (diasPadrao - 1) * DIA_MS));
  return inicio <= fim ? { inicio, fim } : { inicio: fim, fim: inicio };
};

// Número da loja no nome do ponto ("Loja 03 ...", "loja 122, ...") para ordenar naturalmente.
const numeroDoPonto = (nome) => {
  const match = String(nome || "").match(/loja\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
};

async function mapaVinculos() {
  const maquinas = await Maquina.findAll({
    where: { machinePayPosId: { [Op.ne]: null } },
    attributes: ["id", "codigo", "nome", "lojaId", "machinePayPosId"],
    include: [{ model: Loja, as: "loja", attributes: ["id", "nome"] }],
  });
  return new Map(
    maquinas.map((m) => [
      String(m.machinePayPosId).trim(),
      {
        maquinaId: m.id,
        codigo: m.codigo,
        nome: m.nome,
        lojaId: m.lojaId,
        lojaNome: m.loja?.nome || null,
      },
    ]),
  );
}

const formatarStatus = (s, vinculos, agora, hoje) => {
  const offlineDesde = s.offlineDesde ? new Date(s.offlineDesde) : null;
  return {
    posId: s.posId,
    idPainel: s.idPainel,
    nomePonto: s.nomePonto,
    cliente: s.cliente,
    online: s.online,
    // Leitura de ontem ainda não renovada hoje: o contador do painel já zerou.
    quedasHoje: s.dia === hoje ? s.quedasHoje : 0,
    versao: s.versao,
    tipoVersao: s.tipoVersao,
    diasVencer: s.diasVencer,
    gateway: s.gateway,
    hibrido: s.hibrido,
    serial: s.serial,
    pagamentoTeste: s.pagamentoTeste,
    telemetria: s.telemetria,
    modoResposta: s.modoResposta,
    vendasHojeQtd: s.dia === hoje ? s.vendasHojeQtd : 0,
    vendasHojeValor: s.dia === hoje ? Number(s.vendasHojeValor || 0) : 0,
    totalValor: Number(s.totalValor || 0),
    totalQtd: s.totalQtd,
    pix: Number(s.pix || 0),
    debito: Number(s.debito || 0),
    credito: Number(s.credito || 0),
    ultimaVendaHoje: s.ultimaVendaHoje,
    ultimaVendaOntem: s.ultimaVendaOntem,
    ultimaVendaAnterior: s.ultimaVendaAnterior,
    sinalWifi: s.sinalWifi,
    dataEquipamento: s.dataEquipamento,
    ip: s.ip,
    offlineDesde,
    offlineHaMinutos:
      !s.online && offlineDesde ? Math.round((agora - offlineDesde) / 60000) : null,
    ultimaVezOnline: s.ultimaVezOnline,
    coletadoEm: s.coletadoEm,
    desativada: /desativad/i.test(s.nomePonto || ""),
    vinculo: vinculos.get(s.posId) || null,
  };
};

async function carregarStatusFormatados() {
  const [status, vinculos] = await Promise.all([
    MachinePayStatus.findAll({ raw: true }),
    mapaVinculos(),
  ]);
  const agora = new Date();
  const hoje = dataBrasil(agora);
  return status.map((s) => formatarStatus(s, vinculos, agora, hoje));
}

// Filtros por máquina, compartilhados por lista, ranking, gráficos e eventos.
const filtrarMaquinas = (lista, query) => {
  const busca = normalizar(query.busca);
  const sinais = listaParam(query.sinal);
  const versoes = listaParam(query.tipoVersao);
  const posIds = listaParam(query.posId);
  const incluirDesativadas = query.incluirDesativadas === "true";

  return lista.filter((m) => {
    if (!incluirDesativadas && m.desativada) return false;
    if (posIds.length && !posIds.includes(m.posId)) return false;
    if (query.lojaId && String(m.vinculo?.lojaId) !== String(query.lojaId)) return false;
    if (query.vinculo === "vinculadas" && !m.vinculo) return false;
    if (query.vinculo === "sem_vinculo" && m.vinculo) return false;
    if (sinais.length && !sinais.includes(m.sinalWifi)) return false;
    if (versoes.length && !versoes.includes(m.tipoVersao)) return false;
    if (busca) {
      const alvo = normalizar(
        [
          m.nomePonto,
          m.posId,
          m.serial,
          m.ip,
          m.vinculo?.codigo,
          m.vinculo?.nome,
          m.vinculo?.lojaNome,
        ].join(" "),
      );
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
};

const responderErro = (res, error, mensagem) => {
  console.error(`[MachinePay Monitor] ${mensagem}:`, error.message);
  if (error instanceof MachinePayServiceError) {
    return res.status(error.status).json({ error: error.message });
  }
  return res.status(500).json({ error: mensagem, details: error.message });
};

// GET /api/machine-pay/monitor/resumo
export const obterResumo = async (req, res) => {
  try {
    const todas = await carregarStatusFormatados();
    const lista = filtrarMaquinas(todas, req.query);
    const hoje = dataBrasil();

    const contar = (fnFiltro) => lista.filter(fnFiltro).length;
    const somar = (campo) => lista.reduce((acc, m) => acc + (m[campo] || 0), 0);

    const porSinal = {};
    const porVersao = {};
    for (const m of lista) {
      porSinal[m.sinalWifi] = (porSinal[m.sinalWifi] || 0) + 1;
      const chave = `${m.tipoVersao || "Desconhecida"} v${m.versao || "?"}`;
      porVersao[chave] ||= { versao: chave, total: 0, offline: 0, quedas: 0 };
      porVersao[chave].total += 1;
      porVersao[chave].offline += m.online ? 0 : 1;
      porVersao[chave].quedas += m.quedasHoje;
    }

    const ultimaColeta = todas.reduce(
      (maior, m) => (m.coletadoEm && new Date(m.coletadoEm) > maior ? new Date(m.coletadoEm) : maior),
      new Date(0),
    );

    const quedasPorHoraHoje = Array(24).fill(0);
    const eventosQuedaHoje = await MachinePayEvento.findAll({
      where: { data: hoje, tipo: "QUEDA" },
      attributes: ["dataHora", "quedasAntes", "quedasDepois", "posId"],
      raw: true,
    });
    const posIdsFiltrados = new Set(lista.map((m) => m.posId));
    for (const evento of eventosQuedaHoje) {
      if (!posIdsFiltrados.has(evento.posId)) continue;
      const hora = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Sao_Paulo",
          hour: "2-digit",
          hourCycle: "h23",
        }).format(new Date(evento.dataHora)),
      );
      quedasPorHoraHoje[hora] += (evento.quedasDepois || 0) - (evento.quedasAntes || 0);
    }

    res.json({
      monitor: {
        configurado: monitorConfigurado(),
        ativo: process.env.MACHINE_PAY_MONITOR_ATIVO !== "false",
        intervaloMinutos: intervaloMonitorMinutos,
        ultimaColeta: ultimaColeta.getTime() ? ultimaColeta : null,
        ultimoErro: obterUltimoErroColeta(),
        inicioHistorico: (await MachinePayDiario.min("data")) || null,
      },
      total: lista.length,
      online: contar((m) => m.online),
      offline: contar((m) => !m.online),
      desativadasOcultas:
        req.query.incluirDesativadas === "true" ? 0 : todas.filter((m) => m.desativada).length,
      quedasHoje: somar("quedasHoje"),
      maquinasComQuedaHoje: contar((m) => m.quedasHoje > 0),
      maquinasInstaveisHoje: contar((m) => m.quedasHoje >= 5),
      semVendaHoje: contar((m) => m.online && m.vendasHojeQtd === 0),
      vendasHojeQtd: somar("vendasHojeQtd"),
      vendasHojeValor: Number(somar("vendasHojeValor").toFixed(2)),
      sinalRuimOuFraco: contar((m) => m.sinalWifi === "FRACO" || m.sinalWifi === "RUIM"),
      vencendoEm15Dias: contar((m) => m.diasVencer !== null && m.diasVencer <= 15),
      vinculadas: contar((m) => m.vinculo),
      semVinculo: contar((m) => !m.vinculo),
      porSinal,
      porVersao: Object.values(porVersao).sort((a, b) => b.total - a.total),
      quedasPorHoraHoje,
      pioresHoje: [...lista]
        .filter((m) => m.quedasHoje > 0)
        .sort((a, b) => b.quedasHoje - a.quedasHoje)
        .slice(0, 5)
        .map((m) => ({ posId: m.posId, nomePonto: m.nomePonto, quedasHoje: m.quedasHoje, online: m.online })),
    });
  } catch (error) {
    responderErro(res, error, "Erro ao montar resumo Machine Pay");
  }
};

const ORDENACOES = {
  quedas: (a, b) => b.quedasHoje - a.quedasHoje,
  // Offline há mais tempo primeiro; "desde antes do monitoramento" conta como mais antigo.
  offline: (a, b) =>
    (a.offlineDesde ? new Date(a.offlineDesde).getTime() : 0) -
    (b.offlineDesde ? new Date(b.offlineDesde).getTime() : 0),
  vendas: (a, b) => b.vendasHojeValor - a.vendasHojeValor,
  sinal: (a, b) => {
    const peso = { RUIM: 0, FRACO: 1, BOM: 2, OTIMO: 3, SEM_SINAL: 4 };
    return (peso[a.sinalWifi] ?? 5) - (peso[b.sinalWifi] ?? 5);
  },
  nome: () => 0,
};

// GET /api/machine-pay/monitor/maquinas?status=offline|online|todas&busca=&lojaId=&sinal=&tipoVersao=&comQueda=&ordenar=&page=&limit=
export const listarMaquinasMonitor = async (req, res) => {
  try {
    const status = req.query.status || "offline";
    let lista = filtrarMaquinas(await carregarStatusFormatados(), req.query);

    if (status === "offline") lista = lista.filter((m) => !m.online);
    if (status === "online") lista = lista.filter((m) => m.online);
    if (req.query.comQueda === "true") lista = lista.filter((m) => m.quedasHoje > 0);

    const ordenar =
      ORDENACOES[req.query.ordenar] || ORDENACOES[status === "offline" ? "offline" : "quedas"];
    lista.sort(
      (a, b) =>
        ordenar(a, b) ||
        numeroDoPonto(a.nomePonto) - numeroDoPonto(b.nomePonto) ||
        String(a.nomePonto).localeCompare(String(b.nomePonto)),
    );

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    res.json({
      total: lista.length,
      page,
      limit,
      totalPages: Math.max(Math.ceil(lista.length / limit), 1),
      maquinas: lista.slice((page - 1) * limit, page * limit),
    });
  } catch (error) {
    responderErro(res, error, "Erro ao listar máquinas Machine Pay");
  }
};

const somaCondicional = (condicao) => fn("SUM", literal(`CASE WHEN ${condicao} THEN 1 ELSE 0 END`));

// Restringe consultas históricas às máquinas que passam pelos filtros. Inclui posIds
// que já saíram do painel quando não há filtro de máquina (para não sumir histórico).
async function posIdsFiltrados(query) {
  const temFiltro = ["busca", "lojaId", "sinal", "tipoVersao", "posId", "vinculo"].some(
    (campo) => query[campo],
  );
  const lista = filtrarMaquinas(await carregarStatusFormatados(), query);
  return { lista, temFiltro, posIds: lista.map((m) => m.posId) };
}

// GET /api/machine-pay/monitor/ranking-quedas?dataInicio=&dataFim=&busca=&lojaId=
export const rankingQuedas = async (req, res) => {
  try {
    const { inicio, fim } = lerPeriodo(req.query, 1);
    const { lista } = await posIdsFiltrados(req.query);
    const porPosId = new Map(lista.map((m) => [m.posId, m]));

    const linhas = await MachinePayDiario.findAll({
      where: {
        data: { [Op.between]: [inicio, fim] },
        posId: { [Op.in]: [...porPosId.keys()] },
      },
      attributes: [
        [col("pos_id"), "posId"],
        [fn("SUM", col("quedas")), "quedas"],
        [fn("SUM", col("vezes_offline")), "vezesOffline"],
        [fn("SUM", col("minutos_offline")), "minutosOffline"],
        [fn("MAX", col("quedas")), "maiorQuedasDia"],
        [fn("COUNT", col("id")), "diasMonitorados"],
        [somaCondicional("quedas > 0"), "diasComQueda"],
        [fn("SUM", col("vendas_valor")), "vendasValor"],
      ],
      group: [col("pos_id")],
      raw: true,
    });

    const ranking = linhas
      .map((l) => {
        const m = porPosId.get(l.posId);
        return {
          posId: l.posId,
          nomePonto: m?.nomePonto,
          online: m?.online,
          sinalWifi: m?.sinalWifi,
          tipoVersao: m?.tipoVersao,
          versao: m?.versao,
          vinculo: m?.vinculo || null,
          quedas: Number(l.quedas) || 0,
          vezesOffline: Number(l.vezesOffline) || 0,
          minutosOffline: Number(l.minutosOffline) || 0,
          maiorQuedasDia: Number(l.maiorQuedasDia) || 0,
          diasMonitorados: Number(l.diasMonitorados) || 0,
          diasComQueda: Number(l.diasComQueda) || 0,
          vendasValor: Number(l.vendasValor) || 0,
        };
      })
      .sort(
        (a, b) =>
          b.quedas - a.quedas ||
          b.minutosOffline - a.minutosOffline ||
          b.vezesOffline - a.vezesOffline ||
          numeroDoPonto(a.nomePonto) - numeroDoPonto(b.nomePonto),
      )
      .map((item, indice) => ({ posicao: indice + 1, ...item }));

    const totalQuedas = ranking.reduce((acc, r) => acc + r.quedas, 0);
    res.json({
      periodo: { inicio, fim },
      totalMaquinas: ranking.length,
      totalQuedas,
      maquinasComQueda: ranking.filter((r) => r.quedas > 0).length,
      maquinasSemQueda: ranking.filter((r) => r.quedas === 0).length,
      mediaQuedasPorMaquina: ranking.length
        ? Number((totalQuedas / ranking.length).toFixed(2))
        : 0,
      ranking,
    });
  } catch (error) {
    responderErro(res, error, "Erro ao montar ranking de quedas");
  }
};

// GET /api/machine-pay/monitor/serie-diaria?dataInicio=&dataFim=&busca=&lojaId=&posId=
export const serieDiaria = async (req, res) => {
  try {
    const { inicio, fim } = lerPeriodo(req.query, 30);
    const { temFiltro, posIds } = await posIdsFiltrados(req.query);

    const where = { data: { [Op.between]: [inicio, fim] } };
    if (temFiltro || req.query.incluirDesativadas !== "true") {
      where.posId = { [Op.in]: posIds };
    }

    const linhas = await MachinePayDiario.findAll({
      where,
      attributes: [
        "data",
        [fn("SUM", col("quedas")), "quedas"],
        [fn("SUM", col("vezes_offline")), "vezesOffline"],
        [fn("SUM", col("minutos_offline")), "minutosOffline"],
        [somaCondicional("quedas > 0"), "maquinasComQueda"],
        [somaCondicional("coletas_offline > 0"), "maquinasQueFicaramOffline"],
        [fn("COUNT", col("id")), "maquinasMonitoradas"],
        [fn("SUM", col("vendas_valor")), "vendasValor"],
      ],
      group: ["data"],
      order: [["data", "ASC"]],
      raw: true,
    });

    const porData = new Map(linhas.map((l) => [l.data, l]));
    const serie = [];
    for (
      let dia = new Date(`${inicio}T12:00:00Z`);
      dataBrasil(dia) <= fim;
      dia = new Date(dia.getTime() + DIA_MS)
    ) {
      const data = dataBrasil(dia);
      const l = porData.get(data);
      serie.push({
        data,
        monitorado: Boolean(l),
        quedas: Number(l?.quedas) || 0,
        vezesOffline: Number(l?.vezesOffline) || 0,
        minutosOffline: Number(l?.minutosOffline) || 0,
        maquinasComQueda: Number(l?.maquinasComQueda) || 0,
        maquinasQueFicaramOffline: Number(l?.maquinasQueFicaramOffline) || 0,
        maquinasMonitoradas: Number(l?.maquinasMonitoradas) || 0,
        vendasValor: Number(l?.vendasValor) || 0,
      });
    }

    res.json({ periodo: { inicio, fim }, serie });
  } catch (error) {
    responderErro(res, error, "Erro ao montar série diária Machine Pay");
  }
};

// GET /api/machine-pay/monitor/maquinas/:posId?dataInicio=&dataFim=
export const detalharMaquinaMonitor = async (req, res) => {
  try {
    const { posId } = req.params;
    const { inicio, fim } = lerPeriodo(req.query, 30);
    const todas = await carregarStatusFormatados();
    const maquina = todas.find((m) => m.posId === posId) || null;

    const [dias, eventos] = await Promise.all([
      MachinePayDiario.findAll({
        where: { posId, data: { [Op.between]: [inicio, fim] } },
        order: [["data", "ASC"]],
        raw: true,
      }),
      MachinePayEvento.findAll({
        where: { posId, data: { [Op.between]: [inicio, fim] } },
        order: [["dataHora", "DESC"]],
        limit: 300,
        raw: true,
      }),
    ]);

    if (!maquina && !dias.length) {
      return res.status(404).json({ error: "Leitor Machine Pay não encontrado" });
    }

    const totalQuedas = dias.reduce((acc, d) => acc + d.quedas, 0);
    const voltas = eventos.filter((e) => e.tipo === "ONLINE" && e.duracaoMinutos !== null);

    res.json({
      periodo: { inicio, fim },
      maquina,
      nomePonto: maquina?.nomePonto || dias[dias.length - 1]?.nomePonto,
      estatisticas: {
        totalQuedas,
        diasMonitorados: dias.length,
        diasComQueda: dias.filter((d) => d.quedas > 0).length,
        mediaQuedasPorDia: dias.length ? Number((totalQuedas / dias.length).toFixed(2)) : 0,
        piorDia: dias.reduce((pior, d) => (!pior || d.quedas > pior.quedas ? d : pior), null),
        minutosOffline: dias.reduce((acc, d) => acc + d.minutosOffline, 0),
        vezesOffline: dias.reduce((acc, d) => acc + d.vezesOffline, 0),
        maiorTempoOfflineMinutos: voltas.reduce((maior, e) => Math.max(maior, e.duracaoMinutos), 0),
      },
      dias: dias.map((d) => ({
        data: d.data,
        quedas: d.quedas,
        vezesOffline: d.vezesOffline,
        minutosOffline: d.minutosOffline,
        piorSinal: d.piorSinal,
        vendasQtd: d.vendasQtd,
        vendasValor: Number(d.vendasValor || 0),
      })),
      eventos,
    });
  } catch (error) {
    responderErro(res, error, "Erro ao detalhar leitor Machine Pay");
  }
};

// GET /api/machine-pay/monitor/eventos?dataInicio=&dataFim=&tipo=&busca=&posId=&page=&limit=
export const listarEventos = async (req, res) => {
  try {
    const { inicio, fim } = lerPeriodo(req.query, 1);
    const tipos = listaParam(req.query.tipo).filter((t) =>
      ["QUEDA", "OFFLINE", "ONLINE"].includes(t),
    );
    const { temFiltro, posIds } = await posIdsFiltrados(req.query);

    const where = { data: { [Op.between]: [inicio, fim] } };
    if (tipos.length) where.tipo = { [Op.in]: tipos };
    if (temFiltro || req.query.incluirDesativadas !== "true") {
      where.posId = { [Op.in]: posIds };
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const { count, rows } = await MachinePayEvento.findAndCountAll({
      where,
      order: [["dataHora", "DESC"]],
      limit,
      offset: (page - 1) * limit,
      raw: true,
    });

    res.json({
      periodo: { inicio, fim },
      total: count,
      page,
      limit,
      totalPages: Math.max(Math.ceil(count / limit), 1),
      eventos: rows,
    });
  } catch (error) {
    responderErro(res, error, "Erro ao listar eventos Machine Pay");
  }
};

// POST /api/machine-pay/monitor/coletar — força uma leitura do painel agora
export const coletarAgora = async (req, res) => {
  try {
    const resultado = await coletarStatusMachinePay();
    res.json(resultado);
  } catch (error) {
    responderErro(res, error, "Erro ao coletar status na Machine Pay");
  }
};
