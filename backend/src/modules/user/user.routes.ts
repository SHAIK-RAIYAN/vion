import { Router } from "express";
import {
  getuser,
  updateUser,
  deleteUser,
  changePassword,
} from "./user.controller";

const router = Router();

router.get("/me", getuser);
router.patch("/me", updateUser);
router.delete("/me", deleteUser);
router.patch("/me/changePassword", changePassword);

export default router;
