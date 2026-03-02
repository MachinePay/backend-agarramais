import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";
import { PageLoader } from "../components/Loading";
import { AlertBox, Badge, PageHeader } from "../components/UIComponents";

export default function ManutencaoPage() {
  const { usuario, loading: authLoading } = useAuth();
  const [manutencoes, setManutencoes] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);
  const [lojas, setLojas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    funcionariosIds: [],
    custo: "",
    lojaId: "",
  });

  const isAdmin = usuario?.role === "ADMIN";

  const manutencoesOrdenadas = useMemo(
    () =>
      [...manutencoes].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      ),
    [manutencoes],
  );

  const carregarDados = useCallback(async () => {
    try {
      setError("");
      const manutencoesResponse = await api.get("/manutencoes");
      const manutencoesData = manutencoesResponse.data;
      setManutencoes(Array.isArray(manutencoesData) ? manutencoesData : []);

      if (usuario?.role === "ADMIN") {
        const [funcionariosResponse, lojasResponse] = await Promise.all([
          api.get("/manutencoes/funcionarios"),
          api.get("/lojas"),
        ]);
        const funcionariosData = funcionariosResponse.data;
        const lojasData = lojasResponse.data;
        setFuncionarios(
          Array.isArray(funcionariosData) ? funcionariosData : [],
        );
        setLojas(Array.isArray(lojasData) ? lojasData : []);
      } else {
        setFuncionarios([]);
        setLojas([]);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [usuario?.role]);

  useEffect(() => {
    if (authLoading) return;
    carregarDados();
  }, [authLoading, carregarDados]);

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

    const custoInformado = form.custo !== "";
    const custoNumerico = custoInformado
      ? Number(String(form.custo).replace(",", "."))
      : null;

    if (
      custoInformado &&
      (!Number.isFinite(custoNumerico) || custoNumerico < 0)
    ) {
      setError("Informe um custo válido (maior ou igual a zero).");
      return;
    }

    if (custoInformado && custoNumerico > 0 && !form.lojaId) {
      setError("Selecione a loja para lançar o gasto variável.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      await api.post("/manutencoes", {
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim(),
        funcionariosIds: form.funcionariosIds,
        custo: custoInformado ? custoNumerico : null,
        lojaId: form.lojaId || null,
      });

      setForm({
        titulo: "",
        descricao: "",
        funcionariosIds: [],
        custo: "",
        lojaId: "",
      });
      await carregarDados();
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao criar manutenção");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolver = async (id) => {
    try {
      setError("");
      await api.patch(`/manutencoes/${id}/resolver`);
      await carregarDados();
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao resolver manutenção");
    }
  };

  if (loading || authLoading) {
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen bg-background-light bg-pattern teddy-pattern">
      <Navbar />

      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          title="Manutenção"
          subtitle={`Usuário: ${usuario?.nome || "-"} (${usuario?.role || "-"})`}
          icon="🛠️"
        />

        {error && (
          <AlertBox type="error" message={error} onClose={() => setError("")} />
        )}

        {isAdmin && (
          <form onSubmit={handleCriar} className="card">
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

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Custo da manutenção (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.custo}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, custo: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                  placeholder="Ex: 150.00"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Loja do gasto variável
                </label>
                <select
                  value={form.lojaId}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, lojaId: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                >
                  <option value="">Selecione...</option>
                  {lojas.map((loja) => (
                    <option key={loja.id} value={loja.id}>
                      {loja.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary disabled:opacity-60"
              >
                {submitting ? "Salvando..." : "Lançar manutenção"}
              </button>
            </div>
          </form>
        )}

        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Manutenções</h2>
            <button
              type="button"
              onClick={carregarDados}
              className="btn-secondary"
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
                      (f) => f.id === usuario?.id,
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
                      <Badge
                        variant={
                          item.status === "RESOLVIDA" ? "success" : "warning"
                        }
                        size="sm"
                      >
                        {item.status}
                      </Badge>
                    </div>

                    <p className="mt-2 text-sm text-gray-700">
                      {item.descricao}
                    </p>

                    <div className="mt-2 space-y-1 text-xs text-gray-600">
                      <p>Criado por: {item.criadoPor?.nome || "-"}</p>
                      <p>
                        Custo:{" "}
                        {item.custo !== null && item.custo !== undefined
                          ? `R$ ${item.custo}`
                          : "-"}
                      </p>
                      <p>Loja: {item.loja?.nome || "-"}</p>
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
                          className="btn-primary"
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

      <Footer />
    </div>
  );
}
