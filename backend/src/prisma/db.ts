import "temporal-polyfill/global";
import "dotenv/config";
import postgres from "@prisma/orm-postgres/runtime";
import type { Contract } from "./contract.d";
import contractJson from "./contract.json" with { type: "json" };
import { DB_URL } from "../config/config";
import { Pool } from "pg";

export const db = postgres<Contract>({
  contractJson,
  url: DB_URL!,
});

export const pgPool = new Pool({
  connectionString: DB_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
