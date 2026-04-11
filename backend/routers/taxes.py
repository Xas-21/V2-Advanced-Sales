from fastapi import APIRouter
from typing import Optional
from utils import TAXES_FILE, read_json_file, write_json_file
import uuid

router = APIRouter(prefix="/api/taxes")

DEFAULT_TAXES = [
    {
        "id": "vat",
        "label": "VAT (Value Added Tax)",
        "rate": 15,
        "scope": {
            "accommodation": True,
            "transport": True,
            "foodAndBeverage": True,
            "events": True,
        },
    },
    {
        "id": "muni",
        "label": "Municipality Fee",
        "rate": 10,
        "scope": {
            "accommodation": True,
            "transport": False,
            "foodAndBeverage": False,
            "events": True,
        },
    },
    {
        "id": "service",
        "label": "Service Fee",
        "rate": 12,
        "scope": {
            "accommodation": True,
            "transport": False,
            "foodAndBeverage": True,
            "events": False,
        },
    },
]


def _ensure_property_taxes(all_taxes: list, property_id: str):
    """Ensure each property always has VAT, Municipality, and Service tax rows."""
    prop_taxes = [item for item in all_taxes if str(item.get("propertyId")) == str(property_id)]
    by_id = {str(item.get("id")): item for item in prop_taxes}
    ensured = []
    changed = False

    for default_tax in DEFAULT_TAXES:
        tax_id = str(default_tax["id"])
        existing = by_id.get(tax_id)
        if existing:
            # Keep persisted values while backfilling missing shape fields safely.
            merged = {
                **default_tax,
                **existing,
                "scope": {**default_tax["scope"], **existing.get("scope", {})},
                "propertyId": property_id,
            }
            if merged != existing:
                changed = True
            ensured.append(merged)
        else:
            changed = True
            ensured.append({**default_tax, "propertyId": property_id})

    if changed:
        others = [item for item in all_taxes if str(item.get("propertyId")) != str(property_id)]
        write_json_file(TAXES_FILE, [*others, *ensured])

    return ensured


@router.get("")
def get_taxes(propertyId: Optional[str] = None):
    data = read_json_file(TAXES_FILE)
    if propertyId:
        return _ensure_property_taxes(data, propertyId)
    return data

@router.post("")
def save_tax(data: dict):
    taxes = read_json_file(TAXES_FILE)
    if "id" not in data:
        data["id"] = "T" + str(uuid.uuid4())[:6]
    idx = next((i for i, d in enumerate(taxes) if str(d.get("id")) == str(data.get("id"))), -1)
    if idx >= 0:
        taxes[idx] = {**taxes[idx], **data}
    else:
        taxes.append(data)
    write_json_file(TAXES_FILE, taxes)
    return data

@router.delete("/{id}")
def delete_tax(id: str):
    taxes = read_json_file(TAXES_FILE)
    write_json_file(TAXES_FILE, [d for d in taxes if str(d.get("id")) != str(id)])
    return {"message": "Deleted successfully"}
