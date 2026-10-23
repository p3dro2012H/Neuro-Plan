export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  method?: "GET" | "POST" | "PUT" | "DELETE",
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      credentials: "same-origin",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(
        path.startsWith("/assistente/") ? 45000 : 20000,
      ),
    });
  } catch {
    throw new ApiError(
      0,
      "Sem conexão com o servidor. Novos registros estão suspensos. Reconecte para consultar o que foi salvo.",
    );
  }
  // Uma API antiga pode devolver o index.html com HTTP 200 para rotas novas.
  // Não entregar esse resultado aos componentes como se fossem dados válidos.
  const invalidResponse = () =>
    new ApiError(
      response.ok ? 503 : response.status,
      "O servidor não retornou os dados esperados. Reinicie o servidor e reconecte para carregar a versão atual.",
    );
  if (
    !/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(
      response.headers.get("Content-Type") ?? "",
    )
  )
    throw invalidResponse();
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw invalidResponse();
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      data?.erro ?? "Não foi possível concluir a operação.",
    );
  return data as T;
}
