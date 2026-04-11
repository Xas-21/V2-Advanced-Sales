from fastapi import APIRouter, Request
from typing import Optional
from utils import REQUESTS_FILE, read_json_file, write_json_file
import uuid

router = APIRouter(prefix="/api", tags=["Requests"])

@router.get("/requests")
def list_requests(propertyId: Optional[str] = None):
    data = read_json_file(REQUESTS_FILE)
    if propertyId:
        return [item for item in data if item.get("propertyId") == propertyId]
    return data

@router.post("/requests")
def create_request(data: dict):
    requests_data = read_json_file(REQUESTS_FILE)
    if "id" not in data or not data["id"]:
        data["id"] = "R" + str(uuid.uuid4()).replace("-", "")[:8]
    idx = next((i for i, d in enumerate(requests_data) if str(d.get("id")) == str(data.get("id"))), -1)
    if idx >= 0:
        requests_data[idx] = {**requests_data[idx], **data}
    else:
        requests_data.append(data)
    write_json_file(REQUESTS_FILE, requests_data)
    return data

@router.delete("/requests/{req_id}")
def remove_request(req_id: str):
    requests_data = read_json_file(REQUESTS_FILE)
    write_json_file(REQUESTS_FILE, [d for d in requests_data if str(d.get("id")) != str(req_id)])
    return {"message": "Deleted successfully"}
