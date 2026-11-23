"""Administrator-only, paginated access to transactional audit events."""
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from core.database import get_auth_client
from core.security import require_admin
from core.audit_labels import enrich_audit_events

router = APIRouter(prefix='/audit', tags=['Audit'], dependencies=[Depends(require_admin)])


@router.get('/')
def list_audit_events(request: Request, limit: int = Query(25, ge=1, le=100),
                      before_id: int | None = Query(None, ge=1),
                      action: str | None = Query(None, pattern='^(INSERT|UPDATE|DELETE)$'),
                      table: str | None = Query(None, pattern='^[a-z_]{1,64}$'),
                      actor_id: UUID | None = None, project_id: UUID | None = None,
                      since: datetime | None = None, until: datetime | None = None):
    # Treat dates without an offset as UTC; never compare aware and naive values.
    if since and since.tzinfo is None:
        since = since.replace(tzinfo=timezone.utc)
    if until and until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    if since and until and since > until:
        raise HTTPException(422, 'Start date must be before end date.')
    try:
        client = get_auth_client(request)
        query = client.table('audit_events').select('*').order('id', desc=True).limit(limit + 1)
        for column, value in [('action', action), ('table_name', table), ('actor_id', actor_id), ('project_id', project_id)]:
            if value is not None:
                query = query.eq(column, str(value))
        if before_id is not None:
            query = query.lt('id', before_id)
        if since is not None:
            query = query.gte('occurred_at', since.isoformat())
        if until is not None:
            query = query.lte('occurred_at', until.isoformat())
        rows = query.execute().data or []
        has_more = len(rows) > limit
        rows = rows[:limit]
        # bigint cursors stay exact in JavaScript even on very large histories.
        for row in rows:
            row['id'] = str(row['id'])
            row['transaction_id'] = str(row['transaction_id'])
        return {'events': enrich_audit_events(client, rows), 'next_cursor': rows[-1]['id'] if has_more else None}
    except HTTPException:
        raise
    except Exception as exc:
        code = str(getattr(exc, 'code', ''))
        if code in {'42P01', 'PGRST205'}:
            raise HTTPException(503, 'Audit history is not installed yet. Apply the audit database migration.') from exc
        raise HTTPException(503, 'Audit history could not be loaded. Please retry.') from exc
