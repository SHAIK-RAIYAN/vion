import { config } from "dotenv";
config();

export const PORT = process.env.PORT;
export const DB_URL = process.env.DATABASE_URL;
