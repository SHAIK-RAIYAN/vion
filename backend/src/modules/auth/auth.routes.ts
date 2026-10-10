import { Router } from "express";
import { signInUser, signOutUser, signUpUser, googleAuthUser } from "./auth.controller";

const router = Router();

router.post("/signup", signUpUser);
router.post("/signin", signInUser);
router.post("/google", googleAuthUser);
router.post("/signout", signOutUser);

export default router;
