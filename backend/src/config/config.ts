import { config } from "dotenv";
config();

export const PORT = Number(process.env.PORT);
export const DB_URL = process.env.DATABASE_URL;
export const SALT_ROUNDS = Number(process.env.SALT_ROUNDS);
export const JWT_SECRET = process.env.JWT_SECRET_KEY;
export const NODE_ENV = process.env.NODE_ENV;
