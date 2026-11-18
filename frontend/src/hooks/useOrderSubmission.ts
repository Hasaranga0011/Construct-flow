import { useRef } from 'react';
import { api } from '@/services/api';
import { newRequestId } from '@/utils/procurement';

/** Keep the same payload/key after an uncertain response; serialize concurrent taps. */
export function useOrderSubmission() {
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const active = useRef<Promise<any> | null>(null);
  return (data: Record<string, unknown>) => {
    if (active.current) return active.current;
    const fingerprint = JSON.stringify(data);
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, requestId: newRequestId() };
    const promise = api.purchaseOrders.create({ ...data, request_id: pending.current.requestId });
    active.current = promise;
    return promise.then(result => { pending.current = null; return result; }).finally(() => { active.current = null; });
  };
}
