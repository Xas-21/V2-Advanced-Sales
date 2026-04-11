from fastapi import APIRouter
from typing import Optional
from utils import delete_request_row, list_requests_rows, upsert_request_row

router = APIRouter(prefix="/api", tags=["Requests"])

@router.get("/requests")
def list_requests(propertyId: Optional[str] = None):
    return list_requests_rows(propertyId)

@router.post("/requests")
def create_request(data: dict):
    return upsert_request_row(data)

@router.delete("/requests/{req_id}")
def remove_request(req_id: str):
    delete_request_row(req_id)
    return {"message": "Deleted successfully"}
