"""Build the owner-run, atomic SQL activation bundle without database access."""
from pathlib import Path
import re

BACKEND = Path(__file__).resolve().parents[1]
MIGRATIONS = [
    "20261116_security_workflow_integrity.sql",
    "20261116_workflow_receipts.sql",
    "20261116_workflow_reviews.sql",
    "20261116_workflow_security_boundaries.sql",
    "20261116_workflow_z_milestones.sql",
    "20261116_workflow_zz_inquiries.sql",
    "20261116_workflow_zzz_project_payload.sql",
    "20261117_project_commercial_ui.sql",
    "20261117_role_flow_boundaries.sql",
    "20261117_boq_connected_workflow.sql",
]
parts = ["-- ConstructFlow workflow/UI activation. Run as owner after taking a backup.\n"
         "-- One transaction; failure rolls back all changes. No business rows are deleted.\nBEGIN;\n"]
for name in MIGRATIONS:
    source = (BACKEND / "migrations" / name).read_text(encoding="utf-8")
    source = re.sub(r"(?m)^(?:BEGIN|COMMIT);\s*$", "", source)
    parts.append(f"\n-- SOURCE: {name}\n{source}")
parts.append("\nNOTIFY pgrst, 'reload schema';\nCOMMIT;\n")
target = BACKEND / "reviews" / "APPLY_UI_WORKFLOW.sql"
target.write_text("\n".join(parts), encoding="utf-8")
print(f"Prepared {len(MIGRATIONS)} migrations in {target.name}")
