from copy import deepcopy
import pytest
from core.project_boq import normalize_boq, resolve_boq_pay_rate
from core.boq_parser import parse_boq_file


def fixture():
    return {"items": [{"activity_id": "A1", "description": "Foundation", "stage": "Base", "quantity": 2, "rate": 100, "amount": 200}],
            "materials": [{"name": "Cement", "unit": "bags", "allocated_quantity": 3, "unit_price": 20}],
            "labour_rates": [{"role": "Mason", "daily_rate": 4500}], "milestones": [{"title": "Base"}]}


def test_ids_survive_edit_and_sheet_amounts_are_not_double_counted():
    original = fixture()
    normalized = normalize_boq(original)
    assert normalized["total_budget"] == 200
    assert normalized["milestones"][0]["allocated_budget"] == 200
    assert "id" not in original["items"][0]
    edited = deepcopy(normalized)
    edited["items"][0].update(description="Edited foundation", quantity=5, recalculate_amount=True)
    updated = normalize_boq(edited)
    assert updated["items"][0]["id"] == normalized["items"][0]["id"]
    assert updated["total_budget"] == 500


@pytest.mark.parametrize("invalid", [-1, float("nan"), float("inf"), "bad"])
def test_invalid_rates_rejected(invalid):
    data = fixture()
    data["materials"][0]["unit_price"] = invalid
    with pytest.raises(ValueError):
        normalize_boq(data)


def test_parser_keeps_more_than_one_hundred_lines():
    csv = "Item Description,Quantity,Rate,Amount\n" + "\n".join(f"Task {i},1,10,10" for i in range(150))
    parsed = normalize_boq(parse_boq_file(csv.encode(), "all.csv"))
    assert len(parsed["items"]) == 150
    assert parsed["total_budget"] == 1500


def test_legacy_preview_cannot_silently_reduce_the_project_baseline():
    data = fixture()
    data['items_count'] = 150
    with pytest.raises(ValueError, match='original complete BOQ'):
        normalize_boq(data)


@pytest.mark.parametrize('value', ['-5', '(5)', 'Infinity', 'NaN', 'not-a-number'])
def test_uploaded_numbers_cannot_be_silently_changed_to_positive_or_zero(value):
    csv = f'Item Description,Quantity,Rate,Amount\nQA item,{value},10,100'
    with pytest.raises(ValueError):
        parse_boq_file(csv.encode(), 'invalid.csv')


def test_currency_and_scientific_notation_keep_their_actual_values():
    csv = 'Item Description,Quantity,Rate,Amount\nQA item,1e3,"Rs. 3,500.00","LKR 3,500,000.00"'
    data = parse_boq_file(csv.encode(), 'formatted.csv')
    assert data['items'][0]['quantity'] == 1000
    assert data['items'][0]['rate'] == 3500
    assert data['total_budget'] == 3500000


def test_project_trade_rate_and_explicit_worker_override():
    data = normalize_boq(fixture())
    worker = {"id": "00000000-0000-0000-0000-000000000001", "worker_type": " mason ", "daily_rate": 3500}
    assert resolve_boq_pay_rate(data, worker) == (4500, "BOQ trade rate")
    data["labour_overrides"] = [{"worker_id": worker["id"], "daily_rate": 5000}]
    assert resolve_boq_pay_rate(data, worker) == (5000, "BOQ project override")
    assert resolve_boq_pay_rate(data, {**worker, "id": "other", "worker_type": "Driver"}) == (3500, "Worker agreed rate")


def test_hourly_rate_never_used_as_daily_pay_and_ambiguous_match_rejected():
    worker = {"worker_type": "Mason", "daily_rate": 3500}
    assert resolve_boq_pay_rate({"labour_rates": [{"trade": "Mason", "unit": "hour", "daily_rate": 500}]}, worker)[0] == 3500
    with pytest.raises(ValueError, match="Ambiguous"):
        resolve_boq_pay_rate({"labour_rates": [{"trade": "Mason", "daily_rate": 4000}, {"trade": "Mason", "daily_rate": 5000}]}, worker)


def test_boq_overtime_and_worker_preview_match_salary_generation():
    from core.project_boq import resolve_boq_pay_terms, estimate_project_payroll
    from core.worker_payroll import calculate_payroll
    plan = normalize_boq(fixture())
    plan['labour_rates'][0]['ot_rate'] = 800
    profile = {'id': 'worker', 'worker_type': 'Mason', 'daily_rate': 3500}
    records = [{'date': '2026-11-01', 'site_id': 'site1', 'status': 'Present', 'hours_worked': 10, 'overtime_hours': 2}]
    daily, ot, source = resolve_boq_pay_terms(plan, profile)
    generated = calculate_payroll(records, daily, ot)
    preview = estimate_project_payroll(records, profile, {'site1': {'project_id': 'p1', 'boq_data': plan}})
    assert generated['total_pay'] == 6100
    assert preview['total_pay'] == generated['total_pay']
    assert preview['project_estimates'][0]['rate_source'] == 'BOQ trade rate'


@pytest.mark.parametrize('role', ['worker', 'supplier', 'client', 'site_manager'])
def test_boq_write_api_rejects_other_roles_before_database_access(role, monkeypatch):
    from fastapi.testclient import TestClient
    from main import app
    from core.security import get_current_user
    from api.routes import boq
    monkeypatch.setattr(boq, 'client_for_token', lambda *_: pytest.fail('Unauthorized database access'))
    app.dependency_overrides[get_current_user] = lambda: {'id': 'worker', 'role': role, 'token': 'fixture'}
    try:
        with TestClient(app) as client:
            response = client.put('/api/boq/00000000-0000-0000-0000-000000000001', json={'boq_data': fixture(), 'expected_revision': 1, 'reason': 'Unauthorized change'})
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()
