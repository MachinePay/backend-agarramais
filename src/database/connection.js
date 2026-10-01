import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

// Fuso usado pelo Sequelize ao GRAVAR datas. Precisa ser o mesmo fuso que o
// processo usa pra LER (process.env.TZ, definido em src/index.js): as colunas
// são "timestamp without time zone", então o driver pg lê no fuso do
// processo. Sem isso o Sequelize grava em UTC (padrão "+00:00") e lê em
// horário de Brasília — ex.: o fechamento de setembro ia pro banco como
// 01/09 03:00 → 01/10 02:59 e aparecia também em outubro.
const TIMEZONE_BANCO = "-03:00";

// Se DATABASE_URL estiver definida (Render), usar ela
// Caso contrário, usar as variáveis individuais (desenvolvimento local)
export const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, {
      dialect: "postgres",
      timezone: TIMEZONE_BANCO,
      logging: process.env.NODE_ENV === "development" ? console.log : false,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false, // Necessário para Render
        },
      },
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
    })
  : new Sequelize(
      process.env.DB_NAME || "agarramais_db",
      process.env.DB_USER || "postgres",
      process.env.DB_PASSWORD || "postgres",
      {
        host: process.env.DB_HOST || "localhost",
        port: process.env.DB_PORT || 5432,
        dialect: "postgres",
        timezone: TIMEZONE_BANCO,
        logging: process.env.NODE_ENV === "development" ? console.log : false,
        pool: {
          max: 5,
          min: 0,
          acquire: 30000,
          idle: 10000,
        },
      }
    );
