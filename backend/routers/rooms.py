from fastapi import APIRouter
from typing import Optional
from utils import delete_collection_row, delete_property_collection_row, list_collection_rows, upsert_collection_row
import uuid

router = APIRouter(prefix="/api/rooms")

@router.get("")
def get_rooms(propertyId: Optional[str] = None):
    return list_collection_rows("room_types", propertyId)

@router.post("")
def save_room(data: dict):
    item = {**(data if isinstance(data, dict) else {})}
    if "id" not in item:
        item["id"] = "R" + str(uuid.uuid4())[:6]
    return upsert_collection_row("room_types", item, prefix="R", row_id_with_property=True)

@router.delete("/{id}")
def delete_room(id: str, propertyId: Optional[str] = None):
    if propertyId:
        delete_property_collection_row("room_types", id, propertyId)
    else:
        delete_collection_row("room_types", id)
    return {"message": "Deleted successfully"}
