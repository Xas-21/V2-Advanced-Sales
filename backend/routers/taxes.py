from fastapi import APIRouter
from typing import Optional
from utils import (
    delete_collection_row,
    delete_property_collection_row,
    list_collection_rows,
    upsert_collection_row,
)
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


def _tax_key(item: dict) -> str:
    raw_id = str(item.get("id") or "").strip().lower()
    if raw_id in {"vat", "muni", "service"}:
        return raw_id
    label = str(item.get("label") or "").strip().lower()
    if "vat" in label or "value added" in label:
        return "vat"
    if "municip" in label:
        return "muni"
    if "service" in label:
        return "service"
    return raw_id


def _ensure_property_taxes(all_taxes: list, property_id: str):
    """Ensure each property always has VAT, Municipality, and Service tax rows."""
    prop_taxes = [item for item in all_taxes if str(item.get("propertyId")) == str(property_id)]
    by_id: dict[str, dict] = {}
    for item in prop_taxes:
        if not isinstance(item, dict):
            continue
        key = _tax_key(item)
        if key and key not in by_id:
            by_id[key] = item
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
                "id": tax_id,
                "propertyId": property_id,
            }
            if merged != existing:
                changed = True
            ensured.append(merged)
        else:
            changed = True
            ensured.append({**default_tax, "propertyId": property_id})

    if changed:
        for row in ensured:
            upsert_collection_row("taxes", row, prefix="T", row_id_with_property=True)

    return ensured


@router.get("")
def get_taxes(propertyId: Optional[str] = None):
    data = list_collection_rows("taxes", propertyId)
    if propertyId:
        return _ensure_property_taxes(data, propertyId)
    return data

@router.post("")
def save_tax(data: dict):
    item = {**(data if isinstance(data, dict) else {})}
    property_id = str(item.get("propertyId", "")).strip()
    if not property_id:
        return {"message": "propertyId required"}
    item["propertyId"] = property_id
    canonical = _tax_key(item)
    if canonical in {"vat", "muni", "service"}:
        item["id"] = canonical
    if "id" not in item:
        item["id"] = "T" + str(uuid.uuid4())[:6]
    return upsert_collection_row("taxes", item, prefix="T", row_id_with_property=True)

@router.delete("/{id}")
def delete_tax(id: str, propertyId: Optional[str] = None):
    if propertyId:
        delete_property_collection_row("taxes", id, propertyId)
    else:
        delete_collection_row("taxes", id)
    return {"message": "Deleted successfully"}
