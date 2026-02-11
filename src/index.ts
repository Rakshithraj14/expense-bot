import { createBot } from './telegram'
import { parseInput } from './parser'
import { db } from './db'
import { getBalance, getMonthlySummary, getAllTransactions } from './queries'

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
    const lower = text.toLowerCase()
    if (lower === '/start') {
      await bot.sendMessage(chatId, 'Welcome aboard! From now on, every berry you spend is under my watch. Let\'s protect your treasure')
      return
    }
    if (lower === 'hi') {
      await bot.sendMessage(chatId, 'Hi~ If you\'re here, it means money is involved. I like that already')
      return
    }
    if (lower === 'hello') {
      await bot.sendMessage(chatId, 'Hello! Open your wallet carefully… I\'m keeping track of everything.')
      return
    }
    if (lower === 'help') {
      await bot.sendMessage(chatId, 'Lost with your expenses? Relax. Tell me what you spent, and I\'ll chart your money like a perfect map')
      return
    }

    if (lower === 'balance') {
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

    if (lower.includes('summary')) {
      const months = Number(text.match(/\d+/)?.[0] ?? 1)
      const familyOnly = lower.includes('family')

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

    if (lower === 'download' || lower === 'export' || lower === 'csv') {
      const rows = getAllTransactions(chatId)
      const escape = (v: string | number | null) => {
        if (v == null) return ''
        const s = String(v)
        if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
        return s
      }
      const header = 'id,type,amount,category,reason,is_family,date,created_at'
      const lines = rows.map(r => [r.id, r.type, r.amount, r.category, r.reason ?? '', r.is_family, r.date, r.created_at].map(escape).join(','))
      const csv = [header, ...lines].join('\n')
      const filename = `expenses-${new Date().toISOString().slice(0, 10)}.csv`
      await bot.sendDocument(chatId, csv, filename)
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
    if (message.includes('No amount found')) {
      await bot.sendMessage(chatId, 'Hmm? If it\'s about money, I\'m listening. If not… make it about money.')
    } else {
      await bot.sendMessage(chatId, `Error\n\n${message}`)
    }
  }
}

;(async () => {
  for await (const msg of bot.poll()) {
    const chatId = String(msg.chat.id)
    const text = msg.text?.trim()
    if (text) await handleMessage(chatId, text)
  }
})()
