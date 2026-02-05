import { createBot } from './telegram'
import { parseInput } from './parser'
import { db } from './db'
import { getBalance, getMonthlySummary } from './queries'

const LOCK_FILE = 'data.bot.lock'

async function takeLock(): Promise<boolean> {
  try {
    const text = await Bun.file(LOCK_FILE).text()
    const pid = parseInt(text.trim(), 10)
    if (!Number.isNaN(pid)) {
      try {
        process.kill(pid, 0)
        console.error('Another bot instance is already running (PID %s). Exit that process or delete %s', pid, LOCK_FILE)
        return false
      } catch {
        /* process dead, take over */
      }
    }
  } catch {
    /* no lock file or unreadable */
  }
  Bun.write(LOCK_FILE, String(process.pid))
  const removeLock = () => {
    try { Bun.write(LOCK_FILE, '') } catch { /* ignore */ }
  }
  process.on('exit', removeLock)
  process.on('SIGINT', () => { removeLock(); process.exit(0) })
  process.on('SIGTERM', () => { removeLock(); process.exit(0) })
  return true
}

if (!(await takeLock())) process.exit(1)

const token = process.env.BOT_TOKEN
if (!token) {
  throw new Error('BOT_TOKEN environment variable is missing')
}

const bot = createBot(token)
console.log('Track your berries. Nami is watching the wallet')

async function handleMessage(chatId: string, text: string) {
  if (!text) return

  try {
    if (text === '/start' || text === 'hi' || text === 'help') {
      await bot.sendMessage(chatId, `
 Expense Tracker Bot

Examples:
- 500 groceries
- paid 200 medical
- received salary 30000
- grandfather gave 1000
- balance
- last 2 months summary
- last 1 month family summary
`.trim(), { parse_mode: 'Markdown' })
      return
    }

    if (text === 'balance') {
      const rows = getBalance(chatId)
      const income = rows.find(r => r.type === 'income')?.total ?? 0
      const expense = rows.find(r => r.type === 'expense')?.total ?? 0

      await bot.sendMessage(chatId, `
Balance

Income: ${income}
Expense: ${expense}
Net: ${income - expense}
`.trim(), { parse_mode: 'Markdown' })
      return
    }

    if (text.includes('summary')) {
      const months = Number(text.match(/\d+/)?.[0] ?? 1)
      const familyOnly = text.includes('family')

      const rows = getMonthlySummary(chatId, months, familyOnly)

      const body = rows.length
        ? rows.map(r => `- ${r.category}: ${r.total}`).join('\n')
        : 'No data'

      await bot.sendMessage(chatId, `
Summary (${months} months)

${body}
`.trim(), { parse_mode: 'Markdown' })
      return
    }

    const parsed = parseInput(text)

    db.prepare(`
      INSERT INTO transactions
      (user_id, type, amount, category, reason, is_family, date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      chatId,
      parsed.type,
      parsed.amount,
      parsed.category,
      parsed.reason ?? null,
      parsed.isFamily ? 1 : 0,
      parsed.date
    )

    await bot.sendMessage(chatId, `
Saved

Money: ${parsed.amount}
Category: ${parsed.category}
Reason: ${parsed.reason ?? 'N/A'}
Type: ${parsed.type}
Family: ${parsed.isFamily ? 'Yes' : 'No'}
Date: ${parsed.date}
`.trim(), { parse_mode: 'Markdown' })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    await bot.sendMessage(chatId, `
Error

${message}
`.trim(), { parse_mode: 'Markdown' })
  }
}

;(async () => {
  for await (const msg of bot.poll()) {
    const chatId = String(msg.chat.id)
    const text = msg.text?.trim()
    if (text) await handleMessage(chatId, text)
  }
})()
