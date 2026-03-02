import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

function getToken() {
  return localStorage.getItem("token") || "";
}

async function request(path, options = {}) {
  const token = getToken();

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Erro na requisição");
  }

  if (response.status === 204) return null;
  return response.json();
}

export default function ManutencaoPage() {
  const [perfil, setPerfil] = useState(null);
  const [manutencoes, setManutencoes] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    funcionariosIds: [],
  });

  const isAdmin = perfil?.role === "ADMIN";

  const manutencoesOrdenadas = useMemo(
    () =>
      [...manutencoes].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      ),
    [manutencoes],
  );

  const carregarDados = async () => {
    try {
      setError("");
      const [perfilData, manutencoesData] = await Promise.all([
        request("/auth/perfil"),
        request("/manutencoes"),
      ]);

      setPerfil(perfilData);
      setManutencoes(Array.isArray(manutencoesData) ? manutencoesData : []);

      if (perfilData.role === "ADMIN") {
        const funcionariosData = await request("/manutencoes/funcionarios");
        setFuncionarios(
          Array.isArray(funcionariosData) ? funcionariosData : [],
        );
      } else {
        setFuncionarios([]);
      }
    } catch (err) {
      setError(err.message || "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  const handleSelectFuncionarios = (event) => {
    const ids = Array.from(event.target.selectedOptions).map(
      (opt) => opt.value,
    );
    setForm((prev) => ({ ...prev, funcionariosIds: ids }));
  };

  const handleCriar = async (event) => {
    event.preventDefault();
    if (!isAdmin) return;

    if (
      !form.titulo.trim() ||
      !form.descricao.trim() ||
      form.funcionariosIds.length === 0
    ) {
      setError("Preencha título, descrição e selecione os funcionários.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      await request("/manutencoes", {
        method: "POST",
        body: JSON.stringify({
          titulo: form.titulo.trim(),
          descricao: form.descricao.trim(),
          funcionariosIds: form.funcionariosIds,
        }),
      });

      setForm({ titulo: "", descricao: "", funcionariosIds: [] });
      await carregarDados();
    } catch (err) {
      setError(err.message || "Erro ao criar manutenção");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolver = async (id) => {
    try {
      setError("");
      await request(`/manutencoes/${id}/resolver`, { method: "PATCH" });
      await carregarDados();
    } catch (err) {
      setError(err.message || "Erro ao resolver manutenção");
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-600">Carregando manutenções...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-xl border bg-white p-4">
          <h1 className="text-2xl font-bold text-gray-900">Manutenção</h1>
          <p className="mt-1 text-sm text-gray-600">
            Usuário: <span className="font-medium">{perfil?.nome}</span> (
            {perfil?.role})
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isAdmin && (
          <form
            onSubmit={handleCriar}
            className="rounded-xl border bg-white p-4"
          >
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Lançar manutenção
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Título
                </label>
                <input
                  value={form.titulo}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, titulo: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                  placeholder="Ex: Troca de trava da máquina 12"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Descrição
                </label>
                <textarea
                  value={form.descricao}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, descricao: e.target.value }))
                  }
                  className="min-h-28 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                  placeholder="Descreva o problema ou atividade de manutenção"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Funcionários que podem visualizar/resolver
                </label>
                <select
                  multiple
                  value={form.funcionariosIds}
                  onChange={handleSelectFuncionarios}
                  className="min-h-40 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                >
                  {funcionarios.map((funcionario) => (
                    <option key={funcionario.id} value={funcionario.id}>
                      {funcionario.nome} ({funcionario.email})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Use Ctrl para selecionar múltiplos.
                </p>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {submitting ? "Salvando..." : "Lançar manutenção"}
              </button>
            </div>
          </form>
        )}

        <div className="rounded-xl border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Manutenções</h2>
            <button
              type="button"
              onClick={carregarDados}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Atualizar
            </button>
          </div>

          {manutencoesOrdenadas.length === 0 ? (
            <p className="text-sm text-gray-600">
              Nenhuma manutenção encontrada.
            </p>
          ) : (
            <div className="space-y-3">
              {manutencoesOrdenadas.map((item) => {
                const podeResolver =
                  item.status === "PENDENTE" &&
                  (isAdmin ||
                    (item.funcionariosPermitidos || []).some(
                      (f) => f.id === perfil?.id,
                    ));

                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-gray-200 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold text-gray-900">
                        {item.titulo}
                      </h3>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          item.status === "RESOLVIDA"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-gray-700">
                      {item.descricao}
                    </p>

                    <div className="mt-2 space-y-1 text-xs text-gray-600">
                      <p>Criado por: {item.criadoPor?.nome || "-"}</p>
                      <p>
                        Funcionários permitidos:{" "}
                        {(item.funcionariosPermitidos || [])
                          .map((f) => f.nome)
                          .join(", ") || "-"}
                      </p>
                      <p>Resolvido por: {item.resolvidoPor?.nome || "-"}</p>
                    </div>

                    {podeResolver && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => handleResolver(item.id)}
                          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                        >
                          Marcar como resolvido
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
