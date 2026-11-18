"""
ConstructFlow Smart BOQ Ingestion & Baseline Parser
Parses Excel (.xlsx, .xls) and CSV Bill of Quantities (BOQ),
extracts milestones, core materials, validates unit rates against CIDA / Sri Lankan market benchmarks,
and prepares project baselines.
"""
from typing import Dict, Any, List, Optional
import io
import re
import math
from core.spreadsheet_limits import validate_spreadsheet
import pandas as pd

# Sri Lankan CIDA / Market Price Benchmarks (approximate mid-range 2024-2026 in LKR)
BENCHMARK_RATES: Dict[str, Dict[str, Any]] = {
    "cement": {
        "display_name": "Cement (Ordinary Portland 50kg)",
        "unit": "bags",
        "valid_units": ["bag", "bags", "nos", "pack", "pkt"],
        "benchmark_rate": 2450.0,
        "keywords": ["cement bag", "portland cement", "opc cement", "supply cement", "cement (50kg)"],
        "category": "Structural"
    },
    "steel": {
        "display_name": "Reinforcement Steel / Rebar",
        "unit": "kg",
        "valid_units": ["kg", "kgs", "ton", "tons", "mt", "t"],
        "benchmark_rate": 320.0,
        "keywords": ["tor steel", "reinforcement steel", "rebar", "high yield steel", "mild steel bar", "steel reinforcement"],
        "category": "Structural"
    },
    "sand": {
        "display_name": "River Sand",
        "unit": "cubes",
        "valid_units": ["cube", "cubes", "m3", "cu.m"],
        "benchmark_rate": 24000.0,
        "keywords": ["river sand", "fine sand", "mining sand", "supply of sand"],
        "category": "Masonry"
    },
    "aggregate": {
        "display_name": "Coarse Aggregate / Metal (3/4\")",
        "unit": "cubes",
        "valid_units": ["cube", "cubes", "m3", "cu.m"],
        "benchmark_rate": 21000.0,
        "keywords": ["metal 3/4", "crushed metal", "blue metal", "coarse aggregate"],
        "category": "Structural"
    },
    "brick": {
        "display_name": "Clay Bricks",
        "unit": "units",
        "valid_units": ["unit", "units", "nos", "nr", "1000 nos"],
        "benchmark_rate": 32.0,
        "keywords": ["clay brick", "wire cut brick", "burnt brick", "supply bricks"],
        "category": "Masonry"
    },
    "blocks": {
        "display_name": "Cement Blocks (4\" / 6\")",
        "unit": "units",
        "valid_units": ["unit", "units", "nos", "nr"],
        "benchmark_rate": 95.0,
        "keywords": ["cement block", "hollow block", "solid block", "4 inch block", "6 inch block"],
        "category": "Masonry"
    },
    "concrete": {
        "display_name": "Ready Mix Concrete (Grade 25/30)",
        "unit": "m3",
        "valid_units": ["m3", "cu.m", "cum"],
        "benchmark_rate": 36000.0,
        "keywords": ["ready mix", "concrete g25", "concrete g30", "rmc", "grade 25 concrete", "grade 30 concrete"],
        "category": "Structural"
    },
    "paint": {
        "display_name": "Emulsion / Weather-shield Paint",
        "unit": "liters",
        "valid_units": ["l", "ltr", "liters", "litres", "gal", "gallon"],
        "benchmark_rate": 2800.0,
        "keywords": ["emulsion paint", "weathershield paint", "primer paint", "enamel paint", "supply paint"],
        "category": "Finishes"
    }
}

STAGE_KEYWORDS = [
    ("Substructure & Foundation", ["excavation", "trench", "footing", "foundation", "earthwork", "blinding", "hardcore", "dpc", "substructure", "backfill"]),
    ("Superstructure & Frame", ["column", "beam", "slab", "concrete", "reinforcement", "rebar", "formwork", "shuttering", "lintel", "superstructure", "frame"]),
    ("Masonry & Partitions", ["brick", "block", "masonry", "wall", "partition", "blockwork", "damp proof"]),
    ("Roofing & Structural Steel", ["roof", "truss", "purlin", "sheet", "ceiling", "rafter", "gutter", "zinc", "asbestos", "tile roof"]),
    ("Finishes & Flooring", ["plaster", "tile", "tiling", "paint", "painting", "skim coat", "rendering", "screed", "granite", "terrazzo", "finish"]),
    ("MEP & Building Services", ["plumbing", "pipe", "wire", "electrical", "conduit", "drainage", "sanitary", "fitting", "mep", "switch", "sewer"]),
    ("External Works & Preliminaries", ["site clearance", "hoarding", "fencing", "paving", "external", "landscape", "preliminaries", "testing", "demolition"])
]


