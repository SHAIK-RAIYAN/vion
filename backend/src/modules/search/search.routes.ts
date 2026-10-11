import { Router } from "express";
import { searchContent, getSuggestions } from "./search.controller";

const router = Router();

// Section 13: SEARCH
router.get("/", searchContent);
router.get("/suggestions", getSuggestions);

export default router;
