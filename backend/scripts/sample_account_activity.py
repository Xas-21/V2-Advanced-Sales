import json
import os
from pathlib import Path
import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
dsn = os.getenv("DATABASE_URL")
with psycopg.connect(dsn, row_factory=dict_row) as conn:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, payload->'activities' AS acts
            FROM accounts_rows
            WHERE property_id = 'Ps8b83kgbm'
              AND jsonb_array_length(COALESCE(payload->'activities', '[]'::jsonb)) > 0
            LIMIT 3
            """
        )
        for r in cur.fetchall():
            print("===", r["id"], "===")
            acts = r["acts"] or []
            for a in acts[:3]:
                print(json.dumps(a, indent=2, default=str)[:800])