def classify_stage(description: str, explicit_stage: Optional[str] = None) -> str:
    if explicit_stage and str(explicit_stage).strip() and str(explicit_stage).lower() not in ("nan", "none", ""):
        return str(explicit_stage).strip()

    desc_lower = str(description).lower()
    for stage_name, keywords in STAGE_KEYWORDS:
        if any(kw in desc_lower for kw in keywords):
            return stage_name
    return "General Construction & Works"


def find_column(df: pd.DataFrame, possible_names: List[str]) -> Optional[str]:
    for col in df.columns:
        norm = re.sub(r"[^a-z0-9]", "", str(col).lower())
        for name in possible_names:
            if name in norm:
                return col
    return None


def _promote_header_row(df: pd.DataFrame, header_keywords: List[str]) -> pd.DataFrame:
    """
    If a sheet has title/instruction banner rows above the actual column header row,
    scan the first 10 rows and promote the matching row as column headers.
    Requires at least 2 distinct columns/cells to match header keywords so a single merged title cell never matches.
    """
    if df is None or df.empty:
        return df

    matching_cols = sum(1 for c in df.columns if any(kw in str(c).lower() for kw in header_keywords))
    if matching_cols >= 2:
        return df

    for idx in range(min(10, len(df))):
        row_vals = [str(v).strip() if pd.notna(v) else "" for v in df.iloc[idx].tolist()]
        matching_cells = sum(1 for v in row_vals if v and any(kw in v.lower() for kw in header_keywords))
        if matching_cells >= 2:
            new_cols = [v if v else f"Col_{i}" for i, v in enumerate(row_vals)]
            trimmed = df.iloc[idx + 1:].copy()
            trimmed.columns = new_cols
            return trimmed.reset_index(drop=True)
    return df


def _clean_float(val: Any) -> float:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return 0.0
    text = str(val).strip()
    if text.lower() in {'', '-', '—', '–', 'n/a', 'na', 'none', 'nil'}:
        return 0.0
    # Remove formatting, never numeric signs or exponent characters. Stripping
    # arbitrary characters turned -5 into +5, 1e3 into 13, and Rs. 3,500 into 0.
    text = re.sub(r'(?i)^(?:lkr|rs\.?|rupees)\s*', '', text)
    if text.startswith('(') and text.endswith(')'):
        text = '-' + text[1:-1]
    text = re.sub(r'[,\s]', '', text)
    try:
        number = float(text)
    except (ValueError, OverflowError) as exc:
        raise ValueError('BOQ contains an invalid numeric value') from exc
    if not math.isfinite(number) or number < 0:
        raise ValueError('BOQ quantities, rates and amounts must be finite and nonnegative')
    return number


