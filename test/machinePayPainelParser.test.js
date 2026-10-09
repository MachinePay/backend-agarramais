import test from "node:test";
import assert from "node:assert/strict";
import { parsearPainelMaquinas } from "../src/services/machinePayPainelParser.js";

// Trechos reduzidos com a mesma estrutura do HTML de maquinas.php?acao=maquinas.
const linha = ({ id, posId, nome, ligada, badge, sinal, extra = "" }) => `
<tr><td class="td_ops acao" onclick="mnu_op_maq(${id},8147637329025815);event.stopPropagation();">
<ul id="mnu_op_maq${id}" class="ul_maq_op"><li><i onclick="stats(${posId});" class="fa fa-area-chart">Pagamentos</i></li></ul>
<div style="display: inline-flex; align-items: center;"><i onclick="event.stopPropagation();" class="fa fa-bolt ${ligada ? "maq_on blink" : "maq_off"}" style="color:red;"></i><span style="background:#ff6347;">${badge}</span></div></td>
<td><span style="background-color: #306998;">V. 27.00</span></div><div style="font-size: 12px;">Versão WEBSOCKET</div><span>192 à vencer</span></td>
<td style="white-space: nowrap;" onclick="stats(${posId});"><img src="img/mercadopagologo.png" alt="Gateway" style="height: 40px;"><span style="background-color: #0095CD;">${nome}</span><span>
<img src="cliente-empresa.png" style="width: 20px;">Clube Kids(LIVIA)
</span><span>Caixa: ${posId}</span>${extra}</td>
<td class="maq-telemetria-cell" data-vendas-hoje="3"><div>3º</div><span>Vendas/Dia</span><span>R$ 22,00</span><img alt="Consultado"><span>MQTT Instantâneo</span></td>
<td><span>Total R$ 1.467,01</span><div>🚀 Quant. Vendas 309</div></td>
<td><span>⭐ Hoje R$ 10,00 18:26</span><span>PIX R$ 257,01</span><span>↩ Ontem R$ 2,00 21:33</span><span>Déb. R$ 448,00</span><span>🕘 Ant. R$ 6,00 06/10 19:17</span><span>Créd. R$ 762,00</span></td>
<td><progress class="snwifi"></progress><span class="progress-label snwifi-label ${sinal}">x</span><span>18/06/2025 17:41:18</span><a href="http://192.168.0.102"><span>192.168.0.102</span></a></td></tr>`;

test("extrai status, quedas e dados de cada leitor", () => {
  const html =
    "<table><tbody>" +
    linha({ id: 1172, posId: "104511811", nome: "Loja 14, Roldao Santana", ligada: true, badge: "3x", sinal: "otimo" }) +
    linha({ id: 1173, posId: "104511855", nome: "Loja 15 Atacadão", ligada: false, badge: "ok", sinal: "sem_sinal", extra: "<span>Serial: 1731903508</span>" }) +
    "</tbody></table>";

  const [primeira, segunda] = parsearPainelMaquinas(html);

  assert.equal(primeira.posId, "104511811");
  assert.equal(primeira.idPainel, "1172");
  assert.equal(primeira.online, true);
  assert.equal(primeira.quedasHoje, 3);
  assert.equal(primeira.nomePonto, "Loja 14, Roldao Santana");
  assert.equal(primeira.cliente, "Clube Kids(LIVIA)");
  assert.equal(primeira.tipoVersao, "WEBSOCKET");
  assert.equal(primeira.diasVencer, 192);
  assert.equal(primeira.modoResposta, "MQTT_INSTANTANEO");
  assert.equal(primeira.vendasHojeQtd, 3);
  assert.equal(primeira.vendasHojeValor, 22);
  assert.equal(primeira.totalValor, 1467.01);
  assert.equal(primeira.pix, 257.01);
  assert.deepEqual(primeira.ultimaVendaAnterior, { valor: 6, data: "06/10", hora: "19:17" });
  assert.equal(primeira.sinalWifi, "OTIMO");
  assert.equal(primeira.ip, "192.168.0.102");

  assert.equal(segunda.online, false);
  assert.equal(segunda.quedasHoje, 0);
  assert.equal(segunda.serial, "1731903508");
  assert.equal(segunda.sinalWifi, "SEM_SINAL");
});

test("HTML sem máquinas devolve lista vazia", () => {
  assert.deepEqual(parsearPainelMaquinas("<script>top.location='desconectado.php'</script>"), []);
});
