import React, { useState, useEffect, useCallback } from "react";
import ControleVeiculos from "../components/ControleVeiculos";
import RegistroVeiculosMovimentacao from "./RegistroVeiculosMovimentacao";
import AlertasVeiculos from "../components/AlertasVeiculos";
import api from "./api";

const initialFormState = {
  tipo: "moto",
  nome: "",
  modelo: "",
  km: "",
  estado: "Bom",
  emoji: "🏍️",
  emUso: false,
  parada: false,
  modo: "trabalho",
  nivelCombustivel: "5 palzinhos",
  nivelLimpeza: "está limpo",
};

export default function Veiculos() {
  const [modalCadastro, setModalCadastro] = useState(false);
  const [mostrarAlertas, setMostrarAlertas] = useState(false);
  const [form, setForm] = useState(initialFormState);
  const [veiculos, setVeiculos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Usamos useCallback para que a função seja estável e possa ser usada no array de dependências do useEffect
  const fetchVeiculos = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/veiculos");
      setVeiculos(data);
    } catch (error) {
      console.error("Erro ao buscar veículos:", error);
      setVeiculos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Agora podemos adicionar fetchVeiculos como dependência sem criar loops
  useEffect(() => {
    fetchVeiculos();
  }, [fetchVeiculos]);

  const abrirModal = () => setModalCadastro(true);

  const fecharModal = () => {
    setModalCadastro(false);
    // Opcional: Resetar o form ao fechar se desejar
    // setForm(initialFormState);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => {
      // Pequena melhoria de UX: Se mudar o tipo, sugere o emoji correto
      if (name === "tipo") {
        return {
          ...prev,
          [name]: value,
          emoji: value === "moto" ? "🏍️" : "🚗",
        };
      }
      return { ...prev, [name]: value };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/veiculos", form);
      fetchVeiculos();
      fecharModal();
      setForm(initialFormState);
      alert("Veículo cadastrado com sucesso!");
    } catch (error) {
      console.error("Erro no cadastro:", error);
      alert("Erro ao cadastrar veículo");
    }
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap justify-between items-center mb-6 gap-2">
        <h1 className="text-3xl font-bold">Veículos</h1>
        <div className="flex gap-2">
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={abrirModal}
          >
            Cadastrar novo veículo
          </button>
          <button
            className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
            onClick={() => setMostrarAlertas((v) => !v)}
          >
            {mostrarAlertas ? "Ocultar alertas" : "Ver alertas de veículos"}
          </button>
        </div>
      </div>

      {mostrarAlertas && <AlertasVeiculos />}

      <ControleVeiculos
        veiculos={veiculos}
        onRefresh={fetchVeiculos}
        loading={loading}
      />

      <RegistroVeiculosMovimentacao veiculos={veiculos} loading={loading} />

      {/* Modal de cadastro */}
      {modalCadastro && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <form
            className="bg-white rounded-lg p-6 w-96 shadow-lg relative"
            onSubmit={handleSubmit}
          >
            <h2 className="text-lg font-bold mb-4">Cadastrar novo veículo</h2>

            <div className="mb-3">
              <label className="block text-sm font-medium">Tipo</label>
              <select
                name="tipo"
                value={form.tipo}
                onChange={handleChange}
                className="w-full border rounded p-1"
              >
                <option value="moto">Moto</option>
                <option value="carro">Carro</option>
              </select>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium">Nome</label>
              <input
                name="nome"
                value={form.nome}
                onChange={handleChange}
                className="w-full border rounded p-1"
                required
                placeholder="Ex: Start 160"
              />
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium">Modelo</label>
              <input
                name="modelo"
                value={form.modelo}
                onChange={handleChange}
                className="w-full border rounded p-1"
                required
                placeholder="Ex: Honda"
              />
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium">Km inicial</label>
              <input
                name="km"
                type="number"
                value={form.km}
                onChange={handleChange}
                className="w-full border rounded p-1"
                min="0"
                required
                onWheel={(e) => e.target.blur()}
              />
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium">Emoji</label>
              <select
                name="emoji"
                value={form.emoji}
                onChange={handleChange}
                className="w-full border rounded p-1"
              >
                <option value="🏍️">Moto 🏍️</option>
                <option value="🚗">Carro 🚗</option>
              </select>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium">Modo</label>
              <select
                name="modo"
                value={form.modo}
                onChange={handleChange}
                className="w-full border rounded p-1"
              >
                <option value="trabalho">Trabalho</option>
                <option value="emprestado">Emprestado</option>
              </select>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium">
                Nível de combustível
              </label>
              <select
                name="nivelCombustivel"
                value={form.nivelCombustivel}
                onChange={handleChange}
                className="w-full border rounded p-1"
              >
                <option value="5 palzinhos">5 palzinhos</option>
                <option value="4 palzinhos">4 palzinhos</option>
                <option value="3 palzinhos">3 palzinhos</option>
                <option value="2 palzinhos">2 palzinhos</option>
                <option value="1 palzinho">1 palzinho</option>
                <option value="Vazio">Vazio</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium">
                Nível de limpeza
              </label>
              <select
                name="nivelLimpeza"
                value={form.nivelLimpeza}
                onChange={handleChange}
                className="w-full border rounded p-1"
              >
                <option value="está limpo">Está limpo</option>
                <option value="precisa limpar">Precisa limpar</option>
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-1 bg-gray-300 rounded hover:bg-gray-400"
                onClick={fecharModal}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Cadastrar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
