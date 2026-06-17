# Advanced Sales Dashboard — Agent Guide

## Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Recharts, Lucide icons
- **Backend:** Python FastAPI (`backend/`), PostgreSQL, pytest (`backend/tests/`)

## Layout

- `AS.tsx` — main dashboard shell, routing, KPIs
- `CRM.tsx` — CRM pipeline, accounts, activities
- `RequestsManager.tsx` — booking request wizard
- `Contracts.tsx`, `Reports.tsx`, `Settings.tsx` — feature modules
- `backend/main.py` — FastAPI entry; routers in `backend/routers/`
- `backend/utils.py` — shared backend helpers

## Dev commands

```bash
npm run dev              # Vite frontend (port 5173)
npm run dev:api:win      # FastAPI backend (port 8000)
npm run test:backend     # pytest
npm run build            # production build
```

## Conventions

- Prefer minimal, focused diffs; match existing naming and patterns
- Do not commit secrets (`.env`, API keys)
- Frontend uses Tailwind; themes: Luxury, Light, Desert

## Password migration (run when deploying to a fresh Neon DB)

After deploying new auth code (which expects bcrypt hashes), run against your Neon DB:

```bash
cd backend
python scripts/migrate_db_passwords.py
```

This hashes all plaintext user passwords in the `app_collection_rows` table. Users can also auto-upgrade on first successful login if any password is still plaintext.
