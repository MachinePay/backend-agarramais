import crypto from "crypto";
import { Op, QueryTypes } from "sequelize";
import { sequelize } from "../database/connection.js";
import {
  CreditoRemotoLink,
  CreditoRemotoEnvio,
  Maquina,
  Usuario,
} from "../models/index.js";
import { enviarCreditosMqttMachinePay } from "../services/machinePayService.js";

const LIMITE_PADRAO_REAIS = 150;
const LIMITE_MAXIMO_REAIS = 10000;
const VALOR_MINIMO_ENVIO_CENTAVOS = 100;

// 32 bytes aleatórios em base64url = 43 caracteres.
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MENSAGEM_LINK_INVALIDO = "Link inválido ou expirado.";

const gerarToken = () => crypto.randomBytes(32).toString("base64url");

const hashToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

// Cópia cifrada do token, só pra o admin conseguir copiar o link de novo.
// A chave sai do JWT_SECRET (que já fica só no ambiente do backend).
const chaveCifra = () =>
  crypto
    .createHash("sha256")
    .update(`${process.env.JWT_SECRET || ""}:credito-remoto`)
    .digest();

const cifrarToken = (token) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", chaveCifra(), iv);
  const conteudo = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), conteudo]
    .map((parte) => parte.toString("base64url"))
    .join(".");
};

