import express from "express";
import { PORT } from "./config/config";
import { connectDB } from "./models/db/connectDb";

const app = express();

app.use(express.json());

app.listen(PORT, async () => {
  console.log("Server Started");
  await connectDB();
  console.log("Connected to DB");
});
