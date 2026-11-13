"""
ConstructFlow Smart BOQ Ingestion & Baseline Parser
Parses Excel (.xlsx, .xls) and CSV Bill of Quantities (BOQ),
extracts milestones, core materials, validates unit rates against CIDA / Sri Lankan market benchmarks,
and prepares project baselines.
"""
from typing import Dict, Any, List, Optional
import io
import re
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


def parse_boq_dataframe(df: pd.DataFrame) -> Dict[str, Any]:
    # Clean empty rows and columns
    df = df.dropna(how="all").dropna(axis=1, how="all")
    if df.empty:
        raise ValueError("The uploaded BOQ file contains no readable data.")

    # Find columns
    desc_col = find_column(df, ["desc", "item", "work", "particular", "activity", "name"])
    unit_col = find_column(df, ["unit", "uom", "measure"])
    qty_col = find_column(df, ["qty", "quant", "estqty", "volume"])
    rate_col = find_column(df, ["rate", "price", "unitprice", "costperunit", "lkrrate"])
    amount_col = find_column(df, ["amount", "total", "totalamount", "cost", "totalcost", "subtotal"])
    stage_col = find_column(df, ["stage", "section", "milestone", "category", "bill", "trade", "phase"])

    if not desc_col:
        # Fallback: take first string column
        text_cols = [c for c in df.columns if df[c].dtype == object]
        if text_cols:
            desc_col = text_cols[0]
        else:
            raise ValueError("Could not find an Item Description column in the BOQ file.")

    items: List[Dict[str, Any]] = []
    total_budget = 0.0
    stage_budgets: Dict[str, float] = {}
    extracted_materials_map: Dict[str, Dict[str, Any]] = {}
    rate_warnings: List[Dict[str, Any]] = []

    for _, row in df.iterrows():
        desc = str(row.get(desc_col, "")).strip()
        if not desc or desc.lower() in ("nan", "none", "total", "grand total", "subtotal"):
            continue

        # Quantity
        qty = 0.0
        if qty_col and pd.notna(row.get(qty_col)):
            try:
                cleaned_qty = re.sub(r"[^\d.]", "", str(row[qty_col]))
                qty = float(cleaned_qty) if cleaned_qty else 0.0
            except Exception:
                qty = 0.0

        # Rate
        rate = 0.0
        if rate_col and pd.notna(row.get(rate_col)):
            try:
                cleaned_rate = re.sub(r"[^\d.]", "", str(row[rate_col]))
                rate = float(cleaned_rate) if cleaned_rate else 0.0
            except Exception:
                rate = 0.0

        # Amount
        amount = 0.0
        if amount_col and pd.notna(row.get(amount_col)):
            try:
                cleaned_amount = re.sub(r"[^\d.]", "", str(row[amount_col]))
                amount = float(cleaned_amount) if cleaned_amount else 0.0
            except Exception:
                amount = 0.0

        # Auto compute amount if missing
        if amount <= 0.0 and qty > 0.0 and rate > 0.0:
            amount = qty * rate
        elif qty <= 0.0 and rate > 0.0 and amount > 0.0:
            qty = round(amount / rate, 2)
        elif rate <= 0.0 and qty > 0.0 and amount > 0.0:
            rate = round(amount / qty, 2)

        unit = str(row.get(unit_col, "")).strip() if unit_col and pd.notna(row.get(unit_col)) else "units"
        explicit_stage = str(row.get(stage_col, "")).strip() if stage_col and pd.notna(row.get(stage_col)) else None

        stage = classify_stage(desc, explicit_stage)
        stage_budgets[stage] = stage_budgets.get(stage, 0.0) + amount
        total_budget += amount

        item_dict = {
            "description": desc,
            "stage": stage,
            "unit": unit,
            "quantity": qty,
            "rate": rate,
            "amount": amount
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
            milestones.append({
                "title": st_name,
                "description": f"Phase allocated budget: Rs. {st_budget:,.2f} ({pct}% of total BOQ)",
                "allocated_budget": round(st_budget, 2),
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
        "items": items[:100],  # preview up to first 100 items
        "milestones": milestones,
        "materials": materials,
        "rate_warnings": rate_warnings,
        "feasibility_score": feasibility_score,
        "summary": {
            "milestones_count": len(milestones),
            "materials_count": len(materials),
            "warnings_count": len(rate_warnings),
            "is_realistic": feasibility_score >= 70
        }
    }


def parse_boq_file(file_bytes: bytes, filename: str) -> Dict[str, Any]:
    fn = filename.lower()
    if fn.endswith(".csv"):
        # Attempt UTF-8, then fallback to latin1; handle messy CSVs gracefully
        try:
            df = pd.read_csv(io.BytesIO(file_bytes), encoding="utf-8", on_bad_lines="skip")
        except Exception:
            try:
                df = pd.read_csv(io.BytesIO(file_bytes), encoding="latin1", on_bad_lines="skip")
            except Exception as e:
                raise ValueError(f"Failed to parse CSV file: {e}")
    elif fn.endswith(".xlsx") or fn.endswith(".xls"):
        try:
            df = pd.read_excel(io.BytesIO(file_bytes))
        except Exception as e:
            raise ValueError(f"Failed to parse Excel file: {e}")
    else:
        raise ValueError("Unsupported file format. Please upload an Excel (.xlsx, .xls) or CSV file.")

    return parse_boq_dataframe(df)


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