const decifrarToken = (valor) => {
  try {
    const [iv, tag, conteudo] = String(valor || "")
      .split(".")
      .map((parte) => Buffer.from(parte, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", chaveCifra(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(conteudo), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return null;
  }
};

const centavosParaReais = (centavos) => Number((centavos / 100).toFixed(2));

const whereMaquinasMachinePay = {
  ativo: true,
  machinePayPosId: { [Op.ne]: null },
};

// Link sem máquina fixa = máquinas com "GRU" maiúsculo como palavra inteira
// (\m e \M são as bordas de palavra do Postgres) — sem isso "Grua" de
// qualquer loja também entraria na lista. Link com máquina fixa (ex.: link
// de teste) = só aquela máquina.
const whereMaquinasDoLink = (link) =>
  link?.maquinaId
    ? { ...whereMaquinasMachinePay, id: link.maquinaId }
    : { ...whereMaquinasMachinePay, nome: { [Op.regexp]: "\\mGRU\\M" } };

const listarMaquinasDoLink = (link) =>
  Maquina.findAll({
    where: whereMaquinasDoLink(link),
    attributes: ["id", "nome"],
    order: [["nome", "ASC"]],
  });

const calcularSituacao = (link) => {
  if (link.revogadoEm) return "revogado";
  if (link.usadoCentavos >= link.limiteCentavos) return "esgotado";
  if (link.expiraEm && new Date(link.expiraEm) <= new Date()) return "expirado";
  if (!link.ativo) return "inativo";
  return "ativo";
};

const resumoLink = (link) => ({
  id: link.id,
  descricao: link.descricao,
  limite: centavosParaReais(link.limiteCentavos),
  usado: centavosParaReais(link.usadoCentavos),
  restante: centavosParaReais(
    Math.max(0, link.limiteCentavos - link.usadoCentavos),
  ),
  expiraEm: link.expiraEm,
  revogadoEm: link.revogadoEm,
  situacao: calcularSituacao(link),
  maquina: link.maquinaId ? link.maquina?.nome || "Máquina removida" : null,
  podeCopiar: Boolean(link.tokenCifrado),
  createdAt: link.createdAt,
  criadoPor: link.criadoPor?.nome || null,
});

const obterTokenRequisicao = (req) => {
  const token = String(req.headers["x-link-token"] || "");
  return FORMATO_TOKEN.test(token) ? token : null;
};

const obterIp = (req) =>
  String(req.headers["x-forwarded-for"] || req.ip || "").slice(0, 100);

// ---------------------------------------------------------------------------
// Rotas públicas (acessadas pelo link, sem login)
// ---------------------------------------------------------------------------

export const consultarLinkPublico = async (req, res) => {
  try {
    const token = obterTokenRequisicao(req);
    if (!token) {
      return res.status(404).json({ error: MENSAGEM_LINK_INVALIDO });
    }

    const link = await CreditoRemotoLink.findOne({
      where: { tokenHash: hashToken(token) },
    });
    if (!link) {
      return res.status(404).json({ error: MENSAGEM_LINK_INVALIDO });
    }

    const situacao = calcularSituacao(link);
    if (situacao !== "ativo") {
      return res.status(410).json({ error: "Este link expirou.", situacao });
    }

    const maquinas = await listarMaquinasDoLink(link);

    res.json({
      descricao: link.descricao,
      limite: centavosParaReais(link.limiteCentavos),
      usado: centavosParaReais(link.usadoCentavos),
      restante: centavosParaReais(link.limiteCentavos - link.usadoCentavos),
      maquinas: maquinas.map((maquina) => ({
        id: maquina.id,
        nome: maquina.nome,
      })),
    });
  } catch (error) {
    console.error("[CreditoRemoto] Erro ao consultar link:", error);
    res.status(500).json({ error: "Erro ao carregar o link." });
  }
};

export const enviarCreditoPublico = async (req, res) => {
  const token = obterTokenRequisicao(req);
  if (!token) {
    return res.status(404).json({ error: MENSAGEM_LINK_INVALIDO });
  }

  const tokenHash = hashToken(token);
  const { maquinaId } = req.body || {};
  const valorNumero = Number(String(req.body?.valor ?? "").replace(",", "."));
  const valorCentavos = Math.round(valorNumero * 100);

  if (
    !Number.isFinite(valorNumero) ||
    Math.abs(valorNumero * 100 - valorCentavos) > 1e-6 ||
    valorCentavos < VALOR_MINIMO_ENVIO_CENTAVOS
  ) {
    return res
      .status(400)
      .json({ error: "Informe um valor válido de pelo menos R$ 1,00." });
  }

  if (!FORMATO_UUID.test(String(maquinaId || ""))) {
    return res.status(400).json({ error: "Máquina inválida." });
  }

  let envio;
  let saldo;

  try {
    const linkAtual = await CreditoRemotoLink.findOne({ where: { tokenHash } });
    if (!linkAtual) {
      return res.status(404).json({ error: MENSAGEM_LINK_INVALIDO });
    }

    const maquina = await Maquina.findOne({
      where: {
        [Op.and]: [whereMaquinasDoLink(linkAtual), { id: maquinaId }],
      },
      attributes: ["id", "nome", "machinePayPosId"],
    });
    if (!maquina) {
      return res.status(400).json({ error: "Máquina não permitida." });
    }

    // Reserva o valor no link de forma atômica: um único UPDATE que só passa
    // se o link estiver ativo e o novo total couber no limite. Dois cliques
    // ou abas ao mesmo tempo não conseguem passar do limite, porque o
    // Postgres trava a linha e o segundo UPDATE já enxerga o total do
    // primeiro. A constraint check_credito_remoto_limite é a última barreira.
    await sequelize.transaction(async (transaction) => {
      const [linha] = await sequelize.query(
        `UPDATE credito_remoto_links
            SET usado_centavos = usado_centavos + :valor,
                ativo = CASE
                  WHEN usado_centavos + :valor >= limite_centavos THEN false
                  ELSE ativo
                END,
                "updatedAt" = NOW()
          WHERE token_hash = :tokenHash
            AND maquina_id IS NOT DISTINCT FROM :maquinaFixa
            AND ativo = true
            AND revogado_em IS NULL
            AND (expira_em IS NULL OR expira_em > NOW())
            AND usado_centavos + :valor <= limite_centavos
        RETURNING id, usado_centavos, limite_centavos`,
        {
          replacements: {
            valor: valorCentavos,
            tokenHash,
            maquinaFixa: linkAtual.maquinaId || null,
          },
          type: QueryTypes.SELECT,
          transaction,
        },
      );

      if (!linha) return;

      saldo = linha;
      envio = await CreditoRemotoEnvio.create(
        {
          linkId: linha.id,
          maquinaId: maquina.id,
          valorCentavos,
          status: "pendente",
          ip: obterIp(req),
          userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
        },
        { transaction },
      );
    });

    if (!envio) {
      const link = await CreditoRemotoLink.findOne({ where: { tokenHash } });
      if (!link) {
        return res.status(404).json({ error: MENSAGEM_LINK_INVALIDO });
      }
      if (calcularSituacao(link) !== "ativo") {
        return res.status(410).json({ error: "Este link expirou." });
      }
      const restante = centavosParaReais(
        link.limiteCentavos - link.usadoCentavos,
      );
      return res.status(400).json({
        error: `Valor maior que o saldo disponível (R$ ${restante.toFixed(2).replace(".", ",")}).`,
        restante,
      });
    }

    const restante = centavosParaReais(
      saldo.limite_centavos - saldo.usado_centavos,
    );

    try {
      const resultado = await enviarCreditosMqttMachinePay({
        posId: maquina.machinePayPosId,
        creditos: centavosParaReais(valorCentavos),
      });

      await envio.update({
        status: resultado.sucesso ? "enviado" : "incerto",
        idwebhook: resultado.idwebhook || null,
        detalhe: JSON.stringify({
          wsOk: resultado.wsOk,
          wsErro: resultado.wsErro,
          resposta: resultado.resposta,
        }).slice(0, 4000),
      });

      return res.json({
        sucesso: resultado.sucesso,
        mensagem: resultado.sucesso
          ? `Crédito de R$ ${centavosParaReais(valorCentavos).toFixed(2).replace(".", ",")} enviado para ${maquina.nome}!`
          : "Crédito enviado, mas a máquina não confirmou. Confira na máquina antes de tentar de novo.",
        restante,
        expirou: restante <= 0,
      });
    } catch (erroMachinePay) {
      // O valor continua descontado: não dá pra saber se o crédito chegou ou
      // não na máquina. Um admin pode conferir no histórico de envios.
      await envio.update({
        status: "erro",
        detalhe: String(erroMachinePay.message || erroMachinePay).slice(0, 4000),
      });
      console.error("[CreditoRemoto] Erro Machine Pay:", erroMachinePay);

      return res.status(502).json({
        error:
          "Não foi possível confirmar o envio com a máquina. Confira na máquina e, se o crédito não entrou, fale com a equipe Agarra Mais.",
        restante,
        expirou: restante <= 0,
      });
    }
  } catch (error) {
    console.error("[CreditoRemoto] Erro ao enviar crédito:", error);
    return res.status(500).json({ error: "Erro ao enviar crédito." });
  }
};

// ---------------------------------------------------------------------------
// Rotas de admin
// ---------------------------------------------------------------------------

export const listarLinks = async (req, res) => {
  try {
    const [links, maquinasGru, maquinasMachinePay] = await Promise.all([
      CreditoRemotoLink.findAll({
        include: [
          { model: Usuario, as: "criadoPor", attributes: ["nome"] },
          { model: Maquina, as: "maquina", attributes: ["nome"] },
        ],
        order: [["createdAt", "DESC"]],
      }),
      listarMaquinasDoLink(null),
      Maquina.findAll({
        where: whereMaquinasMachinePay,
        attributes: ["id", "nome", "codigo"],
        order: [["nome", "ASC"]],
      }),
    ]);

    res.json({
      links: links.map(resumoLink),
      maquinasPermitidas: maquinasGru.map((maquina) => maquina.nome),
      maquinasMachinePay: maquinasMachinePay.map((maquina) => ({
        id: maquina.id,
        nome: maquina.nome || maquina.codigo,
      })),
    });
  } catch (error) {
    console.error("[CreditoRemoto] Erro ao listar links:", error);
    res.status(500).json({ error: "Erro ao listar links." });
  }
};

export const criarLink = async (req, res) => {
  try {
    const descricao = String(req.body?.descricao || "").trim().slice(0, 150);
    const limiteReais = Number(
      String(req.body?.limite ?? LIMITE_PADRAO_REAIS).replace(",", "."),
    );
    const limiteCentavos = Math.round(limiteReais * 100);
    const expiraEm = req.body?.expiraEm ? new Date(req.body.expiraEm) : null;
    const maquinaId = req.body?.maquinaId || null;

    if (!descricao) {
      return res.status(400).json({ error: "Informe para quem é o link." });
    }
    if (
      !Number.isFinite(limiteReais) ||
      limiteCentavos < VALOR_MINIMO_ENVIO_CENTAVOS ||
      limiteCentavos > LIMITE_MAXIMO_REAIS * 100
    ) {
      return res.status(400).json({ error: "Limite inválido." });
    }
    if (expiraEm && (Number.isNaN(expiraEm.getTime()) || expiraEm <= new Date())) {
      return res.status(400).json({ error: "Data de expiração inválida." });
    }

    let maquina = null;
    if (maquinaId) {
      maquina = FORMATO_UUID.test(String(maquinaId))
        ? await Maquina.findOne({
            where: { ...whereMaquinasMachinePay, id: maquinaId },
            attributes: ["id", "nome"],
          })
        : null;
      if (!maquina) {
        return res.status(400).json({
          error: "Máquina inválida: precisa estar ativa e ter ID Machine Pay.",
        });
      }
    }

    const token = gerarToken();
    const link = await CreditoRemotoLink.create({
      descricao,
      tokenHash: hashToken(token),
      tokenCifrado: cifrarToken(token),
      maquinaId: maquina?.id || null,
      limiteCentavos,
      expiraEm,
      criadoPorId: req.usuario.id,
    });
    link.maquina = maquina;

    res.status(201).json({ ...resumoLink(link), token });
  } catch (error) {
    console.error("[CreditoRemoto] Erro ao criar link:", error);
    res.status(500).json({ error: "Erro ao criar link." });
  }
};

export const bloquearLink = async (req, res) => {
  try {
    const link = await CreditoRemotoLink.findByPk(req.params.id);
    if (!link) {
      return res.status(404).json({ error: "Link não encontrado." });
    }

    await link.update({ ativo: false, revogadoEm: link.revogadoEm || new Date() });
    res.json(resumoLink(link));
  } catch (error) {
    console.error("[CreditoRemoto] Erro ao bloquear link:", error);
    res.status(500).json({ error: "Erro ao bloquear link." });
  }
};

export const obterTokenLink = async (req, res) => {
  try {
    const link = await CreditoRemotoLink.findByPk(req.params.id);
    if (!link) {
      return res.status(404).json({ error: "Link não encontrado." });
    }

    const token = decifrarToken(link.tokenCifrado);
    if (!token || hashToken(token) !== link.tokenHash) {
      return res
        .status(400)
        .json({ error: "Este link não pode ser copiado de novo. Gere outro." });
    }

    res.json({ token });
  } catch (error) {
    console.error("[CreditoRemoto] Erro ao obter link:", error);
    res.status(500).json({ error: "Erro ao obter link." });
  }
};

export const listarEnviosLink = async (req, res) => {
  try {
    const envios = await CreditoRemotoEnvio.findAll({
      where: { linkId: req.params.id },
      include: [{ model: Maquina, as: "maquina", attributes: ["nome"] }],
      order: [["createdAt", "DESC"]],
    });

    res.json(
      envios.map((envio) => ({
        id: envio.id,
        maquina: envio.maquina?.nome || "-",
        valor: centavosParaReais(envio.valorCentavos),
        status: envio.status,
        idwebhook: envio.idwebhook,
        detalhe: envio.status === "enviado" ? null : envio.detalhe,
        ip: envio.ip,
        createdAt: envio.createdAt,
      })),
    );
  } catch (error) {
    console.error("[CreditoRemoto] Erro ao listar envios:", error);
    res.status(500).json({ error: "Erro ao listar envios." });
  }
};
