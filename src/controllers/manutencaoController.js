import { Op } from "sequelize";
import { sequelize } from "../database/connection.js";
import {
  GastoVariavel,
  Loja,
  Manutencao,
  ManutencaoUsuario,
  Maquina,
  Usuario,
} from "../models/index.js";
import { ROLES_MANUTENCAO } from "../constants/roles.js";

const includeAdmin = [
  {
    model: Usuario,
    as: "criadoPor",
    attributes: ["id", "nome", "email", "role"],
  },
  {
    model: Usuario,
    as: "resolvidoPor",
    attributes: ["id", "nome", "email", "role"],
  },
  {
    model: Usuario,
    as: "funcionariosPermitidos",
    attributes: ["id", "nome", "email"],
    through: { attributes: [] },
  },
  {
    model: Loja,
    as: "loja",
    attributes: ["id", "nome"],
  },
  {
    model: Maquina,
    as: "maquina",
    attributes: ["id", "nome", "codigo"],
  },
];

const PRIORIDADES = ["BAIXA", "MEDIA", "ALTA", "URGENTE"];

const prioridadeValida = (valor) =>
  PRIORIDADES.includes(valor) ? valor : "MEDIA";

// "YYYY-MM-DD" ou vazio (sem prazo). Qualquer outra coisa é inválida.
const prazoValido = (valor) => {
  if (valor === undefined) return undefined;
  if (!valor) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : false;
};

const lerCusto = (custo) => {
  const informado = custo !== undefined && custo !== null && custo !== "";
  if (!informado) return { informado: false, valor: null };
  const valor = Number(String(custo).replace(",", "."));
  return {
    informado: true,
    valor,
    invalido: !Number.isFinite(valor) || valor < 0,
  };
};

// Gasto variável da loja gerado pelo custo de uma manutenção.
const lancarGastoManutencao = (
  { lojaId, titulo, descricao, id },
  valor,
  transaction,
) => {
  const agora = new Date();
  return GastoVariavel.create(
    {
      lojaId,
      nome: `Manutenção - ${titulo}`,
      valor,
      observacao: `Gerado automaticamente pela manutenção ${id}${descricao ? ` | ${descricao}` : ""}`,
      dataInicio: agora,
      dataFim: agora,
    },
    { transaction },
  );
};

export const listarFuncionariosManutencao = async (req, res) => {
  try {
    const funcionarios = await Usuario.findAll({
      where: {
        role: { [Op.in]: ROLES_MANUTENCAO },
        ativo: true,
      },
      attributes: ["id", "nome", "email"],
      order: [["nome", "ASC"]],
    });

    res.json(funcionarios);
  } catch (error) {
    console.error("Erro ao listar funcionários para manutenção:", error);
    res.status(500).json({ error: "Erro ao listar funcionários" });
  }
};

export const criarManutencao = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      titulo,
      descricao,
      funcionariosIds,
      custo,
      maquinaId,
      prioridade,
      prazo,
    } = req.body;
    let { lojaId } = req.body;

    const prazoFinal = prazoValido(prazo);
    if (prazoFinal === false) {
      await transaction.rollback();
      return res.status(400).json({ error: "Prazo inválido." });
    }

    // Com máquina, a loja é sempre a dela.
    if (maquinaId) {
      const maquina = await Maquina.findByPk(maquinaId, { transaction });
      if (!maquina) {
        await transaction.rollback();
        return res.status(400).json({ error: "Máquina não encontrada." });
      }
      lojaId = maquina.lojaId;
    }

    if (!titulo || !descricao) {
      await transaction.rollback();
      return res
        .status(400)
        .json({ error: "Título e descrição são obrigatórios" });
    }

    if (!Array.isArray(funcionariosIds) || funcionariosIds.length === 0) {
      await transaction.rollback();
      return res
        .status(400)
        .json({ error: "Selecione ao menos um funcionário" });
    }

    const idsUnicos = [...new Set(funcionariosIds.filter(Boolean))];

    const custoInformado =
      custo !== undefined && custo !== null && custo !== "";
    const custoNumerico = custoInformado
      ? Number(String(custo).replace(",", "."))
      : null;

    if (
      custoInformado &&
      (!Number.isFinite(custoNumerico) || custoNumerico < 0)
    ) {
      await transaction.rollback();
      return res.status(400).json({
        error:
          "Custo inválido. Informe um valor numérico maior ou igual a zero.",
      });
    }

    if (custoInformado && custoNumerico > 0 && !lojaId) {
      await transaction.rollback();
      return res.status(400).json({
        error:
          "Selecione uma loja para registrar o gasto variável da manutenção.",
      });
    }

    const funcionarios = await Usuario.findAll({
      where: {
        id: { [Op.in]: idsUnicos },
        role: { [Op.in]: ROLES_MANUTENCAO },
        ativo: true,
      },
      attributes: ["id"],
      transaction,
    });

    if (funcionarios.length !== idsUnicos.length) {
      await transaction.rollback();
      return res.status(400).json({
        error: "Um ou mais funcionários informados são inválidos ou inativos",
      });
    }

    if (lojaId) {
      const loja = await Loja.findByPk(lojaId, { transaction });
      if (!loja) {
        await transaction.rollback();
        return res.status(400).json({ error: "Loja informada não encontrada" });
      }
    }

    const manutencao = await Manutencao.create(
      {
        titulo,
        descricao,
        custo: custoInformado ? custoNumerico : null,
        lojaId: lojaId || null,
        maquinaId: maquinaId || null,
        prioridade: prioridadeValida(prioridade),
        prazo: prazoFinal ?? null,
        criadoPorId: req.usuario.id,
      },
      { transaction },
    );

    await ManutencaoUsuario.bulkCreate(
      idsUnicos.map((usuarioId) => ({
        manutencaoId: manutencao.id,
        usuarioId,
      })),
      { transaction },
    );

    if (custoInformado && custoNumerico > 0 && lojaId) {
      await lancarGastoManutencao(
        { lojaId, titulo, descricao, id: manutencao.id },
        custoNumerico,
        transaction,
      );
    }

    await transaction.commit();

    const manutencaoCompleta = await Manutencao.findByPk(manutencao.id, {
      include: includeAdmin,
    });

    res.locals.entityId = manutencao.id;
    res.status(201).json(manutencaoCompleta);
  } catch (error) {
    await transaction.rollback();
    console.error("Erro ao criar manutenção:", error);
    res.status(500).json({ error: "Erro ao criar manutenção" });
  }
};

