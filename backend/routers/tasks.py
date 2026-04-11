from fastapi import APIRouter
from typing import Optional

from utils import (
    delete_collection_row,
    list_collection_rows,
    sync_collection_rows,
    upsert_collection_row,
)

router = APIRouter(prefix="/api", tags=["Tasks"])
_COLLECTION = "tasks"


@router.get("/tasks")
def list_tasks(propertyId: Optional[str] = None):
    return list_collection_rows(_COLLECTION, propertyId)


@router.post("/tasks")
def upsert_task(data: dict):
    return upsert_collection_row(_COLLECTION, data, prefix="T")


@router.put("/tasks/sync")
def sync_tasks(payload: dict):
    property_id = str(payload.get("propertyId", "")).strip()
    incoming = payload.get("tasks", [])
    allow_clear = bool(payload.get("allowClear", False))
    if not property_id:
        return {"message": "propertyId required", "saved": 0}
    return sync_collection_rows(_COLLECTION, property_id, incoming, allow_clear=allow_clear, prefix="T")


@router.delete("/tasks/{task_id}")
def delete_task(task_id: str):
    delete_collection_row(_COLLECTION, task_id)
    return {"message": "Deleted successfully"}
