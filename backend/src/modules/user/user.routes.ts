import express from "express";
import { getuser } from "./user.controller";

const router = express.Router();

router.get("/me", getuser);

export default router;
