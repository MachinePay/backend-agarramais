import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "../contexts/AuthContext";
import api from "./api";

export default function RegistroVeiculos({ veiculos = [], loading }) {
  const { usuario } = useContext(AuthContext);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [filtroVeiculo, setFiltroVeiculo] = useState("");
  const [filtroData, setFiltroData] = useState("");
  const [carregandoMov, setCarregandoMov] = useState(false);

  useEffect(() => {
    if (!usuario || usuario.role !== "ADMIN") return;
    const fetchMov = async () => {
      setCarregandoMov(true);
      try {
        const params = {};
        if (filtroVeiculo) params.veiculoId = filtroVeiculo;
        if (filtroData) params.dataInicio = filtroData;
        const { data } = await api.get("/movimentacao-veiculos", { params });
        setMovimentacoes(data);
      } catch (e) {
        setMovimentacoes([]);
      } finally {
        setCarregandoMov(false);
      }
    };
    fetchMov();
  }, [usuario, filtroVeiculo, filtroData]);

  if (!usuario || usuario.role !== "ADMIN") return null;
  if (loading) return <div className="p-6">Carregando veículos...</div>;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Registro de Veículos</h2>
      <div className="mb-4 flex gap-4 items-end">
        <div>
          <label className="block text-sm font-medium">
            Filtrar por veículo
          </label>
          <select
            className="border rounded p-1"
            value={filtroVeiculo}
            onChange={(e) => setFiltroVeiculo(e.target.value)}
          >
            <option value="">Todos</option>
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Filtrar por data</label>
          <input
            type="date"
            className="border rounded p-1"
            value={filtroData}
            onChange={(e) => setFiltroData(e.target.value)}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200 rounded-lg">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-4 py-2 border">Veículo</th>
              <th className="px-4 py-2 border">Usuário</th>
              <th className="px-4 py-2 border">Tipo</th>
              <th className="px-4 py-2 border">Data/Hora</th>
              <th className="px-4 py-2 border">Observação</th>
            </tr>
          </thead>
          <tbody>
            {carregandoMov ? (
              <tr>
                <td colSpan={5} className="text-center p-4">
                  Carregando movimentações...
                </td>
              </tr>
            ) : movimentacoes.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center p-4">
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              movimentacoes.map((mov) => (
                <tr key={mov.id} className="text-center">
                  <td className="px-4 py-2 border">
                    {mov.veiculo?.nome || "-"}
                  </td>
                  <td className="px-4 py-2 border">
                    {mov.usuario?.nome || "-"}
                  </td>
                  <td className="px-4 py-2 border">
                    {mov.tipo === "retirada" ? "Retirada" : "Devolução"}
                  </td>
                  <td className="px-4 py-2 border">
                    {new Date(mov.dataHora).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-2 border">{mov.observacao || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
