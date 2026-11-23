/** Display normalization only; persisted workflow states are never rewritten. */
export function statusDisplay(status:string|null|undefined) {
 const raw=status?.trim();
 if(!raw)return 'Not recorded';
 const value=raw.replace(/[_-]+/g,' ').replace(/\s+/g,' ').toLowerCase();
 const names:Record<string,string>={
  active:'Active','in progress':'In progress',pending:'Pending','pending delivery':'Pending delivery',
  'pending approval':'Pending approval',approved:'Approved',rejected:'Rejected',completed:'Completed',
  paid:'Paid',unpaid:'Unpaid',received:'Received',delivered:'Delivered',confirmed:'Confirmed',
  cancelled:'Cancelled',canceled:'Cancelled',draft:'Draft',generated:'Generated',planning:'Planning',
  open:'Open',resolved:'Resolved',closed:'Closed',overdue:'Overdue',present:'Present',absent:'Absent',
  'in stock':'In stock','out of stock':'Out of stock','low stock':'Low stock','on leave':'On leave',
  'checked in':'Checked in','checked out':'Checked out','on site':'On site','not started':'Not started',
  'check out missing':'Check-out missing','on hold':'On hold',archived:'Archived',suggested:'Suggested',high:'High',critical:'Critical',
 };
 return names[value]||raw;
}
export function progressDisplay(value:unknown):number {
 const numeric=Number(value);
 return Number.isFinite(numeric)?Math.round(Math.min(100,Math.max(0,numeric))):0;
}
