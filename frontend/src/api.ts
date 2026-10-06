export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError(
      0,
      "Sem conexão com o servidor. Novos registros estão suspensos. Reconecte para consultar o que foi salvo.",
    );
  }
  const data = await response
    .json()
    .catch(() => ({
      erro: "O servidor ainda não está pronto. Tente reconectar.",
    }));
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.erro ?? "Não foi possível concluir a operação.",
    );
  return data as T;
}
