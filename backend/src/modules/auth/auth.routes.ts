import { Router } from "express";
import { signOutUser, signUpUser } from "./auth.controller";
import { signInUser } from "./auth.controller";

const router = Router();

router.post("/signup", signUpUser);
router.post("/signin", signInUser);
router.post("/signout", signOutUser);

export default router;