def parse_boq_dataframe(df: pd.DataFrame) -> Dict[str, Any]:
    if len(df) > 20000 or len(df.columns) > 100:
        raise ValueError("BOQ exceeds the 20000-row or 100-column limit")
    # Clean empty rows and columns
    df = df.dropna(how="all").dropna(axis=1, how="all")
    if df.empty:
        raise ValueError("The uploaded BOQ file contains no readable data.")

    df = _promote_header_row(
        df,
        ["activity name", "item description", "particular", "unit rate", "required", "quantity", "amount"],
    )
    df = df.dropna(how="all")

    # Find columns
    desc_col = find_column(df, ["activityname", "desc", "item", "particular", "activity", "name"])
    unit_col = find_column(df, ["unit", "uom", "measure"])
    qty_col = find_column(df, ["requiredqty", "qty", "quant", "estqty", "volume"])
    rate_col = find_column(df, ["unitrate", "rate", "price", "unitprice", "costperunit", "lkrrate"])
    amount_col = find_column(df, ["totalcost", "amount", "totalamount", "cost", "total", "subtotal"])
    stage_col = find_column(df, ["phase", "milestone", "stage", "section", "workcategory", "category", "bill", "trade"])
    duration_col = find_column(df, ["duration", "days"])
    dep_col = find_column(df, ["dependenc"])
    deliverable_col = find_column(df, ["deliverable"])
    id_col = find_column(df, ["activityid", "code", "itemno", "slno"])

    if not desc_col:
        # Fallback: take first string column
        text_cols = [c for c in df.columns if df[c].dtype == object]
        if text_cols:
            desc_col = text_cols[0]
        else:
            raise ValueError("Could not find an Item Description / Activity Name column in the BOQ file.")

    items: List[Dict[str, Any]] = []
    total_budget = 0.0
    stage_budgets: Dict[str, float] = {}
    stage_durations: Dict[str, int] = {}
    extracted_materials_map: Dict[str, Dict[str, Any]] = {}
    rate_warnings: List[Dict[str, Any]] = []
    current_phase: Optional[str] = None

    for _, row in df.iterrows():
        raw_first = str(row.get(id_col, "")).strip() if id_col and pd.notna(row.get(id_col)) else ""
        desc = str(row.get(desc_col, "")).strip() if pd.notna(row.get(desc_col)) else ""

        # Detect Phase / Milestone section banner rows (e.g. "PHASE 1 — SITE PREPARATION")
        banner_candidate = raw_first if raw_first.upper().startswith(("PHASE", "STAGE", "SECTION", "MILESTONE")) else (
            desc if desc.upper().startswith(("PHASE", "STAGE", "SECTION", "MILESTONE")) else ""
        )
        qty_val = _clean_float(row.get(qty_col)) if qty_col else 0.0
        rate_val = _clean_float(row.get(rate_col)) if rate_col else 0.0
        amt_val = _clean_float(row.get(amount_col)) if amount_col else 0.0
        if any(not math.isfinite(n) or n < 0 for n in (qty_val, rate_val, amt_val)):
            raise ValueError("BOQ quantities, rates and amounts must be finite and nonnegative")

        if banner_candidate and qty_val == 0.0 and rate_val == 0.0 and amt_val == 0.0:
            current_phase = re.sub(r"^(PHASE|STAGE|SECTION|MILESTONE)\s*\d*\s*[—\-:]*\s*", "", banner_candidate, flags=re.IGNORECASE).strip() or banner_candidate
            continue

        if not desc or desc.lower() in ("nan", "none", "total", "grand total", "subtotal"):
            continue

        qty = qty_val
        rate = rate_val
        amount = amt_val

        # Auto compute amount if missing
        if amount <= 0.0 and qty > 0.0 and rate > 0.0:
            amount = qty * rate
        elif qty <= 0.0 and rate > 0.0 and amount > 0.0:
            qty = round(amount / rate, 2)
        elif rate <= 0.0 and qty > 0.0 and amount > 0.0:
            rate = round(amount / qty, 2)

        unit = str(row.get(unit_col, "")).strip() if unit_col and pd.notna(row.get(unit_col)) else "units"
        explicit_stage = str(row.get(stage_col, "")).strip() if stage_col and pd.notna(row.get(stage_col)) else None
        if current_phase and (not explicit_stage or explicit_stage.lower() in ("nan", "none", "")):
            explicit_stage = current_phase

        stage = classify_stage(desc, explicit_stage)
        duration_days = int(_clean_float(row.get(duration_col))) if duration_col else 0
        stage_budgets[stage] = stage_budgets.get(stage, 0.0) + amount
        stage_durations[stage] = stage_durations.get(stage, 0) + max(0, duration_days)
        total_budget += amount

        item_dict = {
            "activity_id": raw_first or None,
            "description": desc,
            "stage": stage,
            "unit": unit,
            "quantity": qty,
            "rate": rate,
            "amount": amount,
            "duration_days": duration_days,
            "dependencies": str(row.get(dep_col, "")).strip() if dep_col and pd.notna(row.get(dep_col)) else None,
            "deliverable": str(row.get(deliverable_col, "")).strip() if deliverable_col and pd.notna(row.get(deliverable_col)) else None,
        }
        items.append(item_dict)

        # Cross check against CIDA / market benchmarks
        desc_lower = desc.lower()
        norm_unit = re.sub(r"[^a-z0-9]", "", unit.lower())
        for mat_key, bench in BENCHMARK_RATES.items():
            keyword_match = any(kw in desc_lower for kw in bench["keywords"])
            valid_units = bench.get("valid_units", [])
            unit_match = (not valid_units) or any(vu in norm_unit for vu in valid_units) or (norm_unit in ("item", "items", "units"))
            if keyword_match and unit_match:
                if rate > 0:
                    diff_pct = round(((rate - bench["benchmark_rate"]) / bench["benchmark_rate"]) * 100.0, 1)
                    if abs(diff_pct) >= 35.0:
                        severity = "warning" if diff_pct < 0 else "info"
                        rate_warnings.append({
                            "item": desc,
                            "material": bench["display_name"],
                            "boq_rate": rate,
                            "benchmark_rate": bench["benchmark_rate"],
                            "unit": unit or bench["unit"],
                            "variance_pct": diff_pct,
                            "severity": severity,
                            "message": f"BOQ rate (Rs. {rate:,.2f}) is {abs(diff_pct)}% {'below' if diff_pct < 0 else 'above'} CIDA average of Rs. {bench['benchmark_rate']:,.2f}/{bench['unit']}"
                        })

                # Aggregate core materials
                if mat_key not in extracted_materials_map:
                    extracted_materials_map[mat_key] = {
                        "name": bench["display_name"],
                        "category": bench["category"],
                        "unit": unit if unit and unit != "units" else bench["unit"],
                        "allocated_quantity": 0.0,
                        "unit_price": rate if rate > 0 else bench["benchmark_rate"],
                        "total_cost": 0.0
                    }
                extracted_materials_map[mat_key]["allocated_quantity"] += qty
                extracted_materials_map[mat_key]["total_cost"] += amount
                break

    # Structure Milestones
    milestones = []
    order = 1
    for st_name, st_budget in stage_budgets.items():
        if st_budget > 0 or len(stage_budgets) == 1:
            pct = round((st_budget / total_budget * 100.0), 1) if total_budget > 0 else 0
            dur = stage_durations.get(st_name, 0)
            if dur <= 0:
                dur = max(14, int(round((pct / 100.0) * 180))) if pct > 0 else 21
            milestones.append({
                "title": st_name,
                "description": f"Phase allocated budget: Rs. {st_budget:,.2f} ({pct}% of total BOQ)",
                "allocated_budget": round(st_budget, 2),
                "duration_days": dur,
                "order": order,
                "status": "Pending",
                "completion_percentage": 0
            })
            order += 1

    # Format extracted materials
    materials = list(extracted_materials_map.values())

    # Feasibility Score (starts at 100, reduced by extreme negative variances that suggest under-budgeting)
    severe_underestimates = [w for w in rate_warnings if w.get("variance_pct", 0) < -35]
    deduction = min(len(severe_underestimates) * 10, 40)
    feasibility_score = max(50, 100 - deduction)

    return {
        "total_budget": round(total_budget, 2),
        "items_count": len(items),
        "items": items,  # Persist every line; the UI limits its own visible preview.
        "stage_budgets": {k: round(v, 2) for k, v in stage_budgets.items()},
        "milestones": milestones,
        "materials": materials,
        "labour_rates": [],
        "rate_warnings": rate_warnings,
        "feasibility_score": feasibility_score,
        "summary": {
            "milestones_count": len(milestones),
            "materials_count": len(materials),
            "labour_rates_count": 0,
            "warnings_count": len(rate_warnings),
            "is_realistic": feasibility_score >= 70
        }
    }


