from types import SimpleNamespace
import pytest
from pydantic import ValidationError
from fastapi import HTTPException
from api.routes import projects, site_reports, media


@pytest.mark.parametrize("patch", [
    {"date": "2026-02-30"}, {"date": "20261007"},
    {"work_completed": "   "}, {"workers_present_count": -1},
    {"workers_present_count": 2.5},
])
def test_invalid_site_reports_rejected(patch):
    payload = {"project_id": "p1", "date": "2026-10-07", "work_completed": "Concrete poured"}
    with pytest.raises(ValidationError):
        site_reports.SiteReportCreate(**(payload | patch))


def test_zero_workers_and_trimmed_report():
    payload = site_reports.SiteReportCreate(project_id="p1", date="2026-10-07", work_completed="  Inspection  ", workers_present_count=0)
    assert payload.workers_present_count == 0
    assert payload.work_completed == "Inspection"


@pytest.mark.parametrize("value", [-1, 101, float("nan"), float("inf")])
def test_invalid_milestone_percentages_rejected(value):
    with pytest.raises(ValidationError):
        projects.MilestoneUpdate(status="In Progress", completion_percentage=value)


class FakeClient:
    def __init__(self):
        self.table_name = ""
        self.operation = "select"
        self.updates = []
        self.filters = []
    def table(self, name):
        self.table_name = name
        self.operation = "select"
        return self
    def select(self, *args): return self
    def eq(self, key, value):
        self.filters.append((key, value))
        return self
    def update(self, payload):
        self.operation = "update"
        self.updates.append((self.table_name, payload))
        return self
    def execute(self):
        if self.table_name == "milestones":
            return SimpleNamespace(data=[{"id": "m1", "status": "In Progress"}])
        return SimpleNamespace(data=[])


def test_milestone_percentage_and_notes_reach_database(monkeypatch):
    client = FakeClient()
    monkeypatch.setattr(projects, "authorized_project_client", lambda *a, **kw: client)
    projects.update_milestone("p1", "m1", projects.MilestoneUpdate(status="In Progress", completion_percentage=42, description="Inspection complete"), {"id": "manager", "role": "site_manager"})
    assert client.updates[0] == ("milestones", {"status": "In Progress", "completion_percentage": 42, "description": "Inspection complete"})
    assert ("project_id", "p1") in client.filters
    assert ("id", "m1") in client.filters


def test_foreign_site_cannot_be_attached_to_report(monkeypatch):
    client = FakeClient()
    client.execute = lambda: SimpleNamespace(data=[{"id": "s2", "project_id": "p2", "site_manager_id": "another"}])
    monkeypatch.setattr(site_reports, "client_for_token", lambda token: client)
    payload = site_reports.SiteReportCreate(project_id="p1", site_id="s2", date="2026-10-07", work_completed="Inspection")
    with pytest.raises(HTTPException) as exc:
        site_reports.create_site_report(payload, {"id": "manager", "role": "site_manager", "token": "mock"})
    assert exc.value.status_code == 403


def test_site_report_with_assignment_id_resolves_safely(monkeypatch):
    client = FakeClient()
    client.inserts = []
    def fake_insert(payload):
        client.operation = "insert"
        client.inserts.append((client.table_name, payload))
        return client
    client.insert = fake_insert
    def fake_order(*args, **kwargs): return client
    client.order = fake_order

    def fake_execute():
        if client.table_name == "site_manager_sites":
            return SimpleNamespace(data=[{"id": "sms-1", "project_id": "p1", "site_manager_id": "manager"}])
        if client.table_name == "site_reports" and client.operation == "insert":
            return SimpleNamespace(data=[{"id": "report-1", **client.inserts[-1][1]}])
        if client.table_name == "projects":
            return SimpleNamespace(data=[{"id": "p1", "name": "Project 1", "pm_id": "pm-1"}])
        return SimpleNamespace(data=[])

    client.execute = fake_execute
    monkeypatch.setattr(site_reports, "client_for_token", lambda token: client)
    payload = site_reports.SiteReportCreate(project_id="p1", site_id="sms-1", date="2026-10-07", work_completed="Inspection")
    report = site_reports.create_site_report(payload, {"id": "manager", "role": "site_manager", "token": "mock"})
    assert report["id"] == "report-1"
    # site_id should be None when there is no record in physical sites table, avoiding FK error
    assert report["site_id"] is None



def test_upload_saves_to_storage_and_returns_url(monkeypatch):
    import asyncio
    from io import BytesIO
    from types import SimpleNamespace
    from starlette.datastructures import Headers, UploadFile
    captured = {}
    class FakeBucket:
        def upload(self, path, file, file_options=None):
            captured["path"] = path
            captured["file"] = file
            captured["file_options"] = file_options
            return SimpleNamespace(path=path)

        def get_public_url(self, path):
            return f"https://example.supabase.co/storage/v1/object/public/project-images/{path}"

    class FakeClient:
        def __init__(self):
            self.storage = SimpleNamespace(from_=lambda bucket: FakeBucket())

    monkeypatch.setattr(media, "_get_storage_client", lambda: FakeClient())
    upload = UploadFile(BytesIO(b"test-image"), filename="photo.png", headers=Headers({"content-type": "image/png"}))
    res = asyncio.run(media.upload_site_photo(file=upload, project_id="p1", caption="Inspection", site_id=None, current_user={"id": "manager"}))
    assert "p1" in captured["path"]
    assert captured["file"] == b"test-image"
    assert captured["file_options"]["content-type"] == "image/png"
    assert res["project_id"] == "p1"
    assert res["caption"] == "Inspection"
    assert res["storage_provider"] == "supabase"
    assert "https://example.supabase.co" in res["url"]

