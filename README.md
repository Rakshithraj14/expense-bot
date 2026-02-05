# Telegram Expense Bot

Track income and expenses via Telegram. Log transactions with natural language, view balance, and get monthly summaries.

## File Structure

```
expense-bot/
├── src/
│   ├── index.ts     # Bot entry, message handling
│   ├── parser.ts    # Parse amount, category, date
│   ├── db.ts        # SQLite setup
│   ├── queries.ts   # Balance, summary queries
│   ├── telegram.ts  # Telegram API
│   ├── types.ts
│   └── utils.ts
├── .github/workflows/
│   └── docker-publish.yml
├── Dockerfile
├── package.json
├── .dockerignore
└── .gitignore
```
