from fastapi import APIRouter, HTTPException, Request, Depends, Query, Response
from core.database import get_auth_client
from core.security import require_manager_or_admin, get_current_user, normalize_role
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from .reports_export import (
    generate_pdf_report,
    generate_excel_report,
    generate_csv_report,
    generate_project_zip,
    format_lkr,
    format_date_str,
    COLOMBO_TZ
)

router = APIRouter(
    prefix="/reports",
    tags=["Reports"],
    dependencies=[Depends(require_manager_or_admin)]
)

def _report_rows(client, table: str, columns: str = "*") -> List[Dict[str, Any]]:
    """Read all visible rows respecting user's RLS scope."""
    rows = []
    page_size = 500
    while True:
        try:
            page = (client.table(table).select(columns).order("id")
                    .range(len(rows), len(rows) + page_size - 1).execute()).data or []
            rows.extend(page)
            if len(page) < page_size:
                return rows
        except Exception:
            return rows

def _parse_colombo_date(date_str: str, is_end: bool = False) -> Optional[datetime]:
    """Parse YYYY-MM-DD string into UTC datetime boundary based on Asia/Colombo midnight."""
    if not date_str:
        return None
    try:
        parts = date_str.strip().split("-")
        if len(parts) != 3:
            return None
        year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
        if is_end:
            local_dt = datetime(year, month, day, 23, 59, 59, 999999, tzinfo=COLOMBO_TZ)
        else:
            local_dt = datetime(year, month, day, 0, 0, 0, 0, tzinfo=COLOMBO_TZ)
        return local_dt.astimezone(timezone.utc)
    except Exception:
        return None

def _is_in_date_range(row_dt_val: Any, dt_from: Optional[datetime], dt_to: Optional[datetime]) -> bool:
    """Check if date or ISO timestamp is within [dt_from, dt_to] inclusive."""
    if not dt_from and not dt_to:
        return True
    if not row_dt_val:
        return False
    try:
        if isinstance(row_dt_val, str):
            clean = row_dt_val.replace("Z", "+00:00")
            if "T" in clean:
                dt = datetime.fromisoformat(clean)
            else:
                parts = clean.split("-")
                dt = datetime(int(parts[0]), int(parts[1]), int(parts[2]), 12, 0, 0, tzinfo=timezone.utc)
        elif isinstance(row_dt_val, datetime):
            dt = row_dt_val
        else:
            return False

        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)

        if dt_from and dt < dt_from:
            return False
        if dt_to and dt > dt_to:
            return False
        return True
    except Exception:
        return False


def _verify_pm_project_access(current_user: dict, requested_project_ids: List[str], client) -> None:
    """Verify that a PM only accesses their assigned projects."""
    role = normalize_role(current_user.get("role"))
    if role == "super_admin":
        return

    pm_id = current_user.get("id")
    # Fetch projects assigned to this PM
    res = client.table("projects").select("id").eq("pm_id", pm_id).execute()
    assigned = {p["id"] for p in (res.data or [])}

    for pid in requested_project_ids:
        if pid and pid not in assigned:
            raise HTTPException(
                status_code=403,
                detail=f"You are not authorized to view reports for project {pid}. Only your assigned projects are accessible."
            )


