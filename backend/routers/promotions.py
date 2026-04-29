from fastapi import APIRouter
from typing import Optional

from utils import delete_promotion_row, list_promotions_rows, upsert_promotion_row

router = APIRouter(prefix="/api", tags=["Promotions"])


@router.get("/promotions")
def list_promotions(propertyId: Optional[str] = None):
    return list_promotions_rows(propertyId)


@router.post("/promotions")
def upsert_promotion(data: dict):
    return upsert_promotion_row(data)


@router.delete("/promotions/{promotion_id}")
def remove_promotion(promotion_id: str, propertyId: str):
    delete_promotion_row(promotion_id, propertyId)
    return {"message": "Deleted successfully"}
