import express from "express";
import { signUpUser } from "./auth.controller";
import { signInUser } from "./auth.controller";

const router = express.Router();

router.post("/signup", signUpUser);
router.post("/signin", signInUser)

export default router;
