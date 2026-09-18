import { Router } from "express";
import { criarAlerta } from "../controllers/alertas.controller";

export const alertasRouter = Router();

alertasRouter.post("/alertas", criarAlerta);
