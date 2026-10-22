"""
Historical Construction Data & Real Dataset Service for ConstructFlow.

Manages:
1. historical_projects (Real completed projects and imported QS/contractor BOQs)
2. material_prices (Recorded supplier-confirmed order prices)
3. price_indices (CIDA Bulletin of Construction Statistics indices)

Operates with dual storage:
- Primary: Supabase PostgreSQL (via service client)
- Synchronized Local SQLite Cache: backend/models/real_construction_data.db
  (Ensures immediate operation even if Supabase SQL migrations are pending)
"""

from __future__ import annotations

import csv
import datetime
import io
import json
import logging
import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from core.database import get_service_client

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
LOCAL_DB_PATH = MODELS_DIR / "real_construction_data.db"

SRI_LANKA_DISTRICTS = [
    "Ampara", "Anuradhapura", "Badulla", "Batticaloa", "Colombo",
    "Galle", "Gampaha", "Hambantota", "Jaffna", "Kalutara",
    "Kandy", "Kegalle", "Kilinochchi", "Kurunegala", "Mannar",
    "Matale", "Matara", "Monaragala", "Mullaitivu", "Nuwara Eliya",
    "Polonnaruwa", "Puttalam", "Ratnapura", "Trincomalee", "Vavuniya"
]
DISTRICTS_LOWER = {d.lower(): d for d in SRI_LANKA_DISTRICTS}

PROJECT_TYPES = [
    "Residential House", "Commercial Building", "Apartment Complex",
    "Industrial", "Warehouse", "Road Construction", "Renovation"
]

QUALITY_TIERS = ["Standard", "Premium", "Luxury"]


