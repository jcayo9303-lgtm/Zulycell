import { Router } from "express";
import { COUNTRIES } from "../lib/countries.js";
import { PERMISSIONS } from "../lib/permissions.js";

const router = Router();

router.get("/countries", (_req, res) => {
  res.json(COUNTRIES);
});

router.get("/permissions", (_req, res) => {
  res.json(Object.entries(PERMISSIONS).map(([key, label]) => ({ key, label })));
});

export default router;
