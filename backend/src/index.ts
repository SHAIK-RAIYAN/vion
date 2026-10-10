import express from "express";
import { FRONTEND_URL, PORT } from "./config/config";
import { db } from "./prisma/db";
import router from "./routes";
import { errorHandler } from "./middlewares/errorHandler";
import cookieParser from "cookie-parser";
import cors from "cors";
const app = express();

app.use(express.json());
app.use(cookieParser());
const allowedOrigins = [
  FRONTEND_URL,
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  }),
);

app.use("/api/v1", router);

app.use(errorHandler);
app.listen(PORT, async () => {
  console.log("Server Started");
  db.connect().then(() => console.log("connected to db"));
});
