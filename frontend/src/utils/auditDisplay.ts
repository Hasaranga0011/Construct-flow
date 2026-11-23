import { roleLabel } from './roles';

export const auditTableLabels: Record<string, string> = {
  projects: 'Projects', profiles: 'User profiles', attendance: 'Attendance', salary_slips: 'Salary slips',
  purchase_orders: 'Purchase orders', materials: 'Materials', material_requests: 'Material requests',
  project_expenses: 'Project expenses', milestones: 'Milestones', client_payment_schedule: 'Client payments',
  variation_orders: 'Scope variations', project_boq_revisions: 'BOQ revisions', project_boq_worker_rates: 'Worker pay rates',
  project_role_assignments: 'Project team assignments', site_workers: 'Worker assignments', site_manager_sites: 'Site manager assignments',
  pm_projects: 'Project manager assignments', sites: 'Sites', workers: 'Worker records', worker_details: 'Worker details',
  material_catalog: 'Material catalogue', attendance_reviews: 'Attendance reviews', delivery_receipts: 'Delivery receipts',
  estimations: 'Estimates', issues: 'Site issues', site_reports: 'Site reports', shared_documents: 'Shared documents',
  inventory_logs: 'Stock activity', milestone_media: 'Milestone attachments', milestone_notes: 'Milestone notes',
  project_locations: 'Project locations', site_materials: 'Site stock', cost_estimates: 'Cost estimates',
};
const fields: Record<string,string> = {
  contact_number: 'Contact number', full_name: 'Name', total_budget: 'Project budget', spent_cost: 'Actual spending',
  daily_rate: 'Daily pay rate', total_amount: 'Total amount', total_pay: 'Total pay', basic_pay: 'Basic pay',
  overtime_pay: 'Overtime pay', overtime_hours: 'Overtime hours', is_approved: 'Account approval', is_test: 'Test project',
  pm_id: 'Project manager', client_id: 'Client', supplier_id: 'Supplier', worker_id: 'Worker', user_id: 'User',
  project_id: 'Project', site_id: 'Site', material_id: 'Material', current_stock: 'Stock on hand',
  completion_percentage: 'Progress', boq_revision: 'BOQ version', unit_price: 'Unit price', quantity_ordered: 'Ordered quantity',
  quantity_received: 'Received quantity', received_by: 'Received by', reviewed_by: 'Reviewed by', approved_by: 'Approved by',
  boq_item_id: 'BOQ item', boq_stage: 'BOQ stage', role: 'Role', allocated_budget: 'Allocated budget',
  check_in_time: 'Check-in time', check_out_time: 'Check-out time', hours_worked: 'Hours worked',
};
export function auditFieldLabel(field: string) {
  const plain = field.replace(/_/g, ' ');
  return fields[field] || plain.charAt(0).toUpperCase() + plain.slice(1);
}
export function auditRoleLabel(role: string) {
  return ['service_role','database','anon','authenticated'].includes(role) ? 'System operation' : roleLabel(role);
}
export function auditHeading(table: string, action: string) {
  const singular: Record<string,string> = { profiles:'User profile', projects:'Project', salary_slips:'Salary slip', purchase_orders:'Purchase order', materials:'Material', attendance:'Attendance record' };
  const label = singular[table] || (auditTableLabels[table] || 'Record').replace(/s$/, '');
  return `${label} ${action === 'INSERT' ? 'created' : action === 'DELETE' ? 'deleted' : 'updated'}`;
}
export const auditChangedFields = (fields: string[]) => fields.filter(field => !['id','created_at','updated_at'].includes(field));
const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
const money = new Set(['total_budget','spent_cost','daily_rate','basic_pay','overtime_pay','deductions','total_amount','total_pay','amount','unit_price','total_price','allocated_budget']);
export function auditValue(field: string, value: unknown, names: Record<string,string> = {}): string {
  if (value === null || value === undefined) return 'Not set';
  if (value === '') return 'Empty';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (money.has(field)) return `Rs. ${value.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    return value.toLocaleString('en-GB',{maximumFractionDigits:4}) + (field === 'completion_percentage' ? '%' : '');
  }
  if (typeof value === 'string') {
    if (uuid.test(value)) return names[value] ? `${names[value]} (${value})` : value;
    if (field === 'role') return auditRoleLabel(value);
    if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(value) && !Number.isNaN(Date.parse(value))) {
      return new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Colombo',day:'numeric',month:'short',year:'numeric',...(/T/.test(value)?{hour:'2-digit',minute:'2-digit'}:{})});
    }
    return ['status','worker_type','rate_source','kind'].includes(field) ? value.replace(/_/g, ' ') : value;
  }
  return JSON.stringify(value, null, 2);
}
export function auditOmittedMessage(field: string): string {
  return /password|passwd|token|secret|credential|session|api_?key|private_?key|qr_?code/.test(field)
    ? 'Authentication credentials are not copied to audit history.'
    : 'Values were not captured in this older log. They cannot be recovered from the audit history.';
}
