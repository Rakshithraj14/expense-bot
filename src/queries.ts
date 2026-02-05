import { db } from './db'

export function getBalance(userId: string) {
  return db.prepare(`
    SELECT type, SUM(amount) as total
    FROM transactions
    WHERE user_id = ?
    GROUP BY type
  `).all(userId) as Array<{ type: string; total: number }>
}

export function getMonthlySummary(
  userId: string,
  months: number,
  familyOnly = false
) {
  return db.prepare(`
    SELECT category, SUM(amount) as total
    FROM transactions
    WHERE user_id = ?
      AND date >= date('now', ?)
      ${familyOnly ? 'AND is_family = 1' : ''}
    GROUP BY category
  `).all(userId, `-${months} months`) as Array<{
    category: string
    total: number
  }>
}
