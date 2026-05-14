import React from "react";
import { useLocation } from "react-router-dom";
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";

const formatarDataHora = (valor) => {
  if (!valor) return "-";

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return String(valor);

  return data.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  });
};

const lerValor = (alertData, chaves) => {
  for (const chave of chaves) {
    const valor = alertData?.[chave];
    if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
      return valor;
    }
  }

  return null;
};

const RelatorioConsolidado = () => {
  const location = useLocation();
  const { alertData } = location.state || {};

  if (!alertData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
        <div className="max-w-xl w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-xl text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-slate-900">
            Nenhum dado de alerta foi fornecido
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            Abra este relatório a partir da movimentação que gerou a divergência
            para ver o detalhe completo.
          </p>
        </div>
      </div>
    );
  }

  const maquina = lerValor(alertData, ["maquinaNome", "maquina"]) || "-";
  const loja = lerValor(alertData, ["lojaNome", "loja"]) || "-";
  const usuarioAnterior =
    lerValor(alertData, [
      "responsavelAnterior",
      "usuarioAnterior",
      "usuarioAnteriorNome",
    ]) || "Não informado";
  const usuarioAtual =
    lerValor(alertData, [
      "responsavelAtual",
      "usuarioAtual",
      "usuarioAtualNome",
    ]) || "Não informado";
  const dataAnterior = lerValor(alertData, [
    "dataMovimentacaoAnterior",
    "dataAnterior",
    "dataAnteriorMovimentacao",
  ]);
  const dataAtual = lerValor(alertData, [
    "dataMovimentacaoAtual",
    "dataAtual",
    "dataMovimentacao",
    "data",
  ]);
  const contadorOutAnterior = lerValor(alertData, ["contadorOutAnterior"]);
  const contadorOutAtual = lerValor(alertData, [
    "contadorOutAtual",
    "contador_out",
  ]);
  const saidaRegistrada = lerValor(alertData, ["saidaRegistrada", "sairam"]);
  const diferenca = lerValor(alertData, ["diferenca"]);
  const erro = lerValor(alertData, ["erro", "mensagem"]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-rose-50">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <section className="rounded-3xl border border-rose-100 bg-white/90 shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-rose-600 via-orange-500 to-amber-400 text-white px-6 py-8 sm:px-8">
            <p className="text-xs uppercase tracking-[0.3em] opacity-90">
              Relatório Consolidado
            </p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-black">
              Divergência de Movimentação
            </h1>
            <p className="mt-3 max-w-3xl text-sm sm:text-base text-white/90">
              Detalhamento da movimentação anterior e da movimentação atual com
              responsável e horário completos.
            </p>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Máquina
                </div>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {maquina}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Loja
                </div>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {loja}
                </div>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="text-xs uppercase tracking-wide text-rose-500">
                  Diferença
                </div>
                <div className="mt-1 text-lg font-black text-rose-700">
                  {diferenca !== null ? diferenca : "-"}
                </div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-xs uppercase tracking-wide text-amber-600">
                  Saída registrada
                </div>
                <div className="mt-1 text-lg font-black text-amber-700">
                  {saidaRegistrada !== null ? saidaRegistrada : "-"}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-start gap-3">
                <div className="mt-1 text-2xl">🧾</div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-slate-900">
                    Mensagem do alerta
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-700 whitespace-pre-line">
                    {erro ||
                      "A movimentação informada não bate com o histórico anterior."}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-black text-slate-900">
                    Movimentação anterior
                  </h2>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    Antes
                  </span>
                </div>
                <dl className="mt-5 space-y-4 text-sm">
                  <div>
                    <dt className="text-slate-500">Responsável</dt>
                    <dd className="mt-1 font-semibold text-slate-900">
                      {usuarioAnterior}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Data e hora</dt>
                    <dd className="mt-1 font-semibold text-slate-900">
                      {formatarDataHora(dataAnterior)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Contador OUT anterior</dt>
                    <dd className="mt-1 font-semibold text-slate-900">
                      {contadorOutAnterior !== null &&
                      contadorOutAnterior !== undefined
                        ? contadorOutAnterior
                        : "-"}
                    </dd>
                  </div>
                </dl>
              </article>

              <article className="rounded-3xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-black text-rose-900">
                    Movimentação atual
                  </h2>
                  <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
                    Atual
                  </span>
                </div>
                <dl className="mt-5 space-y-4 text-sm">
                  <div>
                    <dt className="text-rose-700/80">Responsável</dt>
                    <dd className="mt-1 font-semibold text-rose-950">
                      {usuarioAtual}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-rose-700/80">Data e hora</dt>
                    <dd className="mt-1 font-semibold text-rose-950">
                      {formatarDataHora(dataAtual)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-rose-700/80">Contador OUT atual</dt>
                    <dd className="mt-1 font-semibold text-rose-950">
                      {contadorOutAtual !== null &&
                      contadorOutAtual !== undefined
                        ? contadorOutAtual
                        : "-"}
                    </dd>
                  </div>
                </dl>
              </article>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-900 px-6 py-5 text-white shadow-lg">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-bold">Resumo do erro</h3>
                  <p className="text-sm text-white/80">
                    Use este relatório para revisar a movimentação anterior e a
                    movimentação atual com os dados completos.
                  </p>
                </div>
                <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold">
                  {formatarDataHora(dataAtual)}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default RelatorioConsolidado;
