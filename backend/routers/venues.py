from fastapi import APIRouter
from typing import Optional
from utils import delete_collection_row, delete_property_collection_row, list_collection_rows, upsert_collection_row
import uuid

router = APIRouter(prefix="/api/venues")

@router.get("")
def get_venues(propertyId: Optional[str] = None):
    return list_collection_rows("venues", propertyId)

@router.post("")
def save_venue(data: dict):
    item = {**(data if isinstance(data, dict) else {})}
    if "id" not in item:
        item["id"] = "V" + str(uuid.uuid4())[:6]
    return upsert_collection_row("venues", item, prefix="V", row_id_with_property=True)

@router.delete("/{id}")
def delete_venue(id: str, propertyId: Optional[str] = None):
    if propertyId:
        delete_property_collection_row("venues", id, propertyId)
    else:
        delete_collection_row("venues", id)
    return {"message": "Deleted successfully"}
