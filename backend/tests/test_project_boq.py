import pytest
from core.boq_parser import parse_boq_file, get_sample_boq_csv
from api.routes import projects

def test_parse_boq_file_csv_extracts_budget_materials_and_milestones():
    csv_bytes = get_sample_boq_csv().encode("utf-8")
    result = parse_boq_file(csv_bytes, "project_boq.csv")

    assert result["total_budget"] > 0
    assert result["items_count"] > 10
    assert len(result["milestones"]) >= 4
    assert len(result["materials"]) >= 2
    assert result["feasibility_score"] >= 70

    # Verify milestones structure
    milestone_titles = [m["title"] for m in result["milestones"]]
    assert any("Substructure" in t for t in milestone_titles)
    assert any("Superstructure" in t for t in milestone_titles)

    # Verify materials structure
    materials_names = [m["name"] for m in result["materials"]]
    assert any("Ready Mix" in n or "Steel" in n or "Cement" in n for n in materials_names)

def test_boq_template_endpoint():
    data = projects.get_boq_template()
    assert "template" in data
    assert "Item Description" in data["template"]
    assert "Quantity" in data["template"]


def test_blank_xlsx_template_headers_only_and_multisheet_parse():
    import io
    import openpyxl
    from core.boq_parser import generate_blank_boq_xlsx

    xlsx_bytes = generate_blank_boq_xlsx()
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), data_only=False)
    assert wb.sheetnames == ["BOQ_Template", "Material_Rates", "Labour_Rates"]

    ws_boq = wb["BOQ_Template"]
    # Row 3 has headers; row 4 should have no activity name (blank template, no pre-filled phases)
    assert ws_boq.cell(row=3, column=2).value == "Activity Name"
    assert ws_boq.cell(row=3, column=3).value == "Phase / Milestone"
    assert ws_boq.cell(row=4, column=2).value is None

    # Fill one custom milestone activity, one material rate, and one labour rate
    ws_boq.cell(row=4, column=1, value="A1")
    ws_boq.cell(row=4, column=2, value="Foundation Excavation")
    ws_boq.cell(row=4, column=3, value="Substructure")
    ws_boq.cell(row=4, column=4, value=5)
    ws_boq.cell(row=4, column=7, value="Cu.m")
    ws_boq.cell(row=4, column=8, value=100)
    ws_boq.cell(row=4, column=9, value=3500)
    ws_boq.cell(row=4, column=10, value=350000)

    ws_mat = wb["Material_Rates"]
    ws_mat.cell(row=3, column=1, value="OPC Cement 50kg")
    ws_mat.cell(row=3, column=2, value="Bag")
    ws_mat.cell(row=3, column=3, value=2450)
    ws_mat.cell(row=3, column=4, value=200)
    ws_mat.cell(row=3, column=5, value="Structural")

    ws_lab = wb["Labour_Rates"]
    ws_lab.cell(row=3, column=1, value="Mason (Brickwork)")
    ws_lab.cell(row=3, column=2, value=4200)
    ws_lab.cell(row=3, column=3, value=600)
    ws_lab.cell(row=3, column=4, value="Skilled")

    out_buf = io.BytesIO()
    wb.save(out_buf)
    parsed = parse_boq_file(out_buf.getvalue(), "custom_boq.xlsx")

    assert parsed["total_budget"] == 350000.0
    assert len(parsed["milestones"]) == 1
    assert parsed["milestones"][0]["title"] == "Substructure"
    assert parsed["milestones"][0]["duration_days"] == 5
    assert any(m["name"] == "OPC Cement 50kg" and m["allocated_quantity"] == 200.0 for m in parsed["materials"])
    assert len(parsed["labour_rates"]) == 1
    assert parsed["labour_rates"][0]["role"] == "Mason (Brickwork)"
    assert parsed["labour_rates"][0]["daily_rate"] == 4200.0


def test_boq_template_xlsx_blank_and_sample():
    blank_resp = projects.get_boq_template(format="xlsx", kind="blank")
    assert blank_resp.headers["content-disposition"] == 'attachment; filename="ConstructFlow_Blank_BOQ_Template.xlsx"'

    sample_resp = projects.get_boq_template(format="xlsx", kind="sample")
    assert sample_resp.headers["content-disposition"] == 'attachment; filename="ConstructAI_BOQ_Template.xlsx"'

