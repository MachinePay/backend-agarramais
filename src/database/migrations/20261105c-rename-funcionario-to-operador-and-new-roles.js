// FUNCIONARIO passa a se chamar OPERADOR e entram os cargos OPERADOR_CHEFE,
// SUPORTE e FINANCEIRO. O servidor também faz isso sozinho na inicialização
// (server.js); esta migração é para rodar manualmente se precisar.
export async function up(queryInterface) {
  await queryInterface.sequelize.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'enum_usuarios_role' AND e.enumlabel = 'FUNCIONARIO'
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'enum_usuarios_role' AND e.enumlabel = 'OPERADOR'
      ) THEN
        ALTER TYPE "enum_usuarios_role" RENAME VALUE 'FUNCIONARIO' TO 'OPERADOR';
      END IF;
    END $$;
  `);
  for (const cargo of ["OPERADOR", "OPERADOR_CHEFE", "SUPORTE", "FINANCEIRO"]) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_usuarios_role" ADD VALUE IF NOT EXISTS '${cargo}';`,
    );
  }
  await queryInterface.sequelize.query(
    `UPDATE "usuarios" SET "role" = 'OPERADOR' WHERE "role"::text = 'FUNCIONARIO';`,
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "usuarios" ALTER COLUMN "role" SET DEFAULT 'OPERADOR';`,
  );
}

// Postgres não remove valores de enum; volta só o nome.
export async function down(queryInterface) {
  await queryInterface.sequelize.query(
    `ALTER TYPE "enum_usuarios_role" RENAME VALUE 'OPERADOR' TO 'FUNCIONARIO';`,
  );
}
