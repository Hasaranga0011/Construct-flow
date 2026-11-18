import { positiveQuantity, validReportDate } from './siteWorkflow';

export function validatePurchaseOrder(input: { projectId?: string | null; supplierId?: string | null; material?: string | null; quantity: string; unitPrice: string; expectedDate: string; unit: string }) {
  if (!input.projectId) return 'Choose a project.';
  if (!input.supplierId) return 'Choose a supplier assigned to this project.';
  if (!input.material?.trim()) return 'Choose or enter a material.';
  if (!positiveQuantity(input.quantity)) return 'Enter a quantity greater than zero.';
  if (!input.unitPrice.trim() || !Number.isFinite(Number(input.unitPrice)) || Number(input.unitPrice) < 0) return 'Enter a valid unit price of zero or more.';
  if (!Number.isFinite(Number(input.quantity) * Number(input.unitPrice))) return 'The order total is too large.';
  if (!input.unit.trim()) return 'Choose a unit.';
  if (!validReportDate(input.expectedDate)) return 'Enter a valid delivery date (YYYY-MM-DD).';
  return '';
}

export function newRequestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const value = Math.floor(Math.random() * 16);
    return (c === 'x' ? value : (value & 3) | 8).toString(16);
  });
}
