import Database from "better-sqlite3";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";

export interface StoredMessage {
  id: number;
  device_label: string;
  body: string;
  sender: string | null;
  received_at: number;
  ingested_at: number;
}

export interface NewMessage {
  device_label: string;
  body: string;
  sender?: string | null;
  received_at: number;
  ingested_at: number;
}

export class SQLiteStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_label TEXT NOT NULL,
        body TEXT NOT NULL,
        sender TEXT,
        received_at INTEGER NOT NULL,
        ingested_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_received ON messages(received_at);
    `);
    if (dbPath !== ":memory:") {
      try {
        chmodSync(dbPath, 0o600);
      } catch {
        // best-effort on platforms/filesystems that don't support chmod
      }
    }
  }

  insertMessage(m: NewMessage): number {
    const stmt = this.db.prepare(
      `INSERT INTO messages (device_label, body, sender, received_at, ingested_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    const info = stmt.run(m.device_label, m.body, m.sender ?? null, m.received_at, m.ingested_at);
    return Number(info.lastInsertRowid);
  }

  queryMessages(opts: { device?: string; sinceMs: number }): StoredMessage[] {
    if (opts.device !== undefined) {
      return this.db
        .prepare(
          `SELECT * FROM messages
           WHERE received_at >= ? AND device_label = ?
           ORDER BY received_at DESC, id DESC`
        )
        .all(opts.sinceMs, opts.device) as StoredMessage[];
    }
    return this.db
      .prepare(
        `SELECT * FROM messages
         WHERE received_at >= ?
         ORDER BY received_at DESC, id DESC`
      )
      .all(opts.sinceMs) as StoredMessage[];
  }

  close(): void {
    this.db.close();
  }
}
