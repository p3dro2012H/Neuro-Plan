import { Request, Response } from "express";
import { AlertaFadigaPayload } from "../types/alerta.types";
import { processarAlerta } from "../services/pausa.service";

export async function criarAlerta(req: Request, res: Response): Promise<void> {
  const payload = req.body as AlertaFadigaPayload;

  if (!payload.sessionId || !payload.tipo || payload.valorMetrica === undefined) {
    res.status(400).json({ erro: "Campos obrigatórios: sessionId, tipo, valorMetrica." });
    return;
  }

  try {
    const recomendacao = await processarAlerta(payload);
    res.status(201).json(recomendacao);
  } catch (erro) {
    console.error("Erro ao processar alerta:", erro);
    res.status(500).json({ erro: "Erro interno ao processar o alerta." });
  }
}
