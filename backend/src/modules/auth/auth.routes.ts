import express from "express";
import { signUpUser } from "./auth.controller";

const router = express.Router();

router.post("/signup", signUpUser);

export default router;
