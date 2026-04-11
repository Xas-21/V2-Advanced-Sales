from fastapi import APIRouter
from typing import Optional
from utils import VENUES_FILE, read_json_file, write_json_file
import uuid

router = APIRouter(prefix="/api/venues")

@router.get("")
def get_venues(propertyId: Optional[str] = None):
    data = read_json_file(VENUES_FILE)
    if propertyId:
        return [item for item in data if item.get("propertyId") == propertyId]
    return data

@router.post("")
def save_venue(data: dict):
    venues = read_json_file(VENUES_FILE)
    if "id" not in data:
        data["id"] = "V" + str(uuid.uuid4())[:6]
    idx = next((i for i, d in enumerate(venues) if str(d.get("id")) == str(data.get("id"))), -1)
    if idx >= 0:
        venues[idx] = {**venues[idx], **data}
    else:
        venues.append(data)
    write_json_file(VENUES_FILE, venues)
    return data

@router.delete("/{id}")
def delete_venue(id: str):
    venues = read_json_file(VENUES_FILE)
    write_json_file(VENUES_FILE, [d for d in venues if str(d.get("id")) != str(id)])
    return {"message": "Deleted successfully"}
