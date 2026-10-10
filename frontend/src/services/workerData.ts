import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { getApiUrl } from "@/lib/apiUrl";
export type Attendance = {
  id: string;
  date: string;
  status: string;
  check_in_time: string | null;
  check_out_time: string | null;
  hours_worked: number | null;
  overtime_hours: number | null;
  site_name?: string;
  project_id: string;
};
export const money = (value: number | null | undefined) =>
  value == null || !Number.isFinite(Number(value))
    ? "Not recorded"
    : `Rs. ${Number(value).toLocaleString("en-LK", { maximumFractionDigits: 2 })}`;
export const dateLabel = (value?: string) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "Not recorded";
export const timeLabel = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("en-LK", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Colombo",
      })
    : "-";
export const todayKey = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return {
    start: `${month}-01`,
    end: `${month}-${new Date(y, m, 0).getDate()}`,
  };
}
export async function rows(query: any, signal: AbortSignal) {
  const { data, error } = await query.abortSignal(signal);
  if (error) throw error;
  return data;
}
export async function workerRequest(path: string, signal: AbortSignal) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in again.");
  const res = await fetch(`${getApiUrl()}/labour/worker/${path}`, {
    signal,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Unable to load your data.");
  return data;
}
export async function profileForWorker(id: string, signal: AbortSignal) {
  const profile = await rows(
    supabase.from("profiles").select("*").eq("id", id).single(),
    signal,
  );
  try {
    await AsyncStorage.setItem(
      `worker-profile:${id}`,
      JSON.stringify({
        id: profile.id,
        full_name: profile.full_name,
        worker_code: profile.worker_code,
        qr_code: profile.qr_code,
      }),
    );
  } catch {
    /* Profile remains usable if local storage is full. */
  }
  return profile;
}
export async function cachedWorker(id: string) {
  try {
    const raw = await AsyncStorage.getItem(`worker-profile:${id}`);
    const profile = raw ? JSON.parse(raw) : null;
    return profile?.id === id ? profile : null;
  } catch {
    return null;
  }
}
