from typing import Optional

from fastapi import APIRouter

from utils import CONTRACT_TEMPLATES_FILE, read_json_file, write_json_file

router = APIRouter(prefix="/api/contracts", tags=["Contracts"])


@router.get("/templates")
def list_contract_templates(propertyId: Optional[str] = None):
    templates = read_json_file(CONTRACT_TEMPLATES_FILE, default=[])
    if not isinstance(templates, list):
        templates = []
    if not propertyId:
        return templates
    pid = str(propertyId)
    return [
        t
        for t in templates
        if not t.get("propertyId") or str(t.get("propertyId")) == pid
    ]


@router.post("/templates")
def upsert_contract_template(data: dict):
    templates = read_json_file(CONTRACT_TEMPLATES_FILE, default=[])
    if not isinstance(templates, list):
        templates = []
    item = {**data}
    item_id = str(item.get("id") or "")
    if not item_id:
        return item
    replaced = False
    next_templates = []
    for t in templates:
        if str(t.get("id")) == item_id:
            next_templates.append(item)
            replaced = True
        else:
            next_templates.append(t)
    if not replaced:
        next_templates.insert(0, item)
    write_json_file(CONTRACT_TEMPLATES_FILE, next_templates)
    return item


@router.delete("/templates/{template_id}")
def delete_contract_template(template_id: str):
    templates = read_json_file(CONTRACT_TEMPLATES_FILE, default=[])
    if not isinstance(templates, list):
        templates = []
    next_templates = [t for t in templates if str(t.get("id")) != str(template_id)]
    write_json_file(CONTRACT_TEMPLATES_FILE, next_templates)
    return {"message": "Deleted successfully"}
