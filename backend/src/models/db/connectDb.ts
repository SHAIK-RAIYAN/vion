import { Pool } from "pg";
import { DB_URL } from "../../config/config";

const pool = new Pool({
  connectionString: DB_URL,
});
export async function connectDB() {
    
}
