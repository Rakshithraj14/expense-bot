const BASE = 'https://api.telegram.org'

export function createBot(token: string) {
  const api = (method: string, body: Record<string, unknown> = {}) =>
    fetch(`${BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json() as Promise<{ ok: boolean; result?: unknown }>)

  return {
    sendMessage(chatId: string, text: string, options?: { parse_mode?: string }) {
      return api('sendMessage', { chat_id: chatId, text, ...options })
    },

    sendDocument(chatId: string, content: string, filename: string) {
      const form = new FormData()
      form.append('chat_id', chatId)
      form.append('document', new Blob([content], { type: 'text/csv' }), filename)
      return fetch(`${BASE}/bot${token}/sendDocument`, {
        method: 'POST',
        body: form,
      }).then((r) => r.json() as Promise<{ ok: boolean }>)
    },

    async *poll() {
      let offset = 0
      const seen = new Set<string>()
      while (true) {
        const res = await api('getUpdates', {
          offset: offset || undefined,
          timeout: 30,
        })
        const result = res.result as Array<{
          update_id: number
          message?: {
            message_id: number
            chat: { id: number }
            text?: string
            from?: { first_name?: string }
          }
        }> | undefined
        if (Array.isArray(result)) {
          for (const u of result) {
            offset = Math.max(offset, u.update_id + 1)
            if (!u.message?.text) continue
            const key = `${u.message.chat.id}:${u.message.message_id}`
            if (seen.has(key)) continue
            seen.add(key)
            yield u.message
          }
        }
      }
    },
  }
}
