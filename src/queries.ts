import { db, isPostgres } from './db'

export async function getBalance(userId: string) {
  const rows = await db.prepare(`
    SELECT type, SUM(amount) as total
    FROM transactions
    WHERE user_id = ?
    GROUP BY type
  `).all(userId)
  return rows as Array<{ type: string; total: number }>
}

export async function getMonthlySummary(
  userId: string,
  months: number,
  familyOnly = false
) {
  const sql = isPostgres
    ? `
    SELECT category, SUM(amount) as total
    FROM transactions
    WHERE user_id = ?
      AND date >= (CURRENT_DATE - (?)::integer * INTERVAL '1 month')::text
      ${familyOnly ? 'AND is_family = 1' : ''}
    GROUP BY category
  `
    : `
    SELECT category, SUM(amount) as total
    FROM transactions
    WHERE user_id = ?
      AND date >= date('now', ?)
      ${familyOnly ? 'AND is_family = 1' : ''}
    GROUP BY category
  `
  const params = isPostgres ? [userId, months] : [userId, `-${months} months`]
  const rows = await db.prepare(sql).all(...params)
  return rows as Array<{ category: string; total: number }>
}

export async function getAllTransactions(userId: string) {
  const rows = await db.prepare(`
    SELECT id, type, amount, category, reason, is_family, date, created_at, payment_mode
    FROM transactions
    WHERE user_id = ?
    ORDER BY date DESC, id DESC
  `).all(userId)
  return rows as Array<{
    id: number
    type: string
    amount: number
    category: string
    reason: string | null
    is_family: number
    date: string
    created_at: string
    payment_mode: string | null
  }>
}

export async function getDisplayName(userId: string): Promise<string | null> {
  const rows = await db.prepare(`
    SELECT user_name FROM user_profiles WHERE user_id = ?
  `).all(userId)
  const row = (rows as Array<{ user_name: string }>)[0]
  return row?.user_name ?? null
}

export async function setDisplayName(userId: string, name: string): Promise<void> {
  await db.prepare(`
    INSERT INTO user_profiles (user_id, user_name) VALUES (?, ?)
    ON CONFLICT (user_id) DO UPDATE SET user_name = excluded.user_name
  `).run(userId, name.trim())
}

export async function ensureUser(userId: string, defaultName: string): Promise<void> {
  const existing = await getDisplayName(userId)
  if (existing == null) {
    await setDisplayName(userId, defaultName || 'User')
  }
}

/** Last N months: each month's income and expense. For compare months. */
export async function getCompareMonths(userId: string, numMonths = 2) {
  const sql = isPostgres
    ? `
    SELECT to_char((date)::date, 'YYYY-MM') as month, type, SUM(amount)::bigint as total
    FROM transactions
    WHERE user_id = ?
      AND (date)::date >= (CURRENT_DATE - (? * INTERVAL '1 month'))
    GROUP BY to_char((date)::date, 'YYYY-MM'), type
    ORDER BY month DESC
  `
    : `
    SELECT strftime('%Y-%m', date) as month, type, SUM(amount) as total
    FROM transactions
    WHERE user_id = ?
      AND date >= date('now', ?)
    GROUP BY strftime('%Y-%m', date), type
    ORDER BY month DESC
  `
  const params = isPostgres ? [userId, numMonths] : [userId, `-${numMonths} months`]
  const rows = await db.prepare(sql).all(...params)
  return rows as Array<{ month: string; type: string; total: number }>
}

/** Top spending category (by total expense). */
export async function getTopCategory(userId: string) {
  const rows = await db.prepare(`
    SELECT category, SUM(amount) as total
    FROM transactions
    WHERE user_id = ? AND type = 'expense'
    GROUP BY category
    ORDER BY total DESC
    LIMIT 1
  `).all(userId)
  return (rows as Array<{ category: string; total: number }>)[0] ?? null
}

/** Single largest expense transaction. */
export async function getBiggestExpense(userId: string) {
  const rows = await db.prepare(`
    SELECT amount, category, reason, date
    FROM transactions
    WHERE user_id = ? AND type = 'expense'
    ORDER BY amount DESC
    LIMIT 1
  `).all(userId)
  return (rows as Array<{ amount: number; category: string; reason: string | null; date: string }>)[0] ?? null
}

/** Summary by last N days (category totals). */
export async function getSummaryByDays(
  userId: string,
  days: number,
  familyOnly = false
) {
  const sql = isPostgres
    ? `
    SELECT category, SUM(amount)::bigint as total
    FROM transactions
    WHERE user_id = ?
      AND (date)::date >= (CURRENT_DATE - (? * INTERVAL '1 day'))
      ${familyOnly ? 'AND is_family = 1' : ''}
    GROUP BY category
  `
    : `
    SELECT category, SUM(amount) as total
    FROM transactions
    WHERE user_id = ?
      AND date >= date('now', ?)
      ${familyOnly ? 'AND is_family = 1' : ''}
    GROUP BY category
  `
  const params = isPostgres ? [userId, days] : [userId, `-${days} days`]
  const rows = await db.prepare(sql).all(...params)
  return rows as Array<{ category: string; total: number }>
}