export const listarManutencoes = async (req, res) => {
  try {
    const { status, dataInicio, dataFim, lojaId, usuarioId } = req.query;
    let include = [...includeAdmin];
    const where = {};

    if (req.usuario.role !== "ADMIN") {
      where.status = "PENDENTE";
      // Alertas automáticos (ex: fichas que não conferem) são só do admin.
      where.origem = "MANUAL";
      include = [
        {
          model: Usuario,
          as: "criadoPor",
          attributes: ["id", "nome", "email", "role"],
        },
        {
          model: Usuario,
          as: "resolvidoPor",
          attributes: ["id", "nome", "email", "role"],
        },
        {
          model: Usuario,
          as: "funcionariosPermitidos",
          attributes: ["id", "nome", "email"],
          through: { attributes: [] },
          where: { id: req.usuario.id },
          required: true,
        },
        {
          model: Loja,
          as: "loja",
          attributes: ["id", "nome"],
        },
        {
          model: Maquina,
          as: "maquina",
          attributes: ["id", "nome", "codigo"],
        },
      ];
    } else {
      if (status && ["PENDENTE", "RESOLVIDA"].includes(status)) {
        where.status = status;
      }

      if (lojaId) {
        where.lojaId = lojaId;
      }

      if (dataInicio || dataFim) {
        where.createdAt = {};

        if (dataInicio) {
          where.createdAt[Op.gte] = new Date(`${dataInicio}T00:00:00.000Z`);
        }

        if (dataFim) {
          where.createdAt[Op.lte] = new Date(`${dataFim}T23:59:59.999Z`);
        }
      }

      if (usuarioId) {
        include = include.map((item) => {
          if (item.as !== "funcionariosPermitidos") return item;
          return {
            ...item,
            where: { id: usuarioId },
            required: true,
          };
        });
      }
    }

    const manutencoes = await Manutencao.findAll({
      where,
      include,
      order: [["createdAt", "DESC"]],
    });

    res.json(manutencoes);
  } catch (error) {
    console.error("Erro ao listar manutenções:", error);
    res.status(500).json({ error: "Erro ao listar manutenções" });
  }
};

