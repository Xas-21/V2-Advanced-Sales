import json
import os
import base64
import urllib.parse
from typing import Any

import httpx


def _split_name(name: str) -> tuple[str, str]:
    parts = [p for p in str(name or "").strip().split() if p]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def _normalize_openai_contact(raw: dict[str, Any]) -> dict[str, Any]:
    first_name = str(raw.get("firstName") or "").strip()
    last_name = str(raw.get("lastName") or "").strip()
    full_name = str(raw.get("name") or "").strip()
    if (not first_name and not last_name) and full_name:
        first_name, last_name = _split_name(full_name)
    return {
        "firstName": first_name,
        "lastName": last_name,
        "position": str(raw.get("position") or "").strip(),
        "email": str(raw.get("email") or "").strip(),
        "phone": str(raw.get("phone") or "").strip(),
        "city": str(raw.get("city") or "").strip(),
        "country": str(raw.get("country") or "").strip(),
        "name": " ".join([first_name, last_name]).strip() or full_name,
    }


def _extract_text_from_responses_payload(payload: dict[str, Any]) -> str:
    direct = str(payload.get("output_text") or "").strip()
    if direct:
        return direct
    out = payload.get("output")
    if not isinstance(out, list):
        return ""
    chunks: list[str] = []
    for item in out:
        if not isinstance(item, dict):
            continue
        content = item.get("content")
        if not isinstance(content, list):
            continue
        for c in content:
            if not isinstance(c, dict):
                continue
            # Responses API may return different text fields depending on model/tooling.
            t = str(c.get("text") or c.get("output_text") or c.get("value") or "").strip()
            if t:
                chunks.append(t)
    return "\n".join(chunks).strip()


def _enrich_company_from_web(account: dict[str, Any]) -> str:
    name = str(account.get("name") or "").strip()
    city = str(account.get("city") or "").strip()
    country = str(account.get("country") or "").strip()
    if not name:
        return ""
    query = " ".join([name, city, country]).strip()
    if not query:
        return ""
    try:
        q = urllib.parse.quote_plus(query)
        url = f"https://api.duckduckgo.com/?q={q}&format=json&no_html=1&skip_disambig=1"
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(url)
        if resp.status_code >= 300:
            return ""
        data = resp.json()
        abstract = str(data.get("AbstractText") or "").strip()
        heading = str(data.get("Heading") or "").strip()
        related = data.get("RelatedTopics")
        related_line = ""
        if isinstance(related, list) and related:
            first = related[0]
            if isinstance(first, dict):
                related_line = str(first.get("Text") or "").strip()
        snippets = [x for x in [heading, abstract, related_line] if x]
        if not snippets:
            return ""
        # Keep notes concise and useful for CRM users.
        compact = " | ".join(snippets[:2])[:380]
        return f"Auto-enriched (web): {compact}"
    except Exception:
        return ""


