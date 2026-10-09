// Coleta periódica do status dos leitores Machine Pay (online/offline, quedas do dia,
// sinal). Desligue com MACHINE_PAY_MONITOR_ATIVO=false (ex: em desenvolvimento).
import {
  coletarStatusMachinePay,
  limparHistoricoAntigo,
  monitorConfigurado,
} from "../services/machinePayMonitorService.js";

const monitorLigado = () =>
  process.env.MACHINE_PAY_MONITOR_ATIVO !== "false" && monitorConfigurado();

export const intervaloMonitorMinutos = Math.min(
  Math.max(Number(process.env.MACHINE_PAY_MONITOR_INTERVALO_MIN) || 5, 1),
  59,
);

let iniciado = false;

export const iniciarMonitorMachinePay = () => {
  if (iniciado) return;
  iniciado = true;

  if (!monitorLigado()) {
    console.log("⏸️ Monitoramento Machine Pay desligado");
    return;
  }

  const coletar = async () => {
    if (!monitorLigado()) return;
    try {
      await coletarStatusMachinePay();
    } catch (error) {
      console.error("[MachinePay Monitor] Falha na coleta:", error.message);
    }
  };

  // Limpeza do histórico antigo: confere de hora em hora e roda às 3h.
  const limpar = async () => {
    if (!monitorLigado() || new Date().getHours() !== 3) return;
    try {
      const { eventos, diarios } = await limparHistoricoAntigo();
      console.log(
        `[MachinePay Monitor] Histórico antigo removido: ${eventos} eventos, ${diarios} dias`,
      );
    } catch (error) {
      console.error("[MachinePay Monitor] Falha na limpeza:", error.message);
    }
  };

  coletar();
  setInterval(coletar, intervaloMonitorMinutos * 60 * 1000);
  setInterval(limpar, 60 * 60 * 1000);
  console.log(
    `📡 Monitoramento Machine Pay ativo (a cada ${intervaloMonitorMinutos} min)`,
  );
};