@router.get("/management")
def get_management_report(
    request: Request,
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    projects: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: Optional[dict] = Depends(get_current_user),
):
    client = get_auth_client(request)
    try:
        if not current_user or not isinstance(current_user, dict):
            current_user = {"role": "super_admin", "id": "admin"}

        from_date_str = from_date if isinstance(from_date, str) else None
        to_date_str = to_date if isinstance(to_date, str) else None
        status_str = status if isinstance(status, str) else None

        if isinstance(projects, str):
            req_project_ids = [p.strip() for p in projects.split(",") if p.strip()]
        elif isinstance(projects, list):
            req_project_ids = [str(p).strip() for p in projects if str(p).strip()]
        else:
            req_project_ids = []

        _verify_pm_project_access(current_user, req_project_ids, client)

        dt_from = _parse_colombo_date(from_date_str, is_end=False)
        dt_to = _parse_colombo_date(to_date_str, is_end=True)

        all_projects = _report_rows(client, "projects")
        all_materials = _report_rows(client, "materials")
        all_orders = _report_rows(client, "purchase_orders")
        all_payroll = _report_rows(client, "salary_slips")
        all_people = _report_rows(client, "profiles", "id, full_name")

        all_expenses = []
        all_attendance = []
        all_issues = []

        role = normalize_role(current_user.get("role"))
        if role == "pm" and not req_project_ids:
            # Scope to PM projects automatically
            pm_id = current_user.get("id")
            all_projects = [p for p in all_projects if p.get("pm_id") == pm_id]
        elif req_project_ids:
            all_projects = [p for p in all_projects if p.get("id") in req_project_ids]

        allowed_ids = {p["id"] for p in all_projects}

        # Filter by project access
        if allowed_ids:
            all_materials = [m for m in all_materials if m.get("project_id") in allowed_ids]
            all_orders = [o for o in all_orders if o.get("project_id") in allowed_ids]
            all_payroll = [s for s in all_payroll if not s.get("project_id") or s.get("project_id") in allowed_ids]
            all_expenses = [e for e in all_expenses if e.get("project_id") in allowed_ids]
            all_attendance = [a for a in all_attendance if a.get("project_id") in allowed_ids]
            all_issues = [r for r in all_issues if r.get("project_id") in allowed_ids]

        # Filter by date boundaries
        if dt_from or dt_to:
            all_orders = [o for o in all_orders if _is_in_date_range(o.get("created_at") or o.get("expected_date"), dt_from, dt_to)]
            all_payroll = [p for p in all_payroll if _is_in_date_range(p.get("period_start") or p.get("created_at"), dt_from, dt_to)]
            all_expenses = [e for e in all_expenses if _is_in_date_range(e.get("expense_date") or e.get("created_at"), dt_from, dt_to)]
            all_attendance = [a for a in all_attendance if _is_in_date_range(a.get("date") or a.get("check_in_time"), dt_from, dt_to)]
            all_issues = [i for i in all_issues if _is_in_date_range(i.get("created_at") or i.get("date"), dt_from, dt_to)]

        # Filter by status if provided
        if status_str and status_str.lower() != "all":
            all_projects = [p for p in all_projects if str(p.get("status") or "").lower() == status_str.lower()]
            all_orders = [o for o in all_orders if str(o.get("status") or "").lower() == status_str.lower()]
            all_payroll = [p for p in all_payroll if str(p.get("status") or "").lower() == status_str.lower()]

        result = {
            "projects": all_projects,
            "materials": all_materials,
            "orders": all_orders,
            "payroll": all_payroll,
            "expenses": all_expenses,
            "attendance": all_attendance,
            "issues": all_issues,
            "people": all_people,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "filters_applied": {
                "from_date": from_date_str,
                "to_date": to_date_str,
                "projects": req_project_ids,
                "status": status_str,
            }
        }
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Unable to load management reports. Please retry.") from exc


@router.get("/projects")
def get_projects_report(request: Request, current_user: Optional[dict] = Depends(get_current_user)):
    return get_management_report(request, current_user=current_user)


@router.get("/materials")
def get_materials_report(request: Request, current_user: Optional[dict] = Depends(get_current_user)):
    return get_management_report(request, current_user=current_user)


@router.get("/payroll")
def get_payroll_report(request: Request, current_user: Optional[dict] = Depends(get_current_user)):
    return get_management_report(request, current_user=current_user)


