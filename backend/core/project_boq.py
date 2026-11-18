"""Canonical, editable BOQ planning data. Never derive stock from planned quantities."""
from copy import deepcopy
from decimal import Decimal, InvalidOperation
import math
from uuid import UUID, uuid5, NAMESPACE_URL


def number(value, label):
    try:
        result = Decimal(str(value if value is not None else 0))
    except InvalidOperation as exc:
        raise ValueError(f"Invalid {label}") from exc
    if not result.is_finite() or result < 0:
        raise ValueError(f"{label} must be finite and nonnegative")
    parsed = float(result)
    if not math.isfinite(parsed):
        raise ValueError(f"{label} is too large")
    return parsed


def normalize_boq(data):
    if not isinstance(data, dict):
        raise ValueError("BOQ must be an object")
    result = deepcopy(data)
    declared_count = result.get('items_count')
    if isinstance(declared_count, (int, float)) and declared_count > len(result.get('items') or []):
        raise ValueError('This stored BOQ contains only a preview. Upload the original complete BOQ before revising its budget')
    seen = set()
    reference_names = set()
    occurrences = {}
    for group, name_field in (("items", "description"), ("materials", "name"), ("labour_rates", "trade")):
        rows = result.get(group) or []
        if not isinstance(rows, list) or len(rows) > (20000 if group == 'items' else 1000):
            raise ValueError(f"Invalid BOQ {group} list")
        result[group] = rows
        for row in rows:
            if not isinstance(row, dict):
                raise ValueError("Invalid BOQ row")
            name = str(row.get(name_field) or row.get("role") or row.get("worker_type") or row.get("name") or "").strip()
            if not name or len(name) > 1000:
                raise ValueError("Every BOQ row needs a description/name")
            row[name_field] = name
            if group != 'items':
                reference_key = (group, name.casefold(), str(row.get('unit') or ('day' if group == 'labour_rates' else 'units')).strip().casefold())
                if reference_key in reference_names:
                    raise ValueError('Duplicate material/trade and unit; consolidate its planned quantity or rate')
                reference_names.add(reference_key)
            # IDs survive edits. Fresh uploads match by explicit activity ID or exact row identity.
            identity = str(row.get("activity_id") or f"{name.casefold()}|{str(row.get('stage') or '').casefold()}|{str(row.get('unit') or '').casefold()}")
            if group == 'items' and not row.get('activity_id') and not row.get('id'):
                occurrences[identity] = occurrences.get(identity, 0) + 1
                identity += f"|{occurrences[identity]}"
            row["id"] = str(UUID(str(row["id"]))) if row.get("id") else str(uuid5(NAMESPACE_URL, f"constructflow/boq/{group}/{identity}"))
            key = (group, row["id"])
            if key in seen:
                raise ValueError("Duplicate BOQ row identity; use unique activity IDs")
            seen.add(key)
            if group == "items":
                for field in ("quantity", "rate", "amount", "duration_days"):
                    row[field] = number(row.get(field), field)
                # Preserve explicitly entered lump sums; recalculate when the editor requests it.
                if row.pop("recalculate_amount", False) or not row["amount"]:
                    row["amount"] = number(round(row["quantity"] * row["rate"], 2), 'item amount')
                if row['duration_days'] > 36500 or not row['duration_days'].is_integer():
                    raise ValueError('Duration must be whole days, up to 36500')
            elif group == "materials":
                row["allocated_quantity"] = number(row.get("allocated_quantity"), "material quantity")
                row["unit_price"] = number(row.get("unit_price"), "material rate")
            else:
                row["daily_rate"] = number(row.get("daily_rate", row.get("rate")), "labour daily rate")
                row['ot_rate'] = number(row.get('ot_rate'), 'overtime hourly rate')
                row["unit"] = str(row.get("unit") or "day")
    if result["items"]:
        result["total_budget"] = number(round(sum(row["amount"] for row in result["items"]), 2), 'BOQ total')
    else:
        result["total_budget"] = number(result.get("total_budget"), "BOQ total")
    if result["total_budget"] <= 0:
        raise ValueError("BOQ total must be positive")
    result["items_count"] = len(result["items"])
    stages = {}
    for row in result["items"]:
        stage = str(row.get("stage") or "General").strip()
        stages[stage] = round(stages.get(stage, 0) + row["amount"], 2)
    result["stage_budgets"] = stages
    milestones = result.get("milestones") or []
    for stage in stages:
        if not any(m.get('title') == stage for m in milestones):
            milestones.append({'title': stage, 'duration_days': max(1, int(sum(row.get('duration_days', 0) for row in result['items'] if (row.get('stage') or 'General') == stage)) or 21), 'status': 'Pending', 'completion_percentage': 0})
    result['milestones'] = milestones
    for milestone in milestones:
        if milestone.get("title") in stages:
            milestone["allocated_budget"] = stages[milestone["title"]]
    overrides = result.get("labour_overrides") or []
    if not isinstance(overrides, list) or len(overrides) > 1000:
        raise ValueError("Invalid worker override list")
    workers = set()
    for override in overrides:
        worker = str(UUID(str(override["worker_id"])))
        if worker in workers:
            raise ValueError("Duplicate worker rate override")
        workers.add(worker)
        override["worker_id"] = worker
        override["daily_rate"] = number(override.get("daily_rate"), "worker daily rate")
    result["labour_overrides"] = overrides
    return result


