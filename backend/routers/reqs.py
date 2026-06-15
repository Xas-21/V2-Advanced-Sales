from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from typing import Optional
from utils import (
    PROPERTIES_FILE,
    RequestIdCollisionError,
    delete_request_row,
    list_requests_rows,
    read_json_file,
    upsert_request_row,
)

router = APIRouter(prefix="/api", tags=["Requests"])

@router.get("/requests")
def list_requests(propertyId: Optional[str] = None):
    return list_requests_rows(propertyId)

@router.post("/requests")
def create_request(data: dict):
    try:
        return upsert_request_row(data)
    except RequestIdCollisionError as exc:
        existing = exc.existing or {}
        existing_name = str(existing.get("requestName") or existing.get("confirmationNo") or "").strip()
        detail = (
            f"Request id {exc.req_id} already exists"
            + (f" ({existing_name})" if existing_name else "")
            + ". Save again to get a new id, or load the existing request to update it."
        )
        raise HTTPException(status_code=409, detail=detail) from exc

@router.delete("/requests/{req_id}")
def remove_request(req_id: str):
    delete_request_row(req_id)
    return {"message": "Deleted successfully"}


def _property_for_request(req: dict) -> dict:
    pid = str(req.get("propertyId") or "").strip()
    if not pid:
        return {}
    rows = read_json_file(PROPERTIES_FILE, default=[])
    for row in rows if isinstance(rows, list) else []:
        if isinstance(row, dict) and str(row.get("id") or "").strip() == pid:
            return row
    return {}


def _property_name_for_request(req: dict) -> str:
    p = _property_for_request(req)
    name = str(p.get("name") or "").strip()
    if name:
        return name
    return str(req.get("propertyName") or req.get("property") or "").strip()


def _property_logo_for_request(req: dict) -> str:
    p = _property_for_request(req)
    logo = str(p.get("logoUrl") or "").strip()
    if logo:
        return logo
    return str(req.get("propertyLogoUrl") or "").strip()


def _request_dates_for_feedback(req: dict) -> str:
    start = str(req.get("checkIn") or req.get("eventStart") or req.get("requestDate") or "").strip()[:10]
    end = str(req.get("checkOut") or req.get("eventEnd") or "").strip()[:10]
    if start and end and start != end:
        return f"{start} to {end}"
    if start:
        return start
    if end:
        return end
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
        "propertyLogoUrl": _property_logo_for_request(req),
        "propertyFeedbackTemplates": (_property_for_request(req).get("feedbackTemplates") or {}),
        "requestName": str(req.get("requestName") or "").strip(),
        "accountName": str(req.get("accountName") or req.get("account") or "").strip(),
        "dates": _request_dates_for_feedback(req),
        "confirmationNo": str(req.get("confirmationNo") or "").strip(),
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
