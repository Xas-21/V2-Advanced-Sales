from fastapi import APIRouter
from typing import Optional
from utils import ROOM_TYPES_FILE, read_json_file, write_json_file
import uuid

router = APIRouter(prefix="/api/rooms")

@router.get("")
def get_rooms(propertyId: Optional[str] = None):
    data = read_json_file(ROOM_TYPES_FILE)
    if propertyId:
        return [item for item in data if item.get("propertyId") == propertyId]
    return data

@router.post("")
def save_room(data: dict):
    rooms = read_json_file(ROOM_TYPES_FILE)
    if "id" not in data:
        data["id"] = "R" + str(uuid.uuid4())[:6]
    idx = next((i for i, d in enumerate(rooms) if str(d.get("id")) == str(data.get("id"))), -1)
    if idx >= 0:
        rooms[idx] = {**rooms[idx], **data}
    else:
        rooms.append(data)
    write_json_file(ROOM_TYPES_FILE, rooms)
    return data

@router.delete("/{id}")
def delete_room(id: str):
    rooms = read_json_file(ROOM_TYPES_FILE)
    write_json_file(ROOM_TYPES_FILE, [d for d in rooms if str(d.get("id")) != str(id)])
    return {"message": "Deleted successfully"}
