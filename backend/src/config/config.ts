import { config } from "dotenv";
config();

export const PORT = Number(process.env.PORT) || 3000;
export const DB_URL = process.env.DATABASE_URL;
export const SALT_ROUNDS = Number(process.env.SALT_ROUNDS) || 10;
export const JWT_SECRET = process.env.JWT_SECRET_KEY || "vion_secret_key_change_me_in_production";
export const NODE_ENV = process.env.NODE_ENV || "development";
export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
