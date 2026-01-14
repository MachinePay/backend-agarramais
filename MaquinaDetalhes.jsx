import { useState, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import api from "../services/api";
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";
import { PageHeader, Badge, AlertBox } from "../components/UIComponents";
import { PageLoader } from "../components/Loading";

export function MaquinaDetalhes() {
  const { id } = useParams();
  const location = useLocation();
  const [maquina, setMaquina] = useState(null);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    carregarDados();
    // eslint-disable-next-line
  }, [id]);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const [maquinaRes, movimentacoesRes, problemaRes] = await Promise.all([
        api.get(`/maquinas/${id}`),
        api.get(`/movimentacoes?maquinaId=${id}`),
        api.get(`/maquinas/${id}/problema`),
      ]);
      setMaquina({
        ...maquinaRes.data,
        problemas: Array.isArray(problemaRes.data?.problemas)
          ? problemaRes.data.problemas
          : [],
      });
      setMovimentacoes(movimentacoesRes.data);
    } catch (error) {
      setError(
        "Erro ao carregar dados: " +
          (error.response?.data?.error || error.message)
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <PageLoader />;

  if (error) return <AlertBox type="error" message={error} />;

  if (!maquina)
    return <AlertBox type="error" message="Máquina não encontrada." />;

  return (
    <div className="min-h-screen bg-background-light">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex gap-4 mb-4">
          <button
            className="btn-secondary"
            onClick={() =>
              window.history.length > 1
                ? window.history.back()
                : window.location.assign("/alertas")
            }
          >
            Voltar para Alertas
          </button>
          <button
            className="btn-danger"
            onClick={async () => {
              try {
                await api.delete(
                  `/relatorios/alertas-movimentacao-inconsistente/${maquina.alertaId}`,
                  { data: { maquinaId: maquina.id } }
                );
                window.location.assign("/alertas");
              } catch (err) {
                alert("Erro ao marcar como corrigido.");
              }
            }}
            disabled={!maquina.alertaId}
            title="Marcar este alerta como corrigido"
          >
            Corrigido
          </button>
        </div>
        <PageHeader
          title={`Informações da Máquina: ${maquina.nome}`}
          subtitle={maquina.codigo}
          icon="🎰"
        />
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p>
                <strong>Tipo:</strong> {maquina.tipo || "-"}
              </p>
              <p>
                <strong>Capacidade:</strong>{" "}
                {maquina.capacidadePadrao || maquina.capacidade || "-"}
              </p>
              <p>
                <strong>Estoque Atual:</strong>{" "}
                {maquina.estoqueAtual !== undefined
                  ? maquina.estoqueAtual
                  : "-"}
              </p>
              <p>
                <strong>Valor da Ficha:</strong> R${" "}
                {typeof maquina.valorFicha === "number"
                  ? maquina.valorFicha.toFixed(2)
                  : maquina.valorFicha || "-"}
              </p>
              <p>
                <strong>Status:</strong>{" "}
                <Badge variant={maquina.ativa ? "success" : "danger"}>
                  {maquina.ativa ? "Ativa" : "Inativa"}
                </Badge>
              </p>
            </div>
            <div>
              <p>
                <strong>Força Fraca:</strong> {maquina.forcaFraca ?? "-"}%
              </p>
              <p>
                <strong>Força Forte:</strong> {maquina.forcaForte ?? "-"}%
              </p>
              <p>
                <strong>Força Premium:</strong> {maquina.forcaPremium ?? "-"}%
              </p>
              <p>
                <strong>Jogadas Premium:</strong>{" "}
                {maquina.jogadasPremium ?? "-"}
              </p>
            </div>
          </div>
        </div>
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-300 rounded text-yellow-900">
          <strong>Problema:</strong>{" "}
          {maquina.problemas && maquina.problemas.length > 0 ? (
            <ul className="list-disc ml-5">
              {maquina.problemas.map((p, idx) => (
                <li key={idx}>{p.mensagem}</li>
              ))}
            </ul>
          ) : (
            "Nenhum problema registrado para esta máquina."
          )}
        </div>
        <h2 className="text-xl font-bold mb-4">Movimentações</h2>
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          {movimentacoes.length === 0 ? (
            <p className="text-gray-500">Nenhuma movimentação encontrada.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2">Data</th>
                  <th className="text-left py-2">Entrada</th>
                  <th className="text-left py-2">Saída</th>
                  <th className="text-left py-2">Fichas</th>
                  <th className="text-left py-2">Observação</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.map((mov) => (
                  <tr key={mov.id} className="border-b">
                    <td>
                      {new Date(mov.dataColeta || mov.createdAt).toLocaleString(
                        "pt-BR"
                      )}
                    </td>
                    <td className="text-green-600">
                      {mov.abastecidas > 0 ? `+${mov.abastecidas}` : "-"}
                    </td>
                    <td className="text-red-600">
                      {mov.sairam > 0 ? `-${mov.sairam}` : "-"}
                    </td>
                    <td>{mov.fichas || 0}</td>
                    <td>{mov.observacoes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}

export default MaquinaDetalhes;
