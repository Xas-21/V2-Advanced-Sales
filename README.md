# Advanced Sales & Tour Management System (V2.0)

## System Overview
This is a comprehensive Single Page Application (SPA) built with **React** and **Tailwind CSS**, designed for managing hotel sales, events, catering, and customer relationships (CRM). It features a dynamic theming system, complex data visualization, and interactive management tools for the hospitality industry.

### Tech Stack
- **Framework:** React 18
- **Styling:** Tailwind CSS (Custom themes: Luxury, Light, Desert)
- **Icons:** Lucide React
- **Charts:** Recharts
- **Build Tool:** Vite
- **Language:** TypeScript

---

## 📂 Project Structure

### Core Files
- **`AS.tsx` (AdvancedSalesDashboard):** The main application entry point and container. It handles:
  - Global State (User authentication, Theme, Current View).
  - Main Navigation (Sidebar & Header).
  - Dashboard Analytics (KPI Cards, Charts).
  - Sub-views rendering (Calendar, Events, To-Do).
- **`CRM.tsx`:** Complete Customer Relationship Management module.
- **`RequestsManager.tsx`:** Complex wizard for handling booking requests (Accommodation, Events, Series).
- **`Contracts.tsx`:** Contract generation and management system.
- **`Reports.tsx`:** Custom report builder and analytics export.
- **`Settings.tsx`:** System configuration (Properties, Users, Taxes, Targets).
- **`Login.tsx`:** Authentication interface with demo access.

---

## 🧩 Modules & Components

### 1. Dashboard (`AS.tsx`)
- **Purpose:** Central command center displaying real-time KPIs and performance metrics.
- **Components:**
  - `KPICard`: Primary metrics (Revenue, Requests).
  - `MiniStatCard`: Secondary pipeline stats (ACT, DEF, TENT).
  - `MainChart`: Toggleable visualization (Revenue vs. Requests vs. Status).

### 2. CRM (`CRM.tsx`)
- **Purpose:** Managing client relationships, sales pipeline, and activities.
- **Views:**
  - **Pipeline:** Kanban-style board for dragging leads through stages (New -> Won).
  - **List:** Tabular view of all leads with filtering.
  - **Profile:** Detailed client view with contacts, activity timeline, and performance stats.
- **Key Features:**
  - Contact Management (Add/Edit/Delete contacts).
  - Sales Call logging.
  - Activity Timeline tracking.

### 3. Requests Center (`RequestsManager.tsx`)
- **Purpose:** Central processing for all incoming business requests.
- **Workflow:**
  - **Step 1: Client Info:** Select/Create Account.
  - **Step 2: Request Details:** Dates, PAX, Room Types.
  - **Step 3: Event Config:** Venues, F&B, AV requirements.
  - **Step 4: Financials:** Rates, Payments, Terms.

### 4. Events & Catering (`AS.tsx` -> `EventsView`)
- **Purpose:** Operational view for event execution.
- **Sub-views:**
  - **Pipeline:** Kanban board for event execution stages.
  - **Availability:** Venue calendar check.
  - **BEO:** Banquet Event Order management.

### 5. Contracts (`Contracts.tsx`)
- **Purpose:** Generating legal documents for bookings.
- **Features:**
  - Template Library (Yearly, Group, MICE).
  - Step-by-step generic wizard.
  - Contract History & Status tracking.

### 6. Settings (`Settings.tsx`)
- **Purpose:** Admin-level configuration.
- **Tabs:**
  - **Profile:** User settings & password.
  - **Properties:** Manage hotel properties & inventory.
  - **Venues:** Configure event spaces.
  - **Financials:** Sales targets & budgets.
  - **Users:** Role-based access control.

---

## 🔄 System Workflows

### Navigation
Navigation is controlled by the `currentView` state in `AS.tsx`. The Sidebar updates this state, which conditionally renders the main content area.
**Note:** Clicking sidebar items (e.g., "Sales Calls Management") clears pending actions (`pendingCrmAction`) to ensure a fresh view load.

### New Event / Action Flow
The "Create New Event" modal in `AS.tsx` acts as a global action dispatcher:
1. User selects "Sales Calls".
2. `pendingCrmAction` is set to `'add_call'`.
3. View switches to `'crm'`.
4. `CRM` component mounts and detects `initialAction='add_call'`, automatically opening the "Add Call" modal.

### Theming System
Themes are defined in `AS.tsx` constants. Each theme object (`luxury`, `light`, `desert`) contains:
- `colors`: Palette for UI elements (primary, bg, card, border).
- `name`: Display name.
The active theme is passed down via props to all child components.

---

## 💾 Data Structures (Types)

### Lead / Opportunity
```typescript
{
  id: string;
  company: string;
  contact: string;
  value: number;
  stage: 'new' | 'qualified' | 'proposal' | 'negotiation' | 'won';
  probability: number;
  tags: string[];
}
```

### Request
```typescript
{
  id: string;
  type: 'Accommodation' | 'Event' | 'Series';
  client: string;
  dates: { start: string; end: string };
  status: 'Draft' | 'Pending' | 'Approved';
  value: number;
}
```

---

## 🚀 Setup & Development

1. **Install Dependencies:** `npm install`
2. **Run Development Server:** `npm run dev`
3. **Build for Production:** `npm run build`

### Notes for Developers
- **API:** FastAPI backend lives in `backend/` (JSON files under `backend/data/`). From `backend/`, run `uvicorn main:app --reload --host 127.0.0.1 --port 8000`. The Vite dev server proxies `/api` to that port.
- **Production API URL:** Set `VITE_API_BASE_URL` to your deployed API origin (no trailing slash). See `.env.example`.
- **Line Charts:** Uses `recharts`. Ensure parent containers have defined dimensions.
- **Icons:** Uses `lucide-react`.

## Deploy on Render

1. Push this repository to GitHub (e.g. [V2-Advanced-Sales](https://github.com/Xas-21/V2-Advanced-Sales)).
2. In the Render dashboard, **New → Blueprint** and connect the repo; `render.yaml` defines:
   - **advanced-sales-api** — Python web service (`backend/`, `uvicorn main:app`).
   - **advanced-sales-ui** — static site (`npm run build`, publish `dist/`).
3. After the API is live, open the static site service → **Environment** → add `VITE_API_BASE_URL` = your API URL (e.g. `https://advanced-sales-api.onrender.com`), then **Manual Deploy → Clear build cache & deploy** so the bundle picks up the variable.
4. CORS on the API is already permissive (`allow_origins=["*"]`) for development; tighten for production if needed.

**Note:** Render’s free tier uses an **ephemeral filesystem**; `backend/data/*.json` resets when the service restarts unless you add a persistent disk or external database.

