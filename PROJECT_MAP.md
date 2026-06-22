# PROJECT_MAP — Advanced Sales Dashboard

Last updated: 2026-06-17

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, TypeScript, Vite, Tailwind, Recharts |
| Backend | FastAPI (`backend/main.py`), PostgreSQL |
| Deploy | Render (API + static UI), custom domain `https://as-saas.com/` |

## Entry points

| File | Role |
|------|------|
| `index.html` / Vite | Frontend bootstrap |
| `AS.tsx` | App shell, routing, dashboard KPIs, module navigation |
| `Login.tsx` | Auth UI, unofficial-domain guard |
| `backend/main.py` | FastAPI app, CORS, router registration |
| `backendApi.ts` | `apiUrl()` and fetch helpers |

## Feature modules (frontend)

| Module | File(s) | Notes |
|--------|---------|-------|
| CRM | `CRM.tsx`, `CRMProfileView.tsx`, `accountProfileData.ts` | Pipeline, accounts, contacts |
| Requests | `RequestsManager.tsx` | List, wizard, **Request Details** overlay |
| Contracts | `Contracts.tsx`, `*ContractModal.tsx` | MICE / group contracts |
| Reports | `Reports.tsx` | Operational & financial reports |
| Settings | `Settings.tsx` | Properties, users, taxonomy |
| Dashboard hub | `dashboardHub/*` | Sidebar hub tabs (some Coming Soon) |

## Shared / core layer (frontend)

| File | Purpose |
|------|---------|
| `beoShared.ts` | BEO/financials, agenda helpers, `normalizeRequestTypeKey` |
| `requestTypeUtils.ts` | Request type buckets for dashboard/reports |
| `requestDetailLayout.ts` | **Request Details** section rules (event agenda visibility) |
| `propertyTaxonomy.ts` | Segments, account types per property |
| `propertyMealsPackages.ts` | Event packages, agenda timing slots |
| `formConfigurations.ts` | Form validation rules |
| `currency.ts` | Currency formatting |

## Request Details — Event agenda

- Rendered inside `RequestsManager.tsx` → `renderRequestDetailView`.
- Event agenda block applies to `event` and `event_rooms` (`includesEventAgendaSection` in `requestDetailLayout.ts`).
- **Single render site** enforced by `scripts/verify-request-detail-agenda-source.mjs` (regression guard for duplicate agenda bug fixed 2026-06-17).

## Backend routers (`backend/routers/`)

| Router | Domain |
|--------|--------|
| `auth.py` | Login, session cookies, bcrypt passwords |
| `reqs.py` | Booking requests CRUD |
| `accounts.py` | CRM accounts |
| `crm_state.py` | Pipeline state |
| `users.py`, `rooms.py`, `financials.py`, … | Settings & reference data |

Supporting: `backend/cors_middleware.py`, `backend/utils.py`, `backend/dependencies.py`.

## Tests

| Command | Scope |
|---------|--------|
| `npm run test:frontend` | Vitest — `requestDetailLayout.test.ts` |
| `npm run test:request-detail-layout` | Static check — one agenda render in `RequestsManager.tsx` |
| `npm run test:backend` | pytest — `backend/tests/test_api_full.py` |
| `npm test` | All of the above |

## Dev commands

```bash
npm run dev           # Frontend :5173
npm run dev:api:win   # Backend :8000
npm run build         # Production bundle
```

## Backlog / shortcomings

- `beoShared.normalizeRequestTypeKey` and `requestTypeUtils.normalizeRequestTypeKey` are similar but not identical; consolidate when touching request-type logic.
- Frontend test coverage is minimal (layout unit test + source guard only); broader UI tests live under `testsprite_tests/` (external).
