import { Router } from "express";
import {
  getUser,
  updateUser,
  deleteUser,
  changePassword,
  getUserSubscriptions,
} from "./user.controller";

const router = Router();

router.get("/me", getUser);
router.patch("/me", updateUser);
router.delete("/me", deleteUser);
router.patch("/me/changePassword", changePassword);
router.get("/me/subscriptions", getUserSubscriptions);

export default router;

