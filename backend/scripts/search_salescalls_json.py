import os
from pathlib import Path
import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
dsn = os.getenv("DATABASE_URL")
with psycopg.connect(dsn, row_factory=dict_row, connect_timeout=60) as conn:
    with conn.cursor() as cur:
        for term in ['"salesCalls"', 'pipelineCardId', 'LEAD_', 'CALL_']:
            cur.execute(
                """
                SELECT collection_name, map_key
                FROM app_collection_maps
                WHERE payload::text LIKE %s
                """,
                (f'%{term}%',),
            )
            rows = cur.fetchall()
            print(term, len(rows), rows[:5])
