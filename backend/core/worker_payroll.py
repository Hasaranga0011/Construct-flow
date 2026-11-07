"""One calculation for worker estimates and generated salary slips."""
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP


def _is_present(record: dict) -> bool:
    status = record.get("status")
    if status is not None:
        return status == "Present"
    return bool(
        record.get("check_in_time")
        or record.get("check_out_time")
        or (record.get("hours_worked") is not None and float(record.get("hours_worked") or 0) > 0)
        or record.get("date")
    )


def _record_hours_and_overtime(record: dict) -> tuple[Decimal, Decimal]:
    ci = record.get("check_in_time")
    co = record.get("check_out_time")
    if ci and co:
        try:
            start = datetime.fromisoformat(str(ci).replace("Z", "+00:00"))
            end = datetime.fromisoformat(str(co).replace("Z", "+00:00"))
            if end >= start:
                worked_mins = max(0, round((end - start).total_seconds() / 60.0))
                ot_mins = max(0, worked_mins - 480)
                return Decimal(worked_mins) / Decimal(60), Decimal(ot_mins) / Decimal(60)
        except Exception:
            pass

    hw = Decimal(str(record.get("hours_worked") or 0))
    if record.get("overtime_hours") is not None:
        ot = Decimal(str(record.get("overtime_hours") or 0))
    else:
        ot = max(hw - Decimal(8), Decimal(0))
    return hw, ot


def calculate_payroll(records, daily_rate):
    present = [r for r in (records or []) if _is_present(r)]
    days = len({r["date"] for r in present if r.get("date")})
    pairs = [_record_hours_and_overtime(r) for r in present]
    hours = sum((p[0] for p in pairs), Decimal(0))
    overtime = sum((p[1] for p in pairs), Decimal(0))
    if daily_rate is None and days:
        raise ValueError("Your daily rate has not been set. Please contact your Project Manager.")
    rate = Decimal(str(daily_rate or 0))
    base = rate * days
    extra = overtime * rate / Decimal(8) * Decimal("1.5")
    amount = lambda n: float(n.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    hours_num = lambda n: float(n.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))
    return {
        "total_days": days,
        "total_hours": hours_num(hours),
        "overtime_hours": hours_num(overtime),
        "daily_rate": float(rate) if daily_rate is not None else None,
        "basic_pay": amount(base),
        "overtime_pay": amount(extra),
        "deductions": 0,
        "total_pay": amount(base + extra),
    }

