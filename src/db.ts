const DATABASE_URL = process.env.DATABASE_URL
const dbPath = process.env.DATABASE_PATH ?? 'data.db'

function convertPlaceholders(sql: string): string {
  let i = 0
  return sql.replace(/\?/g, () => `$${++i}`)
}

type PrepareResult = {
  all: (...params: unknown[]) => Promise<unknown[]>
  run: (...params: unknown[]) => Promise<void>
}

let _db: {
  prepare: (sql: string) => PrepareResult
  isPostgres: boolean
}

if (DATABASE_URL?.startsWith('postgres')) {
  const postgres = (await import('postgres')).default
  const sql = postgres(DATABASE_URL, { max: 1 })
  try {
    await sql.unsafe('SELECT 1')
    console.log('DB connected: Supabase (Postgres)')
  } catch (err) {
    console.error('DB connection failed:', err instanceof Error ? err.message : err)
    throw err
  }
  await sql.unsafe('SET client_min_messages TO WARNING')
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      user_name TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  _db = {
    isPostgres: true,
    prepare(query: string) {
      const converted = convertPlaceholders(query)
      return {
        all: (...params: unknown[]) => sql.unsafe(converted, params as never[]) as Promise<unknown[]>,
        run: (...params: unknown[]) => sql.unsafe(converted, params as never[]).then((): void => {})
      }
    }
  }
} else {
  const { Database } = await import('bun:sqlite')
  const sqlite = new Database(dbPath)
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  type TEXT CHECK(type IN ('income','expense')) NOT NULL,
  amount INTEGER CHECK(amount > 0) NOT NULL,
  category TEXT NOT NULL,
  reason TEXT,
  is_family INTEGER DEFAULT 0,
  date TEXT NOT NULL,
  payment_mode TEXT DEFAULT 'UPI',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_date 
  ON transactions(user_id, date);

CREATE INDEX IF NOT EXISTS idx_user_type 
  ON transactions(user_id, type);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  user_name TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`)
  try {
    sqlite.exec(`ALTER TABLE transactions ADD COLUMN payment_mode TEXT DEFAULT 'UPI'`)
  } catch {
    /* column already exists */
  }
  console.log('DB connected: SQLite (' + dbPath + ')')
  _db = {
    isPostgres: false,
    prepare(query: string) {
      const stmt = sqlite.prepare(query)
      return {
        all: (...params: unknown[]) => Promise.resolve(stmt.all(...(params as never[])) as unknown[]),
        run: (...params: unknown[]) => Promise.resolve(stmt.run(...(params as never[]))).then((): void => {})
      }
    }
  }
}

export const db = _db
export const isPostgres = _db.isPostgres
