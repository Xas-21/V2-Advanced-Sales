import sys
import os
print("VisaTour Backend: LOADING MAIN APP...")
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Ensure the backend directory is in the path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BASE_DIR)
load_dotenv(os.path.join(BASE_DIR, ".env"))

from routers import auth, users, properties, rooms, venues, taxes, financials, reqs, crm_state, contact, accounts
from utils import close_database, init_database, storage_mode

app = FastAPI(title="VisaTour ERP Backend", version="1.0.0", redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


@app.on_event("startup")
def on_startup():
    if storage_mode() == "postgres":
        init_database()


@app.on_event("shutdown")
def on_shutdown():
    close_database()

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "storage": storage_mode(),
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
