import { Router } from "express";
import { getuser, updateUser } from "./user.controller";

const router = Router();

router.get("/me", getuser);
router.post("/me", updateUser);

export default router;
