from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from typing import Optional
from utils import delete_request_row, list_collection_rows, list_requests_rows, upsert_request_row

router = APIRouter(prefix="/api", tags=["Requests"])

@router.get("/requests")
def list_requests(propertyId: Optional[str] = None):
    return list_requests_rows(propertyId)

@router.post("/requests")
def create_request(data: dict):
    return upsert_request_row(data)

@router.delete("/requests/{req_id}")
def remove_request(req_id: str):
    delete_request_row(req_id)
    return {"message": "Deleted successfully"}


def _property_name_for_request(req: dict) -> str:
    pid = str(req.get("propertyId") or "").strip()
    if not pid:
        return ""
    props = list_collection_rows("properties", pid)
    if props:
        return str(props[0].get("name") or "").strip()
    return ""


def _find_request_by_feedback_token(token: str) -> dict | None:
    t = str(token or "").strip()
    if not t:
        return None
    all_requests = list_requests_rows(None)
    for req in all_requests:
        if not isinstance(req, dict):
            continue
        fb = req.get("feedback") or {}
        if not isinstance(fb, dict):
            continue
        if str(fb.get("publicToken") or "").strip() == t:
            return req
    return None


@router.get("/requests/feedback/{token}")
def get_public_feedback_form(token: str):
    req = _find_request_by_feedback_token(token)
    if not req:
        raise HTTPException(status_code=404, detail="Feedback link not found.")
    fb = req.get("feedback") or {}
    if not isinstance(fb, dict):
        fb = {}
    return {
        "requestId": str(req.get("id") or ""),
        "requestType": str(req.get("requestType") or ""),
        "propertyName": _property_name_for_request(req),
        "feedback": {
            "answers": fb.get("answers") if isinstance(fb.get("answers"), dict) else {},
            "submittedAt": fb.get("submittedAt"),
            "updatedAt": fb.get("updatedAt"),
        },
    }


@router.post("/requests/feedback/{token}/submit")
def submit_public_feedback(token: str, data: dict):
    req = _find_request_by_feedback_token(token)
    if not req:
        raise HTTPException(status_code=404, detail="Feedback link not found.")
    answers = data.get("answers") if isinstance(data, dict) else None
    if not isinstance(answers, dict):
        raise HTTPException(status_code=400, detail="Invalid feedback payload.")

    now = datetime.now(timezone.utc).isoformat()
    prev_feedback = req.get("feedback") if isinstance(req.get("feedback"), dict) else {}
    req["feedback"] = {
        **prev_feedback,
        "publicToken": str(prev_feedback.get("publicToken") or token).strip(),
        "answers": answers,
        "submittedAt": now,
        "updatedAt": now,
        "source": "client",
    }
    upsert_request_row(req)
    return {"ok": True, "submittedAt": now}
