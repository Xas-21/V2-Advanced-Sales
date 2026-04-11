import requests

BASE_URL = "http://127.0.0.1:8000"
LOGIN_URL = f"{BASE_URL}/api/login"
CRM_STATE_URL = f"{BASE_URL}/api/crm-state"
USERNAME = "Abdullah"
PASSWORD = "password123"
PROPERTY_ID = "P5jj48x718"
TIMEOUT = 30
PIPELINE_BUCKETS = {"new", "qualified", "proposal", "negotiation", "won", "notInterested"}


def test_post_api_crm_state_persists_crm_payload():
    session = requests.Session()
    try:
        # Login to get session cookie
        login_payload = {"username": USERNAME, "password": PASSWORD}
        login_resp = session.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        assert "session_id" in login_resp.cookies, "No session cookie received on login"

        # GET /api/crm-state?propertyId=P5jj48x718
        params = {"propertyId": PROPERTY_ID}
        get_resp = session.get(CRM_STATE_URL, params=params, timeout=TIMEOUT)
        assert get_resp.status_code == 200, f"GET crm-state failed: {get_resp.text}"
        get_json = get_resp.json()
        assert get_json.get("propertyId") == PROPERTY_ID, "Returned propertyId mismatch"

        leads = get_json.get("leads")
        account_activities = get_json.get("accountActivities")
        assert isinstance(leads, dict), "Leads is not an object"
        assert isinstance(account_activities, (dict, list)), "accountActivities type unexpected"

        # Check leads keys are exactly the pipeline buckets and values are arrays (lists)
        leads_keys = set(leads.keys())
        assert leads_keys == PIPELINE_BUCKETS, f"Leads keys mismatch: {leads_keys}"
        for key in PIPELINE_BUCKETS:
            assert isinstance(leads[key], list), f"Leads[{key}] is not a list"

        # Prepare POST payload
        post_payload = {
            "propertyId": PROPERTY_ID,
            "leads": leads,
            "accountActivities": account_activities,
        }

        # POST /api/crm-state with the same payload
        post_resp = session.post(CRM_STATE_URL, json=post_payload, timeout=TIMEOUT)
        assert post_resp.status_code == 200, f"POST crm-state failed: {post_resp.text}"
        post_json = post_resp.json()

        # Validate response propertyId and leads keys
        assert post_json.get("propertyId") == PROPERTY_ID, "POST response propertyId mismatch"
        post_leads = post_json.get("leads")
        assert isinstance(post_leads, dict), "POST response leads is not an object"
        post_leads_keys = set(post_leads.keys())
        assert post_leads_keys == PIPELINE_BUCKETS, f"POST response leads keys mismatch: {post_leads_keys}"
        for key in PIPELINE_BUCKETS:
            assert isinstance(post_leads[key], list), f"POST response leads[{key}] is not a list"

    finally:
        session.close()


test_post_api_crm_state_persists_crm_payload()