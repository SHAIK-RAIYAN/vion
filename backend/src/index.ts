import express from "express";
import { PORT } from "./config/config";
import { db } from "./prisma/db";
import router from "./routes";
import { errorHandler } from "./middlewares/errorHandler";

const app = express();

app.use(express.json());

app.use("/api/v1", router);

app.use(errorHandler);
app.listen(PORT, async () => {
  console.log("Server Started");
  db.connect().then(() => console.log("connected to db"));
});
