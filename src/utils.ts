export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12
}

export function parseDateFromText(text: string): string | null {
  const lower = text.toLowerCase()
  const year = new Date().getFullYear()

  // "3rd feb" or "3 feb" or "on 3rd feb"
  const dayMonth = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/)
  if (dayMonth) {
    const day = parseInt(dayMonth[1], 10)
    const monthStr = dayMonth[2].slice(0, 3)
    const month = MONTH_MAP[monthStr] ?? MONTH_MAP[monthStr + 'ruary'] ?? MONTH_MAP[monthStr + 'uary']
    if (month && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day)
      if (d.getDate() === day) return d.toISOString().slice(0, 10)
    }
  }

  // "feb 3" or "february 3rd"
  const monthDay = lower.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/)
  if (monthDay) {
    const monthStr = monthDay[1].slice(0, 3)
    const month = MONTH_MAP[monthStr] ?? MONTH_MAP[monthStr + 'ruary'] ?? MONTH_MAP[monthStr + 'uary']
    const day = parseInt(monthDay[2], 10)
    if (month && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day)
      if (d.getDate() === day) return d.toISOString().slice(0, 10)
    }
  }

  return null
}