def _parse_material_rates_sheet(df: pd.DataFrame) -> List[Dict[str, Any]]:
    df = df.dropna(how="all").dropna(axis=1, how="all")
    if df.empty:
        return []
    df = _promote_header_row(df, ["material", "rate", "unit", "category"])
    name_col = find_column(df, ["material", "item", "name", "description"])
    unit_col = find_column(df, ["unit", "uom"])
    rate_col = find_column(df, ["rate", "price", "cost"])
    cat_col = find_column(df, ["category", "type"])
    qty_col = find_column(df, ["qty", "quant", "allocated"])
    notes_col = find_column(df, ["note", "remark", "supplier"])
    if not name_col:
        return []

    results = []
    for _, row in df.iterrows():
        mat_name = str(row.get(name_col, "")).strip() if pd.notna(row.get(name_col)) else ""
        if not mat_name or mat_name.lower() in ("nan", "none", "material"):
            continue
        unit_price = _clean_float(row.get(rate_col)) if rate_col else 0.0
        alloc_qty = _clean_float(row.get(qty_col)) if qty_col else 0.0
        results.append({
            "name": mat_name,
            "unit": str(row.get(unit_col, "units")).strip() if unit_col and pd.notna(row.get(unit_col)) else "units",
            "unit_price": unit_price,
            "allocated_quantity": alloc_qty,
            "total_cost": round(unit_price * alloc_qty, 2),
            "category": str(row.get(cat_col, "General")).strip() if cat_col and pd.notna(row.get(cat_col)) else "General",
            "notes": str(row.get(notes_col, "")).strip() if notes_col and pd.notna(row.get(notes_col)) else "",
        })
    return results


