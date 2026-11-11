// Cargos dos usuários. "OPERADOR" era "FUNCIONARIO" (renomeado no banco na
// inicialização do servidor, ver server.js).
export const ROLES = [
  "ADMIN",
  "OPERADOR",
  "OPERADOR_CHEFE",
  "SUPORTE",
  "FINANCEIRO",
  "MACHINEPAY",
  "COMERCIAL",
];

// Cargos que trabalham com lojas autorizadas (UsuarioLoja). Admin e
// operador chefe veem todas as lojas (ver ehGestao).
export const ROLES_COM_LOJAS = ["OPERADOR", "SUPORTE", "FINANCEIRO"];

// Gestão da operação: veem e gerenciam todas as manutenções, editam e
// corrigem movimentações e podem passar por cima das travas de contador /
// total pré (com aviso na tela), editam o estoque das lojas manualmente e
// têm acesso completo à lista de compras.
export const ROLES_GESTAO = ["ADMIN", "OPERADOR_CHEFE"];

export const ehGestao = (role) => ROLES_GESTAO.includes(role);

// Cargos que podem receber e resolver manutenções.
export const ROLES_MANUTENCAO = ["OPERADOR", "OPERADOR_CHEFE", "SUPORTE"];
