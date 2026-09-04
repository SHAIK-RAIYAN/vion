import { Router } from "express";
import { getuser } from "./user.controller";

const router = Router();

router.get("/me", getuser);

export default router;
