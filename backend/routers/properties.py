from fastapi import APIRouter
from utils import PROPERTIES_FILE, read_json_file, write_json_file

router = APIRouter(prefix="/api/properties")

@router.get("")
def get_properties():
    return read_json_file(PROPERTIES_FILE)

@router.post("")
def create_or_update_property(prop_data: dict):
    properties = read_json_file(PROPERTIES_FILE)
    
    existing_idx = next((i for i, p in enumerate(properties) if str(p.get("id")) == str(prop_data.get("id"))), -1)
    
    if existing_idx >= 0:
        properties[existing_idx] = {**properties[existing_idx], **prop_data}
    else:
        properties.append(prop_data)
        
    write_json_file(PROPERTIES_FILE, properties)
    return {"message": "Property saved successfully", "property": prop_data}

@router.delete("/{prop_id}")
def delete_property(prop_id: str):
    properties = read_json_file(PROPERTIES_FILE)
    properties = [p for p in properties if str(p.get("id")) != str(prop_id)]
    write_json_file(PROPERTIES_FILE, properties)
    return {"message": "Property deleted successfully"}
