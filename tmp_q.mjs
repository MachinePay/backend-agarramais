const { sequelize } = await import("./src/database/connection.js");
const [r] = await sequelize.query(`select * from registro_dinheiro where id in (358,359) order by id`);
for (const x of r) { const {id, createdAt, updatedAt, ...resto} = x; console.log(id, JSON.stringify(resto)); }
const [g] = await sequelize.query(`select table_name, column_name from information_schema.columns where column_name ilike '%registro%dinheiro%' or column_name ilike 'registroId'`);
console.log(g);
await sequelize.close();
