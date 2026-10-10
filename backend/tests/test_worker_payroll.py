import pytest
from core.worker_payroll import calculate_payroll

def test_zero_days_and_missing_rate_are_explained():
    assert calculate_payroll([], None)["total_pay"] == 0
    with pytest.raises(ValueError, match="daily rate"):
        calculate_payroll([{"date":"2026-10-01", "status":"Present"}], None)

def test_payroll_counts_days_once_and_excludes_leave():
    rows = [{"date":"2026-10-01","status":"Present","hours_worked":10,"overtime_hours":2},
            {"date":"2026-10-02","status":"On Leave","hours_worked":0},
            {"date":"2026-10-01","status":"Present","hours_worked":1,"overtime_hours":0}]
    pay = calculate_payroll(rows, 3500)
    assert pay == {"total_days":1,"total_hours":11,"overtime_hours":2,"daily_rate":3500,"basic_pay":3500,"overtime_pay":1312.5,"deductions":0,"total_pay":4812.5}

def test_zero_rate_is_not_replaced_with_fabricated_wage():
    assert calculate_payroll([{"date":"2026-10-01","status":"Present","hours_worked":8}],0)["total_pay"] == 0
