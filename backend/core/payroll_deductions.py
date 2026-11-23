from decimal import Decimal, ROUND_HALF_UP


def apply_deductions(pay: dict, deductions: list) -> dict:
    amounts=[Decimal(str(row['amount'])) for row in deductions]
    if any(not amount.is_finite() or amount<0 for amount in amounts):
        raise ValueError('Every deduction must be a non-negative finite amount')
    if any(amount != amount.quantize(Decimal('.01')) for amount in amounts):
        raise ValueError('Use at most two decimal places for deductions')
    total = sum(amounts, Decimal(0))
    gross = Decimal(str(pay['basic_pay'])) + Decimal(str(pay['overtime_pay']))
    if not total.is_finite() or total < 0 or total > gross:
        raise ValueError('Deductions must be between zero and gross pay')
    if any(Decimal(str(row['amount'])) > 0 and not str(row.get('reason') or '').strip() for row in deductions):
        raise ValueError('A reason is required for every deduction')
    return {**pay, 'deductions': float(total.quantize(Decimal('.01'), rounding=ROUND_HALF_UP)),
            'deduction_details': deductions, 'total_pay': float((gross-total).quantize(Decimal('.01'), rounding=ROUND_HALF_UP))}
