export type TransactionType = 'income' | 'expense'
export type PaymentMode = 'UPI' | 'CASH'

export interface ParsedInput {
  type: TransactionType
  amount: number
  category: string
  reason?: string
  date: string
  isFamily: boolean
  paymentMode: PaymentMode
}
