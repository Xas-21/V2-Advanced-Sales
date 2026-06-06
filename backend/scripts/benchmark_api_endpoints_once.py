"""Time each API endpoint the app hits on dashboard/requests load."""
import statistics
import time
import urllib.request

BASE = "http://127.0.0.1:8000"
PID = "Ps8b83kgbm"
RUNS = 3

ENDPOINTS = [
    "/api/health",
    "/api/properties",
    f"/api/requests?propertyId={PID}",
    f"/api/accounts?propertyId={PID}",
    f"/api/crm-state?propertyId={PID}",
    f"/api/taxes?propertyId={PID}",
    f"/api/financials?propertyId={PID}",
    f"/api/promotions?propertyId={PID}",
    f"/api/tasks?propertyId={PID}",
    f"/api/venues?propertyId={PID}",
    f"/api/rooms?propertyId={PID}",
]


def fetch(url: str) -> tuple[float, int]:
    t0 = time.perf_counter()
    with urllib.request.urlopen(url, timeout=120) as r:
        body = r.read()
    return time.perf_counter() - t0, len(body)


def main():
    print(f"Backend: {BASE}  propertyId={PID}  runs={RUNS}\n")
    totals = []
    for ep in ENDPOINTS:
        url = BASE + ep
        times = []
        size = 0
        for _ in range(RUNS):
            try:
                sec, size = fetch(url)
                times.append(sec * 1000)
            except Exception as e:
                print(f"{ep:<45} ERROR: {e}")
                times = []
                break
        if times:
            avg = statistics.mean(times)
            totals.append(avg)
            kb = size / 1024
            print(f"{ep:<45} {avg:7.0f} ms avg  ({kb:.0f} KB)")

    print("-" * 60)
    print(f"{'If all run in parallel (best case)':<45} {max(totals):7.0f} ms")
    print(f"{'If all run serially (worst case)':<45} {sum(totals):7.0f} ms")
    print("\nRequestsManager also fetches requests again (duplicate of AS refresh).")


if __name__ == "__main__":
    main()