def _parse_labour_rates_sheet(df: pd.DataFrame) -> List[Dict[str, Any]]:
    df = df.dropna(how="all").dropna(axis=1, how="all")
    if df.empty:
        return []
    df = _promote_header_row(df, ["trade", "role", "daily rate", "ot rate", "skill"])
    role_col = find_column(df, ["trade", "role", "position", "worker"])
    daily_col = find_column(df, ["dailyrate", "daily", "rate", "wage"])
    ot_col = find_column(df, ["otrate", "overtime", "ot"])
    skill_col = find_column(df, ["skill", "level"])
    supply_col = find_column(df, ["supply", "availability"])
    exp_col = find_column(df, ["experience", "minexp"])
    notes_col = find_column(df, ["note", "remark"])
    if not role_col:
        return []

    results = []
    for _, row in df.iterrows():
        role_name = str(row.get(role_col, "")).strip() if pd.notna(row.get(role_col)) else ""
        if not role_name or role_name.lower() in ("nan", "none", "trade / role", "trade"):
            continue
        results.append({
            "role": role_name,
            "daily_rate": _clean_float(row.get(daily_col)) if daily_col else 0.0,
            "ot_rate": _clean_float(row.get(ot_col)) if ot_col else 0.0,
            "skill_level": str(row.get(skill_col, "")).strip() if skill_col and pd.notna(row.get(skill_col)) else "",
            "supply": str(row.get(supply_col, "")).strip() if supply_col and pd.notna(row.get(supply_col)) else "",
            "min_experience": str(row.get(exp_col, "")).strip() if exp_col and pd.notna(row.get(exp_col)) else "",
            "notes": str(row.get(notes_col, "")).strip() if notes_col and pd.notna(row.get(notes_col)) else "",
        })
    return results


def parse_boq_file(file_bytes: bytes, filename: str) -> Dict[str, Any]:
    validate_spreadsheet(file_bytes, filename)
    fn = filename.lower()
    if fn.endswith(".csv"):
        # Attempt UTF-8, then fallback to latin1; handle messy CSVs gracefully
        try:
            df = pd.read_csv(io.BytesIO(file_bytes), encoding="utf-8", on_bad_lines="error", nrows=20001, keep_default_na=False)
        except Exception:
            try:
                df = pd.read_csv(io.BytesIO(file_bytes), encoding="latin1", on_bad_lines="error", nrows=20001, keep_default_na=False)
            except Exception as e:
                raise ValueError(f"Failed to parse CSV file: {e}")
        return parse_boq_dataframe(df)

    elif fn.endswith(".xlsx") or fn.endswith(".xls"):
        try:
            sheets: Dict[str, pd.DataFrame] = pd.read_excel(io.BytesIO(file_bytes), sheet_name=None, nrows=20001, keep_default_na=False)
        except Exception as e:
            raise ValueError(f"Failed to parse Excel file: {e}")

        if not sheets:
            raise ValueError("The uploaded Excel file contains no sheets.")

        # Locate main BOQ sheet, Material_Rates sheet, and Labour_Rates sheet
        sheet_names = list(sheets.keys())
        main_sheet_name = next(
            (s for s in sheet_names if "boq" in s.lower() or "template" in s.lower()),
            sheet_names[0],
        )
        result = parse_boq_dataframe(sheets[main_sheet_name])

        mat_sheet_name = next((s for s in sheet_names if "material" in s.lower()), None)
        if mat_sheet_name:
            sheet_materials = _parse_material_rates_sheet(sheets[mat_sheet_name])
            if sheet_materials:
                existing_by_name = {(m["name"].strip().lower(), m.get("unit", "units").strip().lower()): m for m in result.get("materials", [])}
                for sm in sheet_materials:
                    key = (sm["name"].strip().lower(), sm.get("unit", "units").strip().lower())
                    if key in existing_by_name:
                        if sm["unit_price"] > 0:
                            existing_by_name[key]["unit_price"] = sm["unit_price"]
                        if sm["allocated_quantity"] > 0:
                            existing_by_name[key]["allocated_quantity"] = sm["allocated_quantity"]
                    else:
                        existing_by_name[key] = sm
                result["materials"] = list(existing_by_name.values())

        lab_sheet_name = next((s for s in sheet_names if "labour" in s.lower() or "labor" in s.lower()), None)
        if lab_sheet_name:
            result["labour_rates"] = _parse_labour_rates_sheet(sheets[lab_sheet_name])

        result["summary"]["materials_count"] = len(result.get("materials", []))
        result["summary"]["labour_rates_count"] = len(result.get("labour_rates", []))
        return result
    else:
        raise ValueError("Unsupported file format. Please upload an Excel (.xlsx, .xls) or CSV file.")


