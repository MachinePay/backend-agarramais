// Ponto de entrada real do backend. Define o fuso horário do processo ANTES
// de qualquer outro módulo ser carregado — em especial antes da conexão com
// o banco (./database/connection.js) e de qualquer código que crie Date.
//
// Por quê: as colunas inicio/fim de registro_dinheiro (e outras) são
// "timestamp without time zone" no Postgres — não guardam fuso horário. O
// driver pg interpreta esses valores usando o fuso horário do PROCESSO que
// está lendo. Todo o resto do código (frontend e backend) monta essas datas
// assumindo horário de Brasília (ex.: `${data}T00:00:00`, sem "Z"). Se o
// processo do Node roda em outro fuso (o Render usa UTC por padrão), o mesmo
// registro é lido como um horário 3h diferente — o que já causou um bug real
// de registros de um mês vazando pra soma do mês seguinte.
//
// import estático é "hoisted" (roda antes de qualquer código do próprio
// arquivo), então setar process.env.TZ no server.js não adiantaria — os
// imports dele já teriam rodado antes. Por isso o bootstrap fica separado
// aqui, usando import() dinâmico, que só executa depois da linha acima.
process.env.TZ = process.env.TZ || "America/Sao_Paulo";

await import("./server.js");
