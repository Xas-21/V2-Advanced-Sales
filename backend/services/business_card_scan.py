import io
import re
from typing import Any


EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
PHONE_RE = re.compile(r"(?:(?:\+|00)\d{1,3}[-\s]?)?(?:\(?\d{2,4}\)?[-\s]?)?\d{3,4}[-\s]?\d{3,4}")
WEBSITE_RE = re.compile(r"\b(?:https?://)?(?:www\.)?[A-Z0-9.-]+\.[A-Z]{2,}(?:/[^\s]*)?\b", re.IGNORECASE)


def _safe_import_ocr():
    try:
        import pytesseract  # type: ignore
        from PIL import Image  # type: ignore

        return pytesseract, Image, None
    except Exception as exc:  # pragma: no cover
        return None, None, str(exc)


def _split_name(name: str) -> tuple[str, str]:
    parts = [p for p in str(name or "").strip().split() if p]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def _pick_company(lines: list[str], website_domain: str, email_domain: str) -> str:
    if website_domain:
        return website_domain
    if email_domain:
        return email_domain
    if not lines:
        return ""
    longest = max(lines[:6], key=lambda s: len(s.strip() or ""))
    return longest.strip()


def _extract_domains(website: str, email: str) -> tuple[str, str]:
    website_domain = ""
    if website:
        w = website.lower().replace("http://", "").replace("https://", "").replace("www.", "")
        website_domain = w.split("/")[0].strip()
    email_domain = ""
    if email and "@" in email:
        email_domain = email.split("@", 1)[1].strip().lower()
    return website_domain, email_domain


def parse_business_card_image(content: bytes, file_name: str = "") -> dict[str, Any]:
    pytesseract, Image, import_error = _safe_import_ocr()
    if not pytesseract or not Image:
        return {
            "ok": False,
            "error": "OCR dependencies are not installed on backend host.",
            "details": import_error,
            "rawText": "",
            "account": {},
            "contacts": [],
            "confidence": 0,
            "unmapped": [],
            "fileName": file_name,
        }

    try:
        image = Image.open(io.BytesIO(content))
        raw_text = pytesseract.image_to_string(image) or ""
    except Exception as exc:
        return {
            "ok": False,
            "error": f"Could not read card image: {exc}",
            "rawText": "",
            "account": {},
            "contacts": [],
            "confidence": 0,
            "unmapped": [],
            "fileName": file_name,
        }

    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    text_blob = "\n".join(lines)
    emails = EMAIL_RE.findall(text_blob)
    phones = PHONE_RE.findall(text_blob)
    websites = [w for w in WEBSITE_RE.findall(text_blob) if "." in w and "@" not in w]

    email = emails[0] if emails else ""
    phone = phones[0] if phones else ""
    website = websites[0] if websites else ""
    website_domain, email_domain = _extract_domains(website, email)

    probable_name = ""
    for ln in lines[:5]:
        if any(char.isdigit() for char in ln):
            continue
        if "@" in ln or "www." in ln.lower():
            continue
        probable_name = ln
        break
    first_name, last_name = _split_name(probable_name)

    company_guess = _pick_company(lines, website_domain, email_domain)
    company_clean = company_guess.replace(".com", "").replace(".net", "").replace(".org", "")
    company_clean = " ".join(part for part in re.split(r"[-_.]", company_clean) if part).strip().title()

    account = {
        "name": company_clean or "",
        "type": "Corporate",
        "website": website,
        "city": "",
        "country": "",
        "street": "",
        "notes": "",
    }
    contact = {
        "firstName": first_name,
        "lastName": last_name,
        "position": "",
        "email": email,
        "phone": phone,
        "city": "",
        "country": "",
        "name": " ".join([first_name, last_name]).strip(),
    }
    conf_hits = sum(1 for v in [account["name"], email, phone, website, contact["name"]] if str(v or "").strip())
    confidence = min(99, conf_hits * 20)

    used_tokens = {email.lower(), phone.lower(), website.lower(), probable_name.lower(), account["name"].lower()}
    unmapped = [ln for ln in lines if ln.lower() not in used_tokens][:12]

    return {
        "ok": True,
        "error": "",
        "rawText": raw_text,
        "account": account,
        "contacts": [contact] if any(contact.values()) else [],
        "confidence": confidence,
        "unmapped": unmapped,
        "fileName": file_name,
    }
