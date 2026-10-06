import { PGlite } from "@electric-sql/pglite";
import { Connection, Database, QueryResult } from "./database";
/** PostgreSQL embarcado para demonstração local e testes, nunca para hospedagem. */
export class LocalDatabase implements Database {
  readonly pg: PGlite;
  private tail = Promise.resolve();
  constructor(folder?: string) {
    this.pg = new PGlite(folder);
  }
  private async acquire() {
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  }
  private async raw(sql: string, values: any[] = []): Promise<QueryResult> {
    if (!values.length && sql.includes(";")) {
      const result = await this.pg.exec(sql);
      return { rows: result.at(-1)?.rows ?? [] };
    }
    const result = await this.pg.query(sql, values);
    return { rows: result.rows, rowCount: result.affectedRows };
  }
  async query(sql: string, values: any[] = []) {
    const release = await this.acquire();
    try {
      return await this.raw(sql, values);
    } finally {
      release();
    }
  }
  async connect(): Promise<Connection> {
    const release = await this.acquire();
    return { query: (sql, values) => this.raw(sql, values), release };
  }
}
