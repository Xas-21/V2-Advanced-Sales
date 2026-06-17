import sys
import os
print("VisaTour Backend: LOADING MAIN APP...")
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Ensure the backend directory is in the path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BASE_DIR)
load_dotenv(os.path.join(BASE_DIR, ".env"), override=True)

from routers import auth, users, properties, rooms, venues, taxes, financials, reqs, crm_state, contact, accounts, tasks, uploads, contracts, cxl_reasons, promotions
from utils import close_database, get_database_url, init_database, storage_mode, check_database_health


def _database_host() -> str | None:
    url = get_database_url()
    if not url or "@" not in url:
        return None
    return url.split("@", 1)[1].split("/", 1)[0]


def _cors_settings() -> tuple[list[str], str | None]:
    """Explicit origins from env plus optional regex (Render subdomains)."""
    raw = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    origins = [o.strip() for o in raw.split(",") if o.strip() and "*" not in o.strip()]
    regex = os.getenv(
        "CORS_ORIGIN_REGEX",
        r"https://([a-z0-9-]+\.)*onrender\.com",
    ).strip() or None
    return origins, regex


app = FastAPI(title="VisaTour ERP Backend", version="2.0.0", redirect_slashes=False)

_cors_origins, _cors_regex = _cors_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(properties.router)
app.include_router(rooms.router)
app.include_router(venues.router)
app.include_router(taxes.router)
app.include_router(financials.router)
app.include_router(reqs.router)
app.include_router(crm_state.router)
app.include_router(contact.router)
app.include_router(accounts.router)
app.include_router(tasks.router)
app.include_router(uploads.router)
app.include_router(contracts.router)
app.include_router(cxl_reasons.router)
app.include_router(promotions.router)


@app.on_event("startup")
def on_startup():
    if storage_mode() == "postgres":
        init_database()


@app.on_event("shutdown")
def on_shutdown():
    close_database()

@app.get("/api/health")
def health():
    db_ok = check_database_health() if storage_mode() == "postgres" else None
    return {
        "status": "ok" if db_ok is not False else "degraded",
        "storage": storage_mode(),
        "database_host": _database_host(),
        "database_connected": db_ok,
        "routers": ["reqs", "auth", "others"],
    }

@app.get("/")
def read_root():
    return {"message": "Welcome to the VisaTour Backend API"}

if __name__ == "__main__":
    import uvicorn
    # Need to use the string reference to handle reloads correctly
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
