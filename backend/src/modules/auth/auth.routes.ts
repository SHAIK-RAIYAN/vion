import { Router } from "express";
import {
  signInUser,
  signOutUser,
  signUpUser,
  googleAuthUser,
  getAuthMe,
  forgotPassword,
  resetPassword,
} from "./auth.controller";
import { authMiddleware } from "../../middlewares/authMiddleware";

const router = Router();

router.post("/signup", signUpUser);
router.post("/signin", signInUser);
router.post("/google", googleAuthUser);
router.post("/signout", signOutUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/me", authMiddleware, getAuthMe);

export default router;