def _get_local_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(LOCAL_DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_local_db():
    """Initializes local SQLite schema mirrors."""
    conn = _get_local_conn()
    cur = conn.cursor()
    cur.executescript("""
    CREATE TABLE IF NOT EXISTS historical_projects (
        id TEXT PRIMARY KEY,
        project_name TEXT NOT NULL,
        project_type TEXT NOT NULL,
        district TEXT NOT NULL,
        town TEXT,
        floor_area_sqft REAL NOT NULL,
        floors INTEGER NOT NULL DEFAULT 1,
        structure_type TEXT NOT NULL DEFAULT 'RCC frame',
        quality_tier TEXT NOT NULL DEFAULT 'Standard',
        site_condition TEXT NOT NULL DEFAULT 'Flat',
        start_date TEXT,
        end_date TEXT,
        estimate_total_lkr REAL,
        actual_total_lkr REAL NOT NULL,
        actual_materials_lkr REAL DEFAULT 0,
        actual_labour_lkr REAL DEFAULT 0,
        actual_equipment_lkr REAL DEFAULT 0,
        actual_overhead_lkr REAL DEFAULT 0,
        cost_year INTEGER NOT NULL,
        notes TEXT,
        source TEXT NOT NULL DEFAULT 'real',
        imported_by TEXT,
        import_batch_id TEXT,
        evidence_note TEXT,
        verified INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        UNIQUE(project_name, start_date)
    );

    CREATE TABLE IF NOT EXISTS material_prices (
        id TEXT PRIMARY KEY,
        material TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT 'unit',
        unit_price REAL NOT NULL,
        supplier_name TEXT,
        district TEXT,
        order_date TEXT NOT NULL,
        purchase_order_id TEXT,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS price_indices (
        id TEXT PRIMARY KEY,
        material_group TEXT NOT NULL,
        month TEXT NOT NULL,
        index_value REAL NOT NULL,
        base_year INTEGER NOT NULL DEFAULT 2020,
        source TEXT DEFAULT 'CIDA Bulletin of Construction Statistics',
        created_at TEXT NOT NULL,
        UNIQUE(material_group, month)
    );
    """)

    # Migrate columns if existing SQLite DB lacks provenance fields
    for col, ctype in [
        ("imported_by", "TEXT"),
        ("import_batch_id", "TEXT"),
        ("evidence_note", "TEXT"),
        ("verified", "INTEGER DEFAULT 1")
    ]:
        try:
            cur.execute(f"ALTER TABLE historical_projects ADD COLUMN {col} {ctype}")
        except sqlite3.OperationalError:
            pass

    conn.commit()
    conn.close()


init_local_db()


def validate_district(val: str) -> Optional[str]:
    clean = str(val or "").strip().lower()
    return DISTRICTS_LOWER.get(clean)


def import_historical_projects_from_csv(
    csv_content: str,
    evidence_note: str,
    imported_by: Optional[str] = None
) -> Dict[str, Any]:
    """
    Imports historical completed project records from CSV.
    Requires evidence_note (e.g., QS firm, contractor, BOQ file reference).
    """
    import uuid

    clean_evidence = str(evidence_note or "").strip()
    if not clean_evidence:
        raise ValueError("A source note / evidence note is required per import batch (e.g., QS firm, contractor, BOQ file reference).")

    batch_id = f"batch_{int(datetime.datetime.now(datetime.timezone.utc).timestamp())}_{uuid.uuid4().hex[:6]}"

    reader = csv.DictReader(io.StringIO(csv_content.strip()))
    required_cols = {"project_name", "project_type", "district", "floor_area_sqft", "actual_total_lkr"}
    headers = set(col.strip().lower() for col in (reader.fieldnames or []))

    missing = required_cols - headers
    if missing:
        raise ValueError(f"Missing required CSV columns: {', '.join(sorted(missing))}")

    inserted = 0
    skipped_duplicates = 0
    errors: List[str] = []
    rows_to_save: List[Dict[str, Any]] = []

    conn = _get_local_conn()
    cur = conn.cursor()

    for idx, row in enumerate(reader, start=2):
        row_clean = {k.strip().lower(): v.strip() for k, v in row.items() if k}
        name = row_clean.get("project_name")
        if not name:
            errors.append(f"Row {idx}: project_name is required")
            continue

        raw_district = row_clean.get("district", "")
        canonical_district = validate_district(raw_district)
        if not canonical_district:
            errors.append(f"Row {idx}: District '{raw_district}' is invalid. Must be one of the 25 Sri Lankan districts.")
            continue

        try:
            sqft = float(row_clean.get("floor_area_sqft") or 0)
            if sqft <= 0:
                errors.append(f"Row {idx}: floor_area_sqft must be positive.")
                continue
        except ValueError:
            errors.append(f"Row {idx}: Invalid floor_area_sqft value.")
            continue

        try:
            actual_total = float(row_clean.get("actual_total_lkr") or 0)
            if actual_total <= 0:
                errors.append(f"Row {idx}: actual_total_lkr must be positive.")
                continue
        except ValueError:
            errors.append(f"Row {idx}: Invalid actual_total_lkr value.")
            continue

        start_date = row_clean.get("start_date") or None
        end_date = row_clean.get("end_date") or None

        if start_date and end_date and end_date < start_date:
            errors.append(f"Row {idx}: end_date ({end_date}) cannot be before start_date ({start_date}).")
            continue

        try:
            floors = int(row_clean.get("floors") or 1)
        except ValueError:
            floors = 1

        cost_year_raw = row_clean.get("cost_year")
        try:
            cost_year = int(cost_year_raw) if cost_year_raw else (int(start_date[:4]) if start_date else datetime.date.today().year)
        except ValueError:
            cost_year = datetime.date.today().year

        est_total = None
        if row_clean.get("estimate_total_lkr"):
            try:
                est_total = float(row_clean.get("estimate_total_lkr"))
            except ValueError:
                est_total = None

        mats = float(row_clean.get("actual_materials_lkr") or 0)
        labour = float(row_clean.get("actual_labour_lkr") or 0)
        equip = float(row_clean.get("actual_equipment_lkr") or 0)
        overhead = float(row_clean.get("actual_overhead_lkr") or 0)

        record_id = str(uuid.uuid4())
        record = {
            "id": record_id,
            "project_name": name,
            "project_type": row_clean.get("project_type") or "Residential House",
            "district": canonical_district,
            "town": row_clean.get("town") or None,
            "floor_area_sqft": sqft,
            "floors": max(1, floors),
            "structure_type": row_clean.get("structure_type") or "RCC frame",
            "quality_tier": row_clean.get("quality_tier") or "Standard",
            "site_condition": row_clean.get("site_condition") or "Flat",
            "start_date": start_date,
            "end_date": end_date,
            "estimate_total_lkr": est_total,
            "actual_total_lkr": actual_total,
            "actual_materials_lkr": mats,
            "actual_labour_lkr": labour,
            "actual_equipment_lkr": equip,
            "actual_overhead_lkr": overhead,
            "cost_year": cost_year,
            "notes": row_clean.get("notes") or None,
            "source": "imported_boq",
            "imported_by": imported_by,
            "import_batch_id": batch_id,
            "evidence_note": clean_evidence,
            "verified": 1,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }

        # Check local duplicate
        cur.execute(
            "SELECT 1 FROM historical_projects WHERE project_name = ? AND start_date IS ?",
            (name, start_date)
        )
        if cur.fetchone():
            skipped_duplicates += 1
            continue

        rows_to_save.append(record)

    # Save to local SQLite
    for r in rows_to_save:
        try:
            cur.execute("""
            INSERT INTO historical_projects (
                id, project_name, project_type, district, town, floor_area_sqft, floors,
                structure_type, quality_tier, site_condition, start_date, end_date,
                estimate_total_lkr, actual_total_lkr, actual_materials_lkr, actual_labour_lkr,
                actual_equipment_lkr, actual_overhead_lkr, cost_year, notes, source,
                imported_by, import_batch_id, evidence_note, verified, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                r["id"], r["project_name"], r["project_type"], r["district"], r["town"],
                r["floor_area_sqft"], r["floors"], r["structure_type"], r["quality_tier"],
                r["site_condition"], r["start_date"], r["end_date"], r["estimate_total_lkr"],
                r["actual_total_lkr"], r["actual_materials_lkr"], r["actual_labour_lkr"],
                r["actual_equipment_lkr"], r["actual_overhead_lkr"], r["cost_year"],
                r["notes"], r["source"], r["imported_by"], r["import_batch_id"],
                r["evidence_note"], r["verified"], r["created_at"]
            ))
            inserted += 1
        except sqlite3.IntegrityError:
            skipped_duplicates += 1

    conn.commit()

    # Also sync to Supabase if table exists
    sb = get_service_client()
    if sb and rows_to_save:
        try:
            sb.table("historical_projects").upsert(rows_to_save, on_conflict="project_name,start_date").execute()
            logger.info("Synchronized %d historical projects to Supabase", len(rows_to_save))
        except Exception as e:
            logger.warning("Could not sync to Supabase historical_projects table: %s", e)

    cur.execute("""
        SELECT COUNT(*) FROM historical_projects 
        WHERE source IN ('real', 'imported_boq', 'real_completed') AND (verified = 1 OR verified IS 1)
    """)
    total_real = cur.fetchone()[0]
    conn.close()

    return {
        "status": "success",
        "inserted": inserted,
        "skipped_duplicates": skipped_duplicates,
        "errors": errors[:15],
        "batch_id": batch_id,
        "evidence_note": clean_evidence,
        "total_real_projects": total_real,
    }


def import_price_indices_from_csv(csv_content: str) -> Dict[str, Any]:
    """
    Imports CIDA Bulletin of Construction Statistics price indices.
    Columns: material_group, month (YYYY-MM), index_value, base_year (optional)
    """
    import uuid

    reader = csv.DictReader(io.StringIO(csv_content.strip()))
    required_cols = {"material_group", "month", "index_value"}
    headers = set(col.strip().lower() for col in (reader.fieldnames or []))

    missing = required_cols - headers
    if missing:
        raise ValueError(f"Missing required CSV columns: {', '.join(sorted(missing))}")

    conn = _get_local_conn()
    cur = conn.cursor()
    inserted = 0
    errors: List[str] = []
    rows_to_save: List[Dict[str, Any]] = []

    for idx, row in enumerate(reader, start=2):
        row_clean = {k.strip().lower(): v.strip() for k, v in row.items() if k}
        group = row_clean.get("material_group")
        month = row_clean.get("month")

        if not group or not month:
            errors.append(f"Row {idx}: material_group and month (YYYY-MM) are required")
            continue

        try:
            val = float(row_clean.get("index_value") or 0)
            if val <= 0:
                errors.append(f"Row {idx}: index_value must be > 0")
                continue
        except ValueError:
            errors.append(f"Row {idx}: Invalid index_value")
            continue

        base_year = int(row_clean.get("base_year") or 2020)
        rec = {
            "id": str(uuid.uuid4()),
            "material_group": group,
            "month": month,
            "index_value": val,
            "base_year": base_year,
            "source": row_clean.get("source") or "CIDA Bulletin of Construction Statistics",
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }

        try:
            cur.execute("""
            INSERT OR REPLACE INTO price_indices (id, material_group, month, index_value, base_year, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (rec["id"], rec["material_group"], rec["month"], rec["index_value"], rec["base_year"], rec["source"], rec["created_at"]))
            inserted += 1
            rows_to_save.append(rec)
        except Exception as e:
            errors.append(f"Row {idx}: {e}")

    conn.commit()

    sb = get_service_client()
    if sb and rows_to_save:
        try:
            sb.table("price_indices").upsert(rows_to_save, on_conflict="material_group,month").execute()
        except Exception as e:
            logger.warning("Could not sync price_indices to Supabase: %s", e)

    conn.close()
    return {
        "status": "success",
        "inserted": inserted,
        "errors": errors[:15]
    }


def record_material_price(
    material: str,
    unit_price: float,
    supplier_name: Optional[str] = None,
    district: Optional[str] = None,
    order_date: Optional[str] = None,
    purchase_order_id: Optional[str] = None,
    unit: str = "unit"
):
    """Logs a supplier-confirmed purchase order item price."""
    import uuid
    if unit_price <= 0:
        return

    rec_id = str(uuid.uuid4())
    date_str = order_date or datetime.date.today().isoformat()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    conn = _get_local_conn()
    cur = conn.cursor()
    cur.execute("""
    INSERT INTO material_prices (id, material, unit, unit_price, supplier_name, district, order_date, purchase_order_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (rec_id, material, unit, unit_price, supplier_name, district, date_str, purchase_order_id, now_iso))
    conn.commit()
    conn.close()

    sb = get_service_client()
    if sb:
        try:
            sb.table("material_prices").insert({
                "id": rec_id,
                "material": material,
                "unit": unit,
                "unit_price": unit_price,
                "supplier_name": supplier_name,
                "district": district,
                "order_date": date_str,
                "purchase_order_id": purchase_order_id,
                "created_at": now_iso
            }).execute()
        except Exception as e:
            logger.warning("Could not write to Supabase material_prices: %s", e)


# CIDA benchmark construction material price index by year (Base: 2020 = 100.0)
CIDA_ANNUAL_PRICE_INDICES = {
    2020: 100.0,
    2021: 114.5,
    2022: 186.2,
    2023: 224.8,
    2024: 236.4,
    2025: 246.0,
    2026: 255.0,
}


def get_construction_price_index(year: int, month: Optional[str] = None) -> float:
    """Returns the CIDA construction material price index for the given year/month."""
    try:
        conn = _get_local_conn()
        cur = conn.cursor()
        if month:
            cur.execute("SELECT index_value FROM price_indices WHERE month = ? LIMIT 1", (month,))
            row = cur.fetchone()
            if row:
                conn.close()
                return float(row[0])
        conn.close()
    except Exception:
        pass

    if year in CIDA_ANNUAL_PRICE_INDICES:
        return CIDA_ANNUAL_PRICE_INDICES[year]
    if year < 2020:
        return 90.0
    return 255.0


def get_all_real_projects() -> List[Dict[str, Any]]:
    """
    Returns only verified real historical projects (source in 'real', 'imported_boq', 'real_completed' and verified = 1).
    Excludes synthetic, sample/demo, or unverified records.
    """
    conn = _get_local_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT * FROM historical_projects 
        WHERE source IN ('real', 'imported_boq', 'real_completed')
          AND (verified = 1 OR verified IS 1)
        ORDER BY start_date DESC, created_at DESC
    """)
    rows = [dict(row) for row in cur.fetchall()]
    conn.close()
    return rows


def get_real_projects_count() -> int:
    """Returns count of verified real projects used for training, accuracy, and benchmarks."""
    conn = _get_local_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT COUNT(*) FROM historical_projects 
        WHERE source IN ('real', 'imported_boq', 'real_completed')
          AND (verified = 1 OR verified IS 1)
    """)
    count = cur.fetchone()[0]
    conn.close()
    return int(count)


def get_all_historical_projects_for_display(limit: int = 200) -> List[Dict[str, Any]]:
    """
    Returns all historical records for administrative inspection.
    Includes verified real projects as well as sample/demo records (which are labeled).
    """
    conn = _get_local_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT * FROM historical_projects 
        ORDER BY 
          CASE WHEN source IN ('real', 'imported_boq', 'real_completed') AND (verified = 1 OR verified IS 1) THEN 0 ELSE 1 END,
          start_date DESC, 
          created_at DESC
        LIMIT ?
    """, (limit,))
    rows = [dict(row) for row in cur.fetchall()]
    conn.close()
    return rows


def get_sample_csv_template() -> str:
    """Returns the standardized CSV template for historical projects import."""
    headers = [
        "project_name", "project_type", "district", "town",
        "floor_area_sqft", "floors", "structure_type", "quality_tier",
        "site_condition", "start_date", "end_date", "estimate_total_lkr",
        "actual_total_lkr", "actual_materials_lkr", "actual_labour_lkr",
        "actual_equipment_lkr", "actual_overhead_lkr", "cost_year", "notes"
    ]
    sample_rows = [
        [
            "Colombo Horizon Villa", "Residential House", "Colombo", "Nugegoda",
            "2800", "2", "RCC frame", "Premium", "Flat", "2024-01-15", "2024-11-20",
            "42000000", "44500000", "24000000", "12500000", "3000000", "5000000", "2024", "Contractor BOQ completed on schedule"
        ],
        [
            "Kandy Hillside Commercial", "Commercial Building", "Kandy", "Peradeniya",
            "5200", "3", "RCC frame", "Standard", "Sloped", "2023-03-01", "2024-04-10",
            "75000000", "81200000", "43000000", "23000000", "7200000", "8000000", "2023", "Retaining wall excavation cost variation"
        ],
        [
            "Galle Coastal Apartments", "Apartment Complex", "Galle", "Unawatuna",
            "12000", "4", "RCC frame", "Luxury", "Flat", "2023-06-10", "2024-09-30",
            "210000000", "218400000", "118000000", "59000000", "18000000", "23400000", "2023", "Marine grade steel specification"
        ]
    ]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    for r in sample_rows:
        writer.writerow(r)
    return output.getvalue()


def import_historical_projects_from_file(
    file_bytes: bytes,
    filename: str,
    evidence_note: str,
    imported_by: Optional[str] = None
) -> Dict[str, Any]:
    """
    Imports historical completed project records from CSV or Excel (.xlsx, .xls) files.
    """
    import pandas as pd

    lower_name = filename.lower()
    if lower_name.endswith(".xlsx") or lower_name.endswith(".xls"):
        try:
            # Read first sheet
            df = pd.read_excel(io.BytesIO(file_bytes))
            # Normalize column names: strip whitespace
            df.columns = [str(c).strip() for c in df.columns]
            # Convert NaN to empty string
            df = df.fillna("")
            csv_buffer = io.StringIO()
            df.to_csv(csv_buffer, index=False)
            csv_content = csv_buffer.getvalue()
        except Exception as e:
            raise ValueError(f"Failed to parse Excel file '{filename}': {str(e)}")
    elif lower_name.endswith(".csv") or lower_name.endswith(".txt"):
        try:
            csv_content = file_bytes.decode("utf-8-sig", errors="replace")
        except Exception as e:
            raise ValueError(f"Failed to read CSV file: {str(e)}")
    else:
        raise ValueError("Unsupported file format. Please upload a .csv, .xlsx, or .xls file.")

    return import_historical_projects_from_csv(
        csv_content=csv_content,
        evidence_note=evidence_note,
        imported_by=imported_by
    )

