export type TransactionType = 'income' | 'expense'

export interface ParsedInput {
  type: TransactionType
  amount: number
  category: string
  reason?: string
  date: string
  isFamily: boolean
}
