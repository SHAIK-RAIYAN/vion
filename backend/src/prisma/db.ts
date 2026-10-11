import "temporal-polyfill/global";
import "dotenv/config";
import postgres from "@prisma/orm-postgres/runtime";
import type { Contract } from "./contract.d";
import contractJson from "./contract.json" with { type: "json" };
import { DB_URL } from "../config/config";

export const db = postgres<Contract>({
  contractJson,
  url: DB_URL!,
});