def generate_blank_boq_xlsx() -> bytes:
    """
    Generates a clean ConstructFlow BOQ Excel (.xlsx) template with ONLY headers
    (no pre-filled phase rows or sample data) across 3 sheets:
      1. BOQ_Template
      2. Material_Rates
      3. Labour_Rates
    """
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    wb = openpyxl.Workbook()
    header_fill = PatternFill(start_color="EA580C", end_color="EA580C", fill_type="solid")
    title_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    sub_fill = PatternFill(start_color="FFF7ED", end_color="FFF7ED", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    title_font = Font(name="Calibri", size=13, bold=True, color="FFFFFF")
    sub_font = Font(name="Calibri", size=10, italic=True, color="9A3412")
    thin_border = Border(
        left=Side(style="thin", color="E2E8F0"),
        right=Side(style="thin", color="E2E8F0"),
        top=Side(style="thin", color="E2E8F0"),
        bottom=Side(style="thin", color="E2E8F0"),
    )

    # --- Sheet 1: BOQ_Template ---
    ws1 = wb.active
    ws1.title = "BOQ_Template"
    ws1.merge_cells("A1:M1")
    ws1["A1"] = "ConstructFlow — Bill of Quantities (BOQ) Template"
    ws1["A1"].font = title_font
    ws1["A1"].fill = title_fill
    ws1["A1"].alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws1.row_dimensions[1].height = 28

    ws1.merge_cells("A2:M2")
    ws1["A2"] = "Instructions: Enter your Phase / Milestone name and activities below. Leave blank rows empty. Total Cost auto-calculates (Qty * Rate)."
    ws1["A2"].font = sub_font
    ws1["A2"].fill = sub_fill
    ws1["A2"].alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws1.row_dimensions[2].height = 22

    boq_headers = [
        ("Activity ID", 12),
        ("Activity Name", 32),
        ("Phase / Milestone", 24),
        ("Duration (Days)", 15),
        ("Dependencies", 16),
        ("Work Category", 16),
        ("Unit", 10),
        ("Required Qty", 14),
        ("Unit Rate (LKR)", 16),
        ("Total Cost (LKR)", 18),
        ("Priority", 12),
        ("Deliverable", 22),
        ("Notes", 26),
    ]
    ws1.row_dimensions[3].height = 26
    for col_idx, (h_text, width) in enumerate(boq_headers, start=1):
        cell = ws1.cell(row=3, column=col_idx, value=h_text)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        col_letter = openpyxl.utils.get_column_letter(col_idx)
        ws1.column_dimensions[col_letter].width = width

    # Add 25 blank formatted rows with auto Total Cost formula (=H{r}*I{r})
    for r in range(4, 29):
        for c in range(1, len(boq_headers) + 1):
            cell = ws1.cell(row=r, column=c)
            cell.border = thin_border
            if c == 10:
                cell.value = f"=IF(AND(ISNUMBER(H{r}),ISNUMBER(I{r})),H{r}*I{r},\"\")"
                cell.number_format = "#,##0.00"
            elif c in (8, 9):
                cell.number_format = "#,##0.00"

    # --- Sheet 2: Material_Rates ---
    ws2 = wb.create_sheet("Material_Rates")
    ws2.merge_cells("A1:G1")
    ws2["A1"] = "ConstructFlow — Project Material Rates & Quantities"
    ws2["A1"].font = title_font
    ws2["A1"].fill = title_fill
    ws2["A1"].alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws2.row_dimensions[1].height = 28

    mat_headers = [
        ("Material", 30),
        ("Unit", 12),
        ("Rate (LKR)", 16),
        ("Allocated Qty", 15),
        ("Category", 18),
        ("Supplier Type", 20),
        ("Notes", 28),
    ]
    ws2.row_dimensions[2].height = 24
    for col_idx, (h_text, width) in enumerate(mat_headers, start=1):
        cell = ws2.cell(row=2, column=col_idx, value=h_text)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        ws2.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = width

    for r in range(3, 28):
        for c in range(1, len(mat_headers) + 1):
            ws2.cell(row=r, column=c).border = thin_border

    # --- Sheet 3: Labour_Rates ---
    ws3 = wb.create_sheet("Labour_Rates")
    ws3.merge_cells("A1:G1")
    ws3["A1"] = "ConstructFlow — Project Labour Rates"
    ws3["A1"].font = title_font
    ws3["A1"].fill = title_fill
    ws3["A1"].alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws3.row_dimensions[1].height = 28

    lab_headers = [
        ("Trade / Role", 28),
        ("Daily Rate (LKR)", 18),
        ("OT Rate (per hr)", 18),
        ("Skill Level", 16),
        ("Supply", 14),
        ("Min Experience", 16),
        ("Notes", 28),
    ]
    ws3.row_dimensions[2].height = 24
    for col_idx, (h_text, width) in enumerate(lab_headers, start=1):
        cell = ws3.cell(row=2, column=col_idx, value=h_text)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        ws3.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = width

    for r in range(3, 23):
        for c in range(1, len(lab_headers) + 1):
            ws3.cell(row=r, column=c).border = thin_border

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def get_sample_boq_csv() -> str:
    """Returns sample Sri Lankan construction BOQ CSV for quick testing."""
    return """Stage,Item Description,Unit,Quantity,Rate,Amount
Substructure & Foundation,"Site clearance and topsoil excavation",m3,150,850,127500
Substructure & Foundation,"Excavation for column footings in ordinary earth",m3,220,1200,264000
Substructure & Foundation,"Random rubble masonry foundation in 1:5 cement sand mortar",m3,85,18500,1572500
Substructure & Foundation,"Grade 25 concrete in footings and ground beams",m3,45,36000,1620000
Substructure & Foundation,"Tor steel reinforcement (12mm/16mm) in substructure",kg,3200,320,1024000
Superstructure & Frame,"Grade 25 ready mix concrete in columns and suspended floor slabs",m3,95,36000,3420000
Superstructure & Frame,"Tor steel reinforcement (10mm/12mm/16mm/20mm) in superstructure",kg,8500,320,2720000
Superstructure & Frame,"Plywood formwork to sides of columns and soffits of slabs",m2,420,1850,777000
Masonry & Partitions,"9 inch thick brick masonry in 1:5 cement sand mortar",m2,280,4800,1344000
Masonry & Partitions,"Cement blocks 4 inch thick in internal partition walls",m2,160,2800,448000
Finishes & Flooring,"16mm thick external plastering with cement sand",m2,540,1150,621000
Finishes & Flooring,"Porcelain floor tiling with adhesive and grout",m2,240,6500,1560000
Finishes & Flooring,"Internal skim coat and 2 coats of emulsion paint",m2,680,850,578000
Roofing & Structural Steel,"Structural steel roof trusses with primer and enamel paint",kg,1800,480,864000
Roofing & Structural Steel,"Zinc-aluminium roofing sheets 0.47mm with insulation",m2,220,3800,836000
MEP & Building Services,"Internal plumbing, cold water distribution and drainage pipes",Item,1,750000,750000
MEP & Building Services,"Electrical conduit wiring, distribution board and switches",Item,1,950000,950000
"""