def _extract_with_openai(content: bytes, file_name: str) -> dict[str, Any]:
    api_key = str(os.getenv("OPENAI_API_KEY", "")).strip()
    if not api_key:
        return {
            "ok": False,
            "error": "OPENAI_API_KEY is missing on backend server. Please set it in backend/.env and restart backend.",
            "rawText": "",
            "account": {},
            "contacts": [],
            "confidence": 0,
            "unmapped": [],
            "fileName": file_name,
        }
    mime = "image/png"
    low = str(file_name or "").lower()
    if low.endswith(".jpg") or low.endswith(".jpeg"):
        mime = "image/jpeg"
    elif low.endswith(".webp"):
        mime = "image/webp"
    elif low.endswith(".gif"):
        mime = "image/gif"
    b64 = base64.b64encode(content).decode("ascii")
    img_data_url = f"data:{mime};base64,{b64}"
    prompt = (
        "You are an OCR + information extraction engine for business cards in ANY language "
        "(Arabic, English, French, Chinese, Japanese, etc.). "
        "The card may be rotated sideways or upside-down; mentally rotate and read correctly. "
        "Translate all extracted structured fields to ENGLISH (name/title/company/city/country/etc.) "
        "while keeping raw full original text in rawText. "
        "Read all visible text, infer fields, and return ONLY valid JSON with keys: "
        "account{name,type,website,city,country,street,notes}, "
        "contacts[{firstName,lastName,name,position,email,phone,city,country}], "
        "rawText, confidence, unmapped. "
        "If text is non-Latin, transliterate/translate to best English equivalent in structured fields. "
        "Do not add markdown or explanations."
    )
    payload = {
        "model": "gpt-4.1-mini",
        "input": [
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                    {"type": "input_image", "image_url": img_data_url},
                ],
            }
        ],
        "temperature": 0,
    }
    try:
        with httpx.Client(timeout=45.0) as client:
            resp = client.post(
                "https://api.openai.com/v1/responses",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if resp.status_code >= 300:
            detail = ""
            try:
                err_payload = resp.json()
                if isinstance(err_payload, dict):
                    err_obj = err_payload.get("error")
                    if isinstance(err_obj, dict):
                        detail = str(err_obj.get("message") or "").strip()
            except Exception:
                detail = ""
            suffix = f" {detail}" if detail else ""
            return {
                "ok": False,
                "error": f"OpenAI extraction failed ({resp.status_code}).{suffix}",
                "rawText": "",
                "account": {},
                "contacts": [],
                "confidence": 0,
                "unmapped": [],
                "fileName": file_name,
            }
        data = resp.json()
        out_text = _extract_text_from_responses_payload(data)
        if not out_text:
            return {
                "ok": False,
                "error": "OpenAI returned empty extraction output. No text content found in model response.",
                "rawText": "",
                "account": {},
                "contacts": [],
                "confidence": 0,
                "unmapped": [],
                "fileName": file_name,
            }
        try:
            parsed = json.loads(out_text)
        except Exception:
            # Some model outputs may include accidental text wrappers; try best-effort extraction.
            start = out_text.find("{")
            end = out_text.rfind("}")
            if start < 0 or end < 0 or end <= start:
                return {
                    "ok": False,
                    "error": "OpenAI returned non-JSON extraction output.",
                    "rawText": out_text,
                    "account": {},
                    "contacts": [],
                    "confidence": 0,
                    "unmapped": [],
                    "fileName": file_name,
                }
            parsed = json.loads(out_text[start : end + 1])
        account = parsed.get("account") if isinstance(parsed.get("account"), dict) else {}
        contacts_raw = parsed.get("contacts") if isinstance(parsed.get("contacts"), list) else []
        contacts = [_normalize_openai_contact(c) for c in contacts_raw if isinstance(c, dict)]
        normalized_account = {
            "name": str(account.get("name") or "").strip(),
            "type": str(account.get("type") or "Corporate").strip() or "Corporate",
            "website": str(account.get("website") or "").strip(),
            "city": str(account.get("city") or "").strip(),
            "country": str(account.get("country") or "").strip(),
            "street": str(account.get("street") or "").strip(),
            "notes": str(account.get("notes") or "").strip(),
        }
        enriched_note = _enrich_company_from_web(normalized_account)
        if enriched_note:
            normalized_account["notes"] = (
                f"{normalized_account['notes']}\n{enriched_note}".strip()
                if normalized_account["notes"]
                else enriched_note
            )
        return {
            "ok": True,
            "error": "",
            "rawText": str(parsed.get("rawText") or ""),
            "account": normalized_account,
            "contacts": contacts,
            "confidence": int(parsed.get("confidence") or 0),
            "unmapped": parsed.get("unmapped") if isinstance(parsed.get("unmapped"), list) else [],
            "fileName": file_name,
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": f"OpenAI extraction error: {str(exc)}",
            "rawText": "",
            "account": {},
            "contacts": [],
            "confidence": 0,
            "unmapped": [],
            "fileName": file_name,
        }


def parse_business_card_image(content: bytes, file_name: str = "") -> dict[str, Any]:
    return _extract_with_openai(content, file_name)
