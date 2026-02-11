import { createBot } from './telegram'
import { parseInput } from './parser'
import { db } from './db'
import { getBalance, getMonthlySummary, getAllTransactions, getDisplayName, setDisplayName, ensureUser, getCompareMonths, getTopCategory, getBiggestExpense, getSummaryByDays } from './queries'

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

async function handleMessage(chatId: string, text: string, first_name?: string) {
  if (!text) return

  let name: string | null = null
  try {
    await ensureUser(chatId, first_name ?? 'User')
    name = await getDisplayName(chatId)
    const lower = text.toLowerCase()

    const n = name ? `, ${name}` : ''

    if (/^my name is\s+.+$/i.test(text.trim())) {
      const newName = text.replace(/^my name is\s+/i, '').trim()
      if (newName) {
        await setDisplayName(chatId, newName)
        await bot.sendMessage(chatId, `Got it, ${newName}. Your berries are safe with me—I\'ll remember who you are.`)
      }
      return
    }

    if (/^(my name\?|what'?s? my name|what is my name)$/i.test(text.trim())) {
      if (name) {
        await bot.sendMessage(chatId, `You\'re ${name}. Don\'t worry—I keep track of everyone\'s name when it comes to money.`)
      } else {
        await bot.sendMessage(chatId, 'You haven\'t told me yet. Say *my name is YourName* and I\'ll remember—no charge.', { parse_mode: 'Markdown' })
      }
      return
    }

    if (lower === '/start') {
      await bot.sendMessage(chatId, `Welcome aboard${n}! From now on, every berry you spend is under my watch. Let\'s protect your treasure.`)
      return
    }
    if (lower === 'hi') {
      await bot.sendMessage(chatId, `Hi${n}~ If you\'re here, it means berries are involved. I like that already.`)
      return
    }
    if (lower === 'hello') {
      await bot.sendMessage(chatId, `Hello${n}! Open your wallet carefully I\'m keeping track of everything.`)
      return
    }
    if (lower === 'help') {
      const menu = `
*Nami\'s map* — here\'s what I understand${name ? `, ${name}` : ''}:

• *balance* — Income, expense, net. Your treasure at a glance.
• *summary* — Spending by category (e.g. *summary 2* = 2 months).
• *summary 7 days* / *this week* — Last 7 days by category.
• *compare 2 months* / *last month vs this month* — This month vs last.
• *where did I spend most* / *top category* — Your biggest spending category.
• *biggest expense* — Single largest expense logged.
• *download* / *csv* — Your full ledger as CSV.
• *my name is X* — I\'ll call you X.
• *my name?* — I\'ll tell you what I call you.

`.trim()
      await bot.sendMessage(chatId, menu, { parse_mode: 'Markdown' })
      return
    }

    if (/^(compare\s*(\d+)\s*months?|compare\s*months?|last\s*month\s*vs\s*this\s*month)$/i.test(text.trim())) {
      const numMonths = Number(text.match(/\d+/)?.[0] ?? 2)
      const rows = await getCompareMonths(chatId, numMonths)
      const byMonth: Record<string, { income: number; expense: number }> = {}
      for (const r of rows) {
        if (!byMonth[r.month]) byMonth[r.month] = { income: 0, expense: 0 }
        byMonth[r.month][r.type as 'income' | 'expense'] = r.total
      }
      const months = Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0])).slice(0, numMonths)
      const lines = months.map(([m, t]) => {
        const net = t.income - t.expense
        return `*${m}* — Income: ${t.income} | Expense: ${t.expense} | Net: ${net}`
      })
      const diff = months.length >= 2
        ? (() => {
            const [thisM, lastM] = [months[0][1], months[1][1]]
            const incDiff = thisM.income - lastM.income
            const expDiff = thisM.expense - lastM.expense
            return `\n*Diff (this vs previous)*\nIncome: ${incDiff >= 0 ? '+' : ''}${incDiff} | Expense: ${expDiff >= 0 ? '+' : ''}${expDiff}`
          })()
        : ''
      await bot.sendMessage(chatId, `*Compare* (${numMonths} months)${name ? ` — ${name}` : ''}\n\n${lines.join('\n')}${diff}\n\nNavigator\'s verdict: keep an eye on the numbers.`, { parse_mode: 'Markdown' })
      return
    }

    if (lower === 'balance') {
      const rows = await getBalance(chatId)
      const income = rows.find(r => r.type === 'income')?.total ?? 0
      const expense = rows.find(r => r.type === 'expense')?.total ?? 0
      const net = income - expense

      await bot.sendMessage(chatId, `
*Balance*${name ? ` — ${name}` : ''}

Income: ${income}
Expense: ${expense}
Net: ${net}

${net >= 0 ? 'Your treasure is in good shape.' : 'Watch it—you\'re in the red. Time to navigate smarter.'}
`.trim(), { parse_mode: 'Markdown' })
      return
    }

    if (lower.includes('summary') || /^(this\s*week|last\s*\d+\s*days?)$/i.test(text.trim())) {
      const familyOnly = lower.includes('family')
      const weekMatch = /\b(this\s*week|last\s*week|week)\b/.test(lower)
      const daysMatch = lower.match(/(\d+)\s*days?/)
      const useDays = lower.includes('day') || weekMatch
      const days = useDays ? (Number(daysMatch?.[1]) || (weekMatch ? 7 : 7)) : 0
      const months = useDays ? 0 : Number(text.match(/\d+/)?.[0] ?? 1)

      const rows = useDays
        ? await getSummaryByDays(chatId, days, familyOnly)
        : await getMonthlySummary(chatId, months, familyOnly)

      const body = rows.length
        ? rows.map(r => `- ${r.category}: ${r.total}`).join('\n')
        : 'No data'
      const period = useDays ? `${days} days` : `${months} month${months !== 1 ? 's' : ''}`

      await bot.sendMessage(chatId, `
*Summary* (${period})${name ? ` — ${name}` : ''}

${body}

Here\'s your map. Use it well.
`.trim(), { parse_mode: 'Markdown' })
      return
    }

    if (/^(where\s*(did|do)\s*I\s*spend\s*most|top\s*categor(y|ies)|spent\s*most|biggest\s*categor(y|ies))$/i.test(text.trim())) {
      const top = await getTopCategory(chatId)
      if (top) {
        await bot.sendMessage(chatId, `*Top category*${name ? ` — ${name}` : ''}\n\nYou spent the most on *${top.category}*: ${top.total} berries total.\n\nThat\'s your leak—navigate accordingly.`, { parse_mode: 'Markdown' })
      } else {
        await bot.sendMessage(chatId, `No expenses logged yet${name ? `, ${name}` : ''}. Start logging and I\'ll tell you where the berries go.`)
      }
      return
    }

    if (/^(biggest\s*expense|largest\s*expense|single\s*biggest)$/i.test(text.trim())) {
      const row = await getBiggestExpense(chatId)
      if (row) {
        await bot.sendMessage(chatId, `*Biggest single expense*${name ? ` — ${name}` : ''}\n\n${row.amount} berries — *${row.category}*${row.reason ? ` (${row.reason})` : ''}\nDate: ${row.date}\n\nThat one hurt the wallet.`, { parse_mode: 'Markdown' })
      } else {
        await bot.sendMessage(chatId, `No expenses logged yet${name ? `, ${name}` : ''}. I\'ll remember when you do.`)
      }
      return
    }

    if (lower === 'download' || lower === 'export' || lower === 'csv') {
      const rows = await getAllTransactions(chatId)
      const escape = (v: string | number | null) => {
        if (v == null) return ''
        const s = String(v)
        if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
        return s
      }
      const header = 'id,type,amount,category,reason,is_family,date,created_at,payment_mode'
      const lines = rows.map(r => [r.id, r.type, r.amount, r.category, r.reason ?? '', r.is_family, r.date, r.created_at, r.payment_mode ?? 'UPI'].map(escape).join(','))
      const csv = [header, ...lines].join('\n')
      const filename = `expenses-${new Date().toISOString().slice(0, 10)}.csv`
      await bot.sendDocument(chatId, csv, filename)
      await bot.sendMessage(chatId, `There you go${n}—your ledger, all charted. Don\'t lose it.`)
      return
    }

    const parsed = parseInput(text)

    await db.prepare(`
      INSERT INTO transactions
      (user_id, type, amount, category, reason, is_family, date, payment_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      chatId,
      parsed.type,
      parsed.amount,
      parsed.category,
      parsed.reason ?? null,
      parsed.isFamily ? 1 : 0,
      parsed.date,
      parsed.paymentMode
    )

    await bot.sendMessage(chatId, `
*Logged*${name ? ` — ${name}` : ''}

Amount: ${parsed.amount} berries
Category: ${parsed.category}
Reason: ${parsed.reason ?? 'N/A'}
Type: ${parsed.type}
Family: ${parsed.isFamily ? 'Yes' : 'No'}
Date: ${parsed.date}
Payment: ${parsed.paymentMode}

Noted. I\'m watching the wallet.
`.trim(), { parse_mode: 'Markdown' })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('No amount found')) {
      await bot.sendMessage(chatId, `Hmm? If it\'s about berries, I\'m listening${name ? `, ${name}` : ''}. If not… make it about money.`)
    } else {
      await bot.sendMessage(chatId, `Something went wrong.\n\n${message}`)
    }
  }
}

;(async () => {
  for await (const msg of bot.poll()) {
    const chatId = String(msg.chat.id)
    const text = msg.text?.trim()
    const first_name = msg.from?.first_name
    if (text) await handleMessage(chatId, text, first_name)
  }
})()
