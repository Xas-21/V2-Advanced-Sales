from fastapi import APIRouter
from typing import Optional
from utils import FINANCIALS_FILE, read_json_file, write_json_file

router = APIRouter(prefix="/api/financials")

@router.get("")
def get_financials(propertyId: Optional[str] = None):
    data = read_json_file(FINANCIALS_FILE)
    if propertyId:
        return [item for item in data if item.get("propertyId") == propertyId]
    return data

@router.post("")
def save_financial(data: dict):
    financials = read_json_file(FINANCIALS_FILE)
    prop_id = str(data.get("propertyId"))
    year = str(data.get("year"))
    item_id = data.get("id") or f"{prop_id}_{year}"
    data["id"] = item_id
    idx = next((i for i, d in enumerate(financials) if str(d.get("id")) == str(item_id) or (str(d.get("propertyId")) == prop_id and str(d.get("year")) == year)), -1)
    if idx >= 0:
        financials[idx] = {**financials[idx], **data}
    else:
        financials.append(data)
    write_json_file(FINANCIALS_FILE, financials)
    return data

@router.delete("/{id}")
def delete_financial(id: str):
    financials = read_json_file(FINANCIALS_FILE)
    write_json_file(FINANCIALS_FILE, [d for d in financials if str(d.get("id")) != str(id)])
    return {"message": "Deleted successfully"}
