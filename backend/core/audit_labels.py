"""Current display names for audit reads; immutable audit evidence is never rewritten."""
from uuid import UUID
import logging
import re
from urllib.parse import urlsplit, urlunsplit

LABEL_COLUMNS = {'profiles': 'full_name', 'projects': 'name', 'materials': 'name',
                 'material_catalog': 'name', 'milestones': 'title',
                 'purchase_orders': 'po_number', 'salary_slips': 'slip_number', 'issues': 'title'}
PROFILE_FIELDS = {'actor_id', 'user_id', 'worker_id', 'pm_id', 'client_id', 'supplier_id',
                  'received_by', 'paid_by', 'verified_by', 'reviewed_by', 'approved_by', 'logged_by'}
SECRET_FIELD = re.compile(r'password|passwd|secret|token|authorization|api_?key|credential|session|private_?key|access_?key|recovery|(^|_)otp($|_)|qr_?code|qr_?payload|(^|_)pwd($|_)', re.I)


def business_value(value):
    if isinstance(value, dict):
        return {key: business_value(item) for key, item in value.items() if not SECRET_FIELD.search(key)}
    if isinstance(value, list):
        return [business_value(item) for item in value]
    if isinstance(value, str):
        if value.lower().startswith('data:'):
            return '[File content not copied]'
        if value.lower().startswith(('https://','http://')):
            parts = urlsplit(value)
            return urlunsplit((parts.scheme, parts.netloc.rsplit('@',1)[-1], parts.path, '', ''))
    return value


def current_missing_values(client, rows):
    """Current context for legacy omissions, never presented as historical evidence."""
    groups = {}
    for row in rows:
        table, record = row.get('table_name'), uuid_value(row.get('record_id'))
        # Named entities have known id columns; don't query arbitrary historical table names.
        if table not in LABEL_COLUMNS or not record:
            continue
        missing = {field for field in row.get('changed_fields', [])
                   if re.fullmatch(r'[a-z][a-z0-9_]{0,62}',field) and not SECRET_FIELD.search(field)
                   and field not in (row.get('before_data') or {}) and field not in (row.get('after_data') or {})}
        if missing:
            group = groups.setdefault(table, {'ids':set(), 'fields':set()})
            group['ids'].add(record); group['fields'].update(missing)
    current = {}
    for table, group in groups.items():
        try:
            records = client.table(table).select(','.join(['id',*sorted(group['fields']-{'id'})])).in_('id',sorted(group['ids'])).execute().data or []
            current[table] = {str(item['id']):business_value(item) for item in records if item.get('id')}
        except Exception:
            logging.getLogger(__name__).warning('Current audit context unavailable for %s',table)
    for row in rows:
        record = current.get(row.get('table_name'),{}).get(str(row.get('record_id')),{})
        row['current_values'] = {field:record[field] for field in row.get('changed_fields',[]) if field in record and not SECRET_FIELD.search(field)
                                 and field not in (row.get('before_data') or {}) and field not in (row.get('after_data') or {})}


def uuid_value(value):
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def enrich_audit_events(client, rows):
    requested = {table: set() for table in LABEL_COLUMNS}
    for row in rows:
        if uid := uuid_value(row.get('actor_id')):
            requested['profiles'].add(uid)
        if project := uuid_value(row.get('project_id')):
            requested['projects'].add(project)
        if row.get('table_name') in requested and (record := uuid_value(row.get('record_id'))):
            requested[row['table_name']].add(record)
        for snapshot in (row.get('before_data'), row.get('after_data')):
            for field, value in (snapshot or {}).items():
                uid = uuid_value(value)
                if not uid:
                    continue
                target = ('profiles' if field in PROFILE_FIELDS else
                          {'project_id': 'projects', 'material_id': 'materials',
                           'milestone_id': 'milestones', 'order_id': 'purchase_orders'}.get(field))
                if target:
                    requested[target].add(uid)
    labels = {table: {} for table in requested}
    for table, ids in requested.items():
        column = LABEL_COLUMNS[table]
        ids = sorted(ids)
        for offset in range(0, len(ids), 200):
            try:
                people = client.table(table).select(f'id,{column}').in_('id', ids[offset:offset+200]).execute().data or []
                for item in people:
                    if item.get('id') and isinstance(item.get(column), str) and item[column].strip():
                        labels[table][str(item['id'])] = item[column].strip()[:200]
            except Exception:
                # Missing/deleted/legacy records must not hide the immutable event.
                logging.getLogger(__name__).warning('Audit display-name lookup unavailable for %s', table)
    references = {key: value for names in labels.values() for key, value in names.items()}
    for row in rows:
        row['actor_name'] = labels['profiles'].get(str(row.get('actor_id')))
        row['project_name'] = labels['projects'].get(str(row.get('project_id')))
        row['record_name'] = labels.get(row.get('table_name'), {}).get(str(row.get('record_id')))
        # Only include reference labels actually used in this event.
        ids = {str(value) for snapshot in (row.get('before_data'), row.get('after_data')) for value in (snapshot or {}).values() if uuid_value(value)}
        row['reference_names'] = {key: references[key] for key in ids if key in references}
    current_missing_values(client, rows)
    return rows
