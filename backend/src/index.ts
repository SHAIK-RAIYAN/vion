import express from "express";
import { PORT } from "./config/config";
import { db } from "./prisma/db";

const app = express();

app.use(express.json());

app.listen(PORT, async () => {
  console.log("Server Started");
  db.connect().then(() => console.log("connected to db"));
});
