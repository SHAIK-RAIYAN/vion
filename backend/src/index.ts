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
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  }),
);

app.use("/api/v1", router);

app.use(errorHandler);
app.listen(PORT, async () => {
  console.log("Server Started");
  db.connect().then(() => console.log("connected to db"));
});
