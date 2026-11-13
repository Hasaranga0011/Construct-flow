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