@router.get("/export")
def export_reports(
    request: Request,
    report_type: str = Query("overview"),
    format: str = Query("pdf"),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    projects: Optional[str] = Query(None),
    breakdown: str = Query("per_project"),
    zip_format: str = Query("pdf"),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """
    Server-generated export:
    Produces PDF, Excel (.xlsx), CSV, and multi-project ZIP files.
    """
    client = get_auth_client(request)
    
    # Check authorization
    req_project_ids = [p.strip() for p in projects.split(",") if p.strip()] if projects else []
    _verify_pm_project_access(current_user, req_project_ids, client)

    # Fetch filtered data
    data = get_management_report(
        request=request,
        from_date=from_date,
        to_date=to_date,
        projects=projects,
        status=status,
        search=search,
        current_user=current_user,
    )

    projects_list = data.get("projects", [])
    project_map = {p["id"]: p.get("name", f"Project {p['id'][:8]}") for p in projects_list}

    # Build human-readable filter description
    date_part = f"{format_date_str(from_date)} to {format_date_str(to_date)}" if from_date or to_date else "All dates"
    proj_part = f"{len(req_project_ids)} project(s) selected" if req_project_ids else "All projects"
    filters_desc = f"Period: {date_part} | Projects: {proj_part} | Scope: {breakdown}"

    # Build Project Sections according to report_type
    sections: List[Dict[str, Any]] = []
    summary_metrics: Dict[str, Any] = {}

    if report_type == "overview" or report_type == "projects":
        title = "Project Performance & Financial Summary"
        total_budget = sum(float(p.get("total_budget") or 0) for p in projects_list)
        total_spent = sum(float(p.get("spent_cost") or 0) for p in projects_list)
        summary_metrics = {
            "Total Projects": len(projects_list),
            "Total Portfolio Budget": format_lkr(total_budget),
            "Total Recorded Spend": format_lkr(total_spent),
            "Remaining Balance": format_lkr(total_budget - total_spent),
        }

        if breakdown == "combined":
            headers = ["Project Name", "Status", "Budget (LKR)", "Spent (LKR)", "Remaining (LKR)", "Planned Finish"]
            rows = []
            for p in projects_list:
                b = float(p.get("total_budget") or 0)
                s = float(p.get("spent_cost") or 0)
                rows.append([
                    p.get("name", "—"),
                    p.get("status", "—"),
                    b,
                    s,
                    b - s,
                    format_date_str(p.get("end_date")),
                ])
            subtotals = ["Total Combined", "—", total_budget, total_spent, total_budget - total_spent, "—"]
            sections.append({
                "project_name": "All Projects Combined",
                "headers": headers,
                "rows": rows,
                "subtotals": subtotals,
                "currency_cols": [2, 3, 4],
            })
        else:
            for p in projects_list:
                b = float(p.get("total_budget") or 0)
                s = float(p.get("spent_cost") or 0)
                headers = ["Metric / Detail", "Value"]
                rows = [
                    ["Project Status", p.get("status", "—")],
                    ["Location", p.get("location", "—")],
                    ["Start Date", format_date_str(p.get("start_date"))],
                    ["Planned Finish", format_date_str(p.get("end_date"))],
                    ["Total Budget", b],
                    ["Recorded Spend", s],
                    ["Remaining Balance", b - s],
                ]
                sections.append({
                    "project_name": p.get("name", f"Project {p['id'][:8]}"),
                    "headers": headers,
                    "rows": rows,
                    "currency_cols": [1],
                })

    elif report_type == "materials":
        title = "Materials Inventory & Procurement Report"
        materials = data.get("materials", [])
        orders = data.get("orders", [])
        summary_metrics = {
            "Total Stock Items": len(materials),
            "Purchase Orders": len(orders),
            "Open Orders": sum(1 for o in orders if str(o.get("status") or "").lower() not in ("delivered", "received", "cancelled")),
        }

        if breakdown == "combined":
            headers = ["Material", "Project", "Quantity / Stock", "Status", "Unit"]
            rows = [
                [m.get("name", "—"), project_map.get(m.get("project_id"), "—"), m.get("quantity", "—"), m.get("status", "—"), m.get("unit", "units")]
                for m in materials
            ]
            sections.append({
                "project_name": "Inventory (All Projects)",
                "headers": headers,
                "rows": rows,
            })
            po_headers = ["PO Number", "Project", "Supplier", "Status", "Total Amount (LKR)", "Expected Delivery"]
            po_rows = [
                [o.get("po_number", "—"), project_map.get(o.get("project_id"), "—"), o.get("supplier_name", "—"), o.get("status", "—"), float(o.get("total_amount") or 0), format_date_str(o.get("expected_date"))]
                for o in orders
            ]
            sections.append({
                "project_name": "Purchase Orders (All Projects)",
                "headers": po_headers,
                "rows": po_rows,
                "currency_cols": [4],
            })
        else:
            for p in projects_list:
                p_materials = [m for m in materials if m.get("project_id") == p["id"]]
                headers = ["Material", "Quantity", "Stock Level", "Status"]
                rows = [
                    [m.get("name", "—"), m.get("quantity", "—"), f"{m.get('stock_level', 0)}%", m.get("status", "—")]
                    for m in p_materials
                ]
                sections.append({
                    "project_name": p.get("name", f"Project {p['id'][:8]}"),
                    "headers": headers,
                    "rows": rows,
                })

    elif report_type == "payroll":
        title = "Payroll & Workforce Cost Report"
        slips = data.get("payroll", [])
        total_p = sum(float(s.get("net_pay") or s.get("total_amount") or 0) for s in slips)
        summary_metrics = {
            "Total Slips": len(slips),
            "Total Payroll": format_lkr(total_p),
            "Paid Slips": sum(1 for s in slips if str(s.get("status") or "").lower() == "paid"),
            "Pending Slips": sum(1 for s in slips if str(s.get("status") or "").lower() == "pending"),
        }

        headers = ["Worker ID", "Project", "Period Start", "Period End", "Status", "Amount (LKR)"]
        rows = [
            [
                s.get("worker_id", "—"),
                project_map.get(s.get("project_id"), "General"),
                format_date_str(s.get("period_start")),
                format_date_str(s.get("period_end")),
                s.get("status", "—"),
                float(s.get("net_pay") or s.get("total_amount") or 0),
            ]
            for s in slips
        ]
        sections.append({
            "project_name": "Salary Slips",
            "headers": headers,
            "rows": rows,
            "subtotals": ["Total", "—", "—", "—", "—", total_p],
            "currency_cols": [5],
        })

    else:
        title = f"{report_type.capitalize()} Management Report"
        headers = ["Project", "Status", "Budget (LKR)", "Recorded Spend (LKR)"]
        rows = [
            [p.get("name", "—"), p.get("status", "—"), float(p.get("total_budget") or 0), float(p.get("spent_cost") or 0)]
            for p in projects_list
        ]
        sections.append({
            "project_name": "Summary Register",
            "headers": headers,
            "rows": rows,
            "currency_cols": [2, 3],
        })

    # Generate format output
    filename_base = f"ConstructFlow_{report_type}_{datetime.now(COLOMBO_TZ).strftime('%Y%m%d_%H%M')}"

    if format == "pdf":
        file_bytes = generate_pdf_report(title, filters_desc, sections, {"metrics": summary_metrics})
        return Response(
            content=file_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.pdf"'}
        )
    elif format == "xlsx":
        file_bytes = generate_excel_report(title, filters_desc, sections, {"metrics": summary_metrics})
        return Response(
            content=file_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.xlsx"'}
        )
    elif format == "csv":
        file_bytes = generate_csv_report(title, filters_desc, sections)
        return Response(
            content=file_bytes,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.csv"'}
        )
    elif format == "zip":
        file_bytes = generate_project_zip(title, filters_desc, sections, format_type=zip_format)
        return Response(
            content=file_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}_per_project.zip"'}
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format '{format}'. Use pdf, xlsx, csv, or zip.")
