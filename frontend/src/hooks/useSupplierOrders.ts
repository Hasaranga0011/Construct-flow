import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

/**
 * Single source of truth for everything in the Supplier portal.
 *
 * Every widget (stat cards, Projects I Supply, Incoming POs, Pending Deliveries,
 * Late Deliveries, Deliveries/Orders filter tabs, search suggestions) derives its
 * data from the ONE list returned here, so they can never disagree with each other.
 *
 * - Scoped to `purchase_orders.supplier_id = auth user id` (plus RLS on the server).
 * - Project names are resolved with a separate, non-inner lookup so an order is
 *   never silently dropped when its project row is not readable / project_id is null
 *   (the old `projects!inner(name)` join was hiding real orders from the dashboard).
 * - Supabase Realtime keeps the list live; `refresh()` remains as a manual fallback.
 */

// Canonical status strings exactly as stored in purchase_orders.status
export const PO_STATUS = {
  PENDING: 'Pending Delivery', // created by admin/PM, awaiting this supplier's response
  SUGGESTED: 'Suggested',      // supplier counter-offered, awaiting admin/PM response
  CONFIRMED: 'Confirmed',      // approved, awaiting dispatch by supplier
  DELIVERED: 'Delivered',      // supplier dispatched, awaiting site receipt
  RECEIVED: 'Received',        // site confirmed receipt (stock incremented)
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
} as const;

export const SUPPLIER_STATUS_TABS = [
  'All',
  PO_STATUS.PENDING,
  PO_STATUS.SUGGESTED,
  PO_STATUS.CONFIRMED,
  PO_STATUS.DELIVERED,
  PO_STATUS.RECEIVED,
  PO_STATUS.REJECTED,
  PO_STATUS.CANCELLED,
];

export interface SupplierOrder {
  id: string;
  po_number: string | null;
  items: string | null;
  material_id: string | null;
  project_id: string | null;
  project_name: string;
  project_location?: string;
  status: string;
  quantity_ordered: number | null;
  unit_price: number | null;
  total_price: number | null;
  expected_date: string | null;
  created_at: string;
  updated_at: string | null;
  [key: string]: any;
}

export interface SupplierProject {
  id: string;
  name: string;
  location: string;
}

const todayISO = () => new Date().toISOString().split('T')[0];

export const isLateOrder = (o: SupplierOrder) =>
  (o.status === PO_STATUS.PENDING || o.status === PO_STATUS.CONFIRMED) &&
  !!o.expected_date &&
  o.expected_date < todayISO();

/** Derive every dashboard metric from the same list. */
export function deriveSupplierStats(orders: SupplierOrder[]) {
  const newOrders = orders.filter(o => o.status === PO_STATUS.PENDING);
  const incoming = orders.filter(o => o.status === PO_STATUS.PENDING || o.status === PO_STATUS.SUGGESTED);
  const pendingDeliveries = orders
    .filter(o => o.status === PO_STATUS.CONFIRMED)
    .sort((a, b) => (a.expected_date || '9999').localeCompare(b.expected_date || '9999'));
  const late = orders.filter(isLateOrder);
  const revenueStatuses: string[] = [PO_STATUS.CONFIRMED, PO_STATUS.DELIVERED, PO_STATUS.RECEIVED];
  const totalRevenue = orders
    .filter(o => revenueStatuses.includes(o.status))
    .reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);

  return { newOrders, incoming, pendingDeliveries, late, totalRevenue };
}

/** Case-insensitive match on PO number, material/items and project name. */
export function matchesSupplierSearch(o: SupplierOrder, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (o.po_number || '').toLowerCase().includes(q) ||
    (o.items || '').toLowerCase().includes(q) ||
    (o.material_id || '').toString().toLowerCase().includes(q) ||
    (o.project_name || '').toLowerCase().includes(q)
  );
}

/** Suggestions for GlobalSearchDropdown's local mode, built only from this supplier's orders. */
export function buildOrderSuggestions(orders: SupplierOrder[], query: string) {
  return orders
    .filter(o => matchesSupplierSearch(o, query))
    .map(o => ({
      id: o.id,
      title: `${o.po_number || 'PO'} — ${o.items || 'Material'}`,
      subtitle: `${o.project_name} · Qty ${o.quantity_ordered ?? 0}`,
      badge: o.status,
      raw: o,
    }));
}

export function useSupplierOrders() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [projects, setProjects] = useState<SupplierProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      if (mountedRef.current) setLoading(false);
      return;
    }
    try {
      const [ordersRes, rolesRes] = await Promise.all([
        supabase
          .from('purchase_orders')
          .select('*')
          .eq('supplier_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('project_role_assignments')
          .select('project_id, projects(id, name, location)')
          .eq('user_id', userId)
          .eq('role', 'supplier'),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      const rawOrders = ordersRes.data || [];

      // Build a project lookup from assignments first, then fill any gaps directly.
      const projectMap = new Map<string, SupplierProject>();
      const assignedIds: string[] = [];
      (rolesRes.data || []).forEach((r: any) => {
        const p = Array.isArray(r.projects) ? r.projects[0] : r.projects;
        if (p?.name) {
          projectMap.set(r.project_id, { id: r.project_id, name: p.name, location: p.location || '' });
        } else if (r.project_id) {
          assignedIds.push(r.project_id);
        }
      });

      const missingIds = Array.from(
        new Set([
          ...assignedIds,
          ...rawOrders.map((o: any) => o.project_id),
        ].filter((id: any) => id && !projectMap.has(id)))
      );
      if (missingIds.length > 0) {
        try {
          const extra = await api.projects.bulkNames(missingIds);
          (extra || []).forEach((p: any) =>
            projectMap.set(p.id, { id: p.id, name: p.name || 'Unknown Project', location: p.location || '' })
          );
        } catch (e) {
          console.error("Failed to fetch missing project names", e);
        }
      }

      const enriched: SupplierOrder[] = rawOrders.map((o: any) => ({
        ...o,
        project_name: (o.project_id && projectMap.get(o.project_id)?.name) || 'Unknown Project',
        project_location: (o.project_id && projectMap.get(o.project_id)?.location) || '',
      }));

      if (mountedRef.current) {
        setOrders(enriched);
        setProjects(Array.from(projectMap.values()));
        setError(null);
        setLastUpdated(new Date());
      }
    } catch (err: any) {
      console.warn('[useSupplierOrders] load failed:', err);
      if (mountedRef.current) setError(err?.message || 'Failed to load orders');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId]);

  // Coalesce bursts of realtime events into a single refetch.
  const scheduleReload = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { load(); }, 250);
  }, [load]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    load();

    if (!userId) return () => { mountedRef.current = false; };

    // Unique topic per hook instance so multiple screens can subscribe safely.
    const topic = `supplier-orders:${userId}:${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(topic)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_orders', filter: `supplier_id=eq.${userId}` },
        scheduleReload)
      // DELETE payloads cannot be filtered server-side; refetch to drop removed rows.
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'purchase_orders' },
        scheduleReload)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'project_role_assignments', filter: `user_id=eq.${userId}` },
        scheduleReload)
      .subscribe();

    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [userId, load, scheduleReload]);

  const stats = useMemo(() => deriveSupplierStats(orders), [orders]);

  return { orders, projects, stats, loading, error, lastUpdated, refresh: load };
}
