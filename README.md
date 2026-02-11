# Telegram Expense Bot

Track income and expenses via Telegram. Nami-themed: log with natural language, view balance, summaries, compare months, top category, and more.

## Requirements

- **BOT_TOKEN** — Telegram bot token (required)
- **DATABASE_URL** — Optional. Postgres URI for Supabase; 

## Run

```bash
bun install
bun run dev
```

## File structure

```
tracker/
├── src/
│   ├── index.ts      # Bot entry, message handling
│   ├── parser.ts     # Parse amount, category, date
│   ├── db.ts         # SQLite / Postgres setup
│   ├── queries.ts    # Balance, summary, compare, etc.
│   ├── telegram.ts   # Telegram API
│   ├── types.ts
│   └── utils.ts
├── .github/workflows/
│   └── docker-publish.yml
├── Dockerfile
├── package.json
├── .dockerignore
└── .gitignore
```

## DB schema

**transactions**

| Column        | Type    | Description                    |
|---------------|---------|--------------------------------|
| id            | PK      | Auto-increment                 |
| user_id       | TEXT    | Telegram chat id               |
| type          | TEXT    | `income` \| `expense`          |
| amount        | INTEGER | > 0                            |
| category      | TEXT    | e.g. groceries, bills, food   |
| reason        | TEXT    | Optional note                  |
| is_family     | INT     | 0 or 1                         |
| date          | TEXT    | ISO date (YYYY-MM-DD)          |
| payment_mode  | TEXT    | `UPI` \| `CASH` (default UPI)  |
| created_at    | TEXT    | Timestamp                      |

Indexes: `(user_id, date)`, `(user_id, type)`.

**user_profiles**

| Column    | Type    | Description        |
|-----------|---------|--------------------|
| user_id   | PK TEXT | Telegram chat id   |
| user_name | TEXT    | Display name       |
| updated_at| TEXT/TIMESTAMPTZ | Last updated |
