import { ParsedInput, TransactionType } from './types'
import { todayISO, parseDateFromText } from './utils'

const FAMILY_KEYWORDS = [
  'family', 'father', 'mother', 'dad', 'mom', 'grandfather', 'grandmother'
]

const INCOME_KEYWORDS = ['salary', 'refund', 'freelance', 'income']
const RECEIVE_VERBS = ['received', 'got', 'credited', 'gave']
const EXPENSE_VERBS = ['spent', 'paid', 'bought', 'purchase']

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  groceries: ['groceries', 'vegetables', 'ration', 'milk', 'bread', 'eggs', 'dairy', 'provisions'],
  bills: ['electricity', 'water', 'internet', 'rent', 'bill'],
  medical: ['doctor', 'hospital', 'medicine', 'medical'],
  travel: ['uber', 'ola', 'bus', 'train', 'flight'],
  food: ['food', 'lunch', 'dinner', 'zomato', 'swiggy'],
  shopping: ['amazon', 'flipkart', 'shopping']
}

export function parseInput(text: string): ParsedInput {
  const lower = text.toLowerCase()

  const amountMatch = lower.match(/\b\d+\b/)
  if (!amountMatch) {
    throw new Error('No amount found. Try: "500 groceries"')
  }

  const amount = Number(amountMatch[0])

  const hasIncomeSignal =
    INCOME_KEYWORDS.some(k => lower.includes(k)) ||
    RECEIVE_VERBS.some(v => lower.includes(v))

  const hasExpenseSignal =
    EXPENSE_VERBS.some(v => lower.includes(v))

  const type: TransactionType =
    hasIncomeSignal && !hasExpenseSignal ? 'income' : 'expense'

  let category = 'general'

  if (type === 'income') {
    category =
      INCOME_KEYWORDS.find(k => lower.includes(k)) ?? 'income'
  } else {
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some(k => lower.includes(k))) {
        category = cat
        break
      }
    }
  }

  const FAMILY_CATEGORIES = ['groceries', 'bills', 'medical', 'shopping']
  const isFamily =
    FAMILY_KEYWORDS.some(k => lower.includes(k)) || FAMILY_CATEGORIES.includes(category)

  const reason = text.replace(amountMatch[0], '').trim()
  const date = parseDateFromText(text) ?? todayISO()

  return {
    type,
    amount,
    category,
    reason: reason || undefined,
    date,
    isFamily
  }
}
