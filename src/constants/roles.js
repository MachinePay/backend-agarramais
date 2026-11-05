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

// Cargos que trabalham com lojas autorizadas (UsuarioLoja).
export const ROLES_COM_LOJAS = [
  "OPERADOR",
  "OPERADOR_CHEFE",
  "SUPORTE",
  "FINANCEIRO",
];

// Cargos que podem receber e resolver manutenções.
export const ROLES_MANUTENCAO = ["OPERADOR", "OPERADOR_CHEFE", "SUPORTE"];
