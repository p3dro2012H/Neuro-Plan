export interface QueryResult {
  rows: any[];
  rowCount?: number | null;
}
export interface Connection {
  query(sql: string, values?: any[]): Promise<QueryResult>;
  release(): void;
}
export interface Database {
  query(sql: string, values?: any[]): Promise<QueryResult>;
  connect(): Promise<Connection>;
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function transaction<T>(
  db: Database,
  run: (cx: Connection) => Promise<T>,
): Promise<T> {
  const cx = await db.connect();
  try {
    await cx.query("BEGIN");
    const result = await run(cx);
    await cx.query("COMMIT");
    return result;
  } catch (error) {
    await cx.query("ROLLBACK");
    throw error;
  } finally {
    cx.release();
  }
}
