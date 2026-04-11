import sys
import os
print("VisaTour Backend: LOADING MAIN APP...")
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure the backend directory is in the path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from routers import auth, users, properties, rooms, venues, taxes, financials, reqs, crm_state, contact

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

@app.get("/api/health")
def health():
    return {"status": "ok", "routers": ["reqs", "auth", "others"]}

@app.get("/")
def read_root():
    return {"message": "Welcome to the VisaTour Backend API"}

if __name__ == "__main__":
    import uvicorn
    # Need to use the string reference to handle reloads correctly
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
