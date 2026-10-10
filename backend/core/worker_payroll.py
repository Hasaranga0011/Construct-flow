"""One calculation for worker estimates and generated salary slips."""
from decimal import Decimal, ROUND_HALF_UP

def calculate_payroll(records, daily_rate):
    present = [r for r in records if r.get("status") == "Present"]
    days = len({r["date"] for r in present})
    hours = sum(Decimal(str(r.get("hours_worked") or 0)) for r in present)
    overtime = sum(Decimal(str(r.get("overtime_hours") if r.get("overtime_hours") is not None else max(float(r.get("hours_worked") or 0) - 8, 0))) for r in present)
    if daily_rate is None and days:
        raise ValueError("Your daily rate has not been set. Please contact your Project Manager.")
    rate = Decimal(str(daily_rate or 0))
    base = rate * days
    extra = overtime * rate / Decimal(8) * Decimal("1.5")
    amount = lambda n: float(n.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    return {"total_days": days, "total_hours": float(hours), "overtime_hours": float(overtime),
            "daily_rate": float(rate) if daily_rate is not None else None, "basic_pay": amount(base), "overtime_pay": amount(extra),
            "deductions": 0, "total_pay": amount(base + extra)}