export const resolverManutencao = async (req, res) => {
  try {
    const manutencao = await Manutencao.findByPk(req.params.id, {
      include: [
        {
          model: Usuario,
          as: "funcionariosPermitidos",
          attributes: ["id"],
          through: { attributes: [] },
        },
      ],
    });

    if (!manutencao) {
      return res.status(404).json({ error: "Manutenção não encontrada" });
    }

    const usuarioPermitido =
      req.usuario.role === "ADMIN" ||
      manutencao.funcionariosPermitidos.some(
        (usuario) => usuario.id === req.usuario.id,
      );

    if (!usuarioPermitido) {
      return res.status(403).json({
        error: "Você não tem permissão para resolver esta manutenção",
      });
    }

    if (manutencao.status === "RESOLVIDA") {
      return res
        .status(400)
        .json({ error: "Esta manutenção já foi resolvida" });
    }

    const solucao =
      typeof req.body?.solucao === "string" ? req.body.solucao.trim() : "";
    const custo = lerCusto(req.body?.custo);
    if (custo.invalido) {
      return res.status(400).json({ error: "Custo inválido." });
    }
    // Custo só entra aqui se ainda não tinha sido informado na criação.
    const lancarCusto =
      custo.informado && custo.valor > 0 && manutencao.custo === null;
    if (lancarCusto && !manutencao.lojaId) {
      return res.status(400).json({
        error: "Esta manutenção não tem loja: não dá para lançar o custo.",
      });
    }

    const transaction = await sequelize.transaction();
    try {
      await manutencao.update(
        {
          status: "RESOLVIDA",
          resolvidoPorId: req.usuario.id,
          resolvidoEm: new Date(),
          solucao: solucao || null,
          ...(lancarCusto && { custo: custo.valor }),
        },
        { transaction },
      );
      if (lancarCusto) {
        await lancarGastoManutencao(manutencao, custo.valor, transaction);
      }
      await transaction.commit();
    } catch (erro) {
      await transaction.rollback();
      throw erro;
    }

    const manutencaoAtualizada = await Manutencao.findByPk(manutencao.id, {
      include: includeAdmin,
    });

    res.json(manutencaoAtualizada);
  } catch (error) {
    console.error("Erro ao resolver manutenção:", error);
    res.status(500).json({ error: "Erro ao resolver manutenção" });
  }
};

// Só admin: corrige título/descrição/prioridade/prazo/máquina e troca quem
// pode resolver. Custo não muda aqui (já virou gasto variável).
export const editarManutencao = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const manutencao = await Manutencao.findByPk(req.params.id, {
      transaction,
    });
    if (!manutencao) {
      await transaction.rollback();
      return res.status(404).json({ error: "Manutenção não encontrada" });
    }

    const { titulo, descricao, prioridade, prazo, maquinaId, funcionariosIds } =
      req.body;
    const mudancas = {};

    if (titulo !== undefined) {
      if (!String(titulo).trim()) {
        await transaction.rollback();
        return res.status(400).json({ error: "Título é obrigatório" });
      }
      mudancas.titulo = String(titulo).trim();
    }
    if (descricao !== undefined) {
      if (!String(descricao).trim()) {
        await transaction.rollback();
        return res.status(400).json({ error: "Descrição é obrigatória" });
      }
      mudancas.descricao = String(descricao).trim();
    }
    if (prioridade !== undefined) {
      mudancas.prioridade = prioridadeValida(prioridade);
    }
    const prazoFinal = prazoValido(prazo);
    if (prazoFinal === false) {
      await transaction.rollback();
      return res.status(400).json({ error: "Prazo inválido." });
    }
    if (prazoFinal !== undefined) mudancas.prazo = prazoFinal;

    if (maquinaId !== undefined) {
      if (maquinaId) {
        const maquina = await Maquina.findByPk(maquinaId, { transaction });
        if (!maquina) {
          await transaction.rollback();
          return res.status(400).json({ error: "Máquina não encontrada." });
        }
        mudancas.maquinaId = maquina.id;
        mudancas.lojaId = maquina.lojaId;
      } else {
        mudancas.maquinaId = null;
      }
    }

    await manutencao.update(mudancas, { transaction });

    if (Array.isArray(funcionariosIds)) {
      const idsUnicos = [...new Set(funcionariosIds.filter(Boolean))];
      if (idsUnicos.length === 0) {
        await transaction.rollback();
        return res
          .status(400)
          .json({ error: "Selecione ao menos um funcionário" });
      }
      const validos = await Usuario.count({
        where: {
          id: { [Op.in]: idsUnicos },
          role: { [Op.in]: ROLES_MANUTENCAO },
          ativo: true,
        },
        transaction,
      });
      if (validos !== idsUnicos.length) {
        await transaction.rollback();
        return res.status(400).json({
          error: "Um ou mais funcionários informados são inválidos ou inativos",
        });
      }
      await ManutencaoUsuario.destroy({
        where: { manutencaoId: manutencao.id },
        transaction,
      });
      await ManutencaoUsuario.bulkCreate(
        idsUnicos.map((usuarioId) => ({
          manutencaoId: manutencao.id,
          usuarioId,
        })),
        { transaction },
      );
    }

    await transaction.commit();

    const atualizada = await Manutencao.findByPk(manutencao.id, {
      include: includeAdmin,
    });
    res.locals.entityId = manutencao.id;
    res.json(atualizada);
  } catch (error) {
    await transaction.rollback();
    console.error("Erro ao editar manutenção:", error);
    res.status(500).json({ error: "Erro ao editar manutenção" });
  }
};
