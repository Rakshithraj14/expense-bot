import { Database } from 'bun:sqlite'

const dbPath = process.env.DATABASE_PATH ?? 'data.db'
export const db = new Database(dbPath)

db.exec(`
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  type TEXT CHECK(type IN ('income','expense')) NOT NULL,
  amount INTEGER CHECK(amount > 0) NOT NULL,
  category TEXT NOT NULL,
  reason TEXT,
  is_family INTEGER DEFAULT 0,
  date TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_date 
  ON transactions(user_id, date);

CREATE INDEX IF NOT EXISTS idx_user_type 
  ON transactions(user_id, type);
`)