def resolve_boq_pay_rate(boq, profile):
    """Explicit per-project override, then exact daily-trade match, then worker agreement."""
    for row in (boq or {}).get("labour_overrides") or []:
        if row.get("worker_id") == profile.get("id"):
            return number(row["daily_rate"], "worker daily rate"), "BOQ project override"
    trade = str(profile.get("worker_type") or "").strip().casefold()
    matches = [row for row in (boq or {}).get("labour_rates") or []
               if trade and str(row.get("trade") or row.get("role") or row.get("worker_type") or "").strip().casefold() == trade
               and str(row.get("unit") or "day").strip().casefold() in {"day", "daily", "per day", "days"}]
    if len(matches) > 1:
        raise ValueError("Ambiguous BOQ trade rate; set an explicit project worker rate")
    if matches:
        return number(matches[0].get("daily_rate", matches[0].get("rate")), "BOQ daily rate"), "BOQ trade rate"
    return profile.get("daily_rate"), "Worker agreed rate"


def resolve_boq_pay_terms(boq, profile):
    rate, source = resolve_boq_pay_rate(boq, profile)
    trade = str(profile.get('worker_type') or '').strip().casefold()
    rows = (boq or {}).get('labour_overrides' if source == 'BOQ project override' else 'labour_rates') or []
    matched = [row for row in rows if (row.get('worker_id') == profile.get('id') if source == 'BOQ project override'
               else str(row.get('trade') or row.get('role') or '').strip().casefold() == trade and str(row.get('unit') or 'day').strip().casefold() in {'day','daily','per day','days'})] if source != 'Worker agreed rate' else []
    overtime = number(matched[0].get('ot_rate'), 'overtime hourly rate') if matched else 0
    return rate, overtime if overtime > 0 else None, source


def estimate_project_payroll(records, profile, plans_by_site):
    from core.worker_payroll import calculate_payroll
    groups = {}
    for row in records:
        plan = plans_by_site.get(row.get('site_id'), {})
        key = plan.get('project_id', 'unassigned')
        groups.setdefault(key, {'plan': plan.get('boq_data'), 'records': []})['records'].append(row)
    if not groups:
        return calculate_payroll(records, profile.get('daily_rate'))
    calculated = []
    for project_id, group in groups.items():
        daily, overtime, source = resolve_boq_pay_terms(group['plan'], profile)
        calculated.append({**calculate_payroll(group['records'], daily, overtime), 'project_id': project_id, 'rate_source': source})
    totals = {key: round(sum(row[key] for row in calculated), 2) for key in ['total_days','total_hours','overtime_hours','basic_pay','overtime_pay','deductions','total_pay']}
    rates = {row['daily_rate'] for row in calculated}
    return {**totals, 'daily_rate': next(iter(rates)) if len(rates) == 1 else None, 'project_estimates': calculated}
