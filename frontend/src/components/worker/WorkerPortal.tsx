import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  useWindowDimensions,
  Linking,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { useAsyncData } from "@/hooks/useAsyncData";
import {
  ScreenContainer,
  Card,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StatCard } from "@/components/common/StatCard";
import { TopNav } from "@/components/common/TopNav";
import {
  Attendance,
  rows,
  profileForWorker,
  cachedWorker,
  workerRequest,
  money,
  dateLabel,
  timeLabel,
  todayKey,
  monthRange,
} from "@/services/workerData";
import { deliverReport } from "@/components/reports/reportDelivery";

type Resource = ReturnType<typeof useAsyncData<any>>;
function UpdateItem({
  notification,
  expanded,
  onRead,
}: {
  notification: any;
  expanded: boolean;
  onRead: () => void;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const markRead = async () => {
    if (!user || busy) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    setBusy(true);
    setError("");
    try {
      const changed = await rows(
        supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("id", notification.id)
          .eq("target_user_id", user.id)
          .select("id"),
        controller.signal,
      );
      if (!changed?.length)
        throw new Error(
          "This update could not be marked as read. Please try again.",
        );
      onRead();
    } catch (e: any) {
      setError(
        controller.signal.aborted
          ? "Request timed out. Please try again."
          : e.message,
      );
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  };
  return (
    <View className="gap-2">
      <Text className="font-semibold dark:text-white">
        {notification.title}
      </Text>
      <BodyText>{notification.message}</BodyText>
      <BodyText>{dateLabel(notification.created_at)}</BodyText>
      {notification.link === "/worker/payroll" && (
        <Button
          label="View payslip"
          variant="secondary"
          onPress={() => router.push("/worker/payroll")}
        />
      )}
      {expanded && !notification.is_read && (
        <Button
          label="Mark as read"
          variant="secondary"
          loading={busy}
          onPress={markRead}
        />
      )}
      {!!error && <ErrorState message={error} onRetry={markRead} />}
    </View>
  );
}
const waiting =
  "Waiting for site assignment. Your Project Manager will assign you soon.";
export function BodyText({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-sm text-slate-600 dark:text-slate-300 flex-shrink min-w-0">
      {children}
    </Text>
  );
}
function Block({
  title,
  state,
  children,
  empty,
}: {
  title: string;
  state: Resource;
  children: (data: any) => React.ReactNode;
  empty?: string;
}) {
  return (
    <Card style={{ marginBottom: 0, minWidth: 0 }}>
      <Text className="text-base font-semibold text-slate-900 dark:text-white mb-3">
        {title}
      </Text>
      {state.loading ? (
        <LoadingState />
      ) : state.error ? (
        <ErrorState message={state.error} onRetry={state.retry} />
      ) : state.data == null ||
        (!!empty && Array.isArray(state.data) && !state.data.length) ? (
        <EmptyState title={empty || "Nothing here yet"} message="" />
      ) : (
        children(state.data)
      )}
    </Card>
  );
}
function useWorkerResource(kind: string, month: string, enabled = true) {
  const { user } = useAuth();
  const id = user?.id;
  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!enabled) return null;
      if (!id) throw new Error("Please sign in to view your data.");
      const range = monthRange(month);
      switch (kind) {
        case "profile":
          return profileForWorker(id, signal);
        case "site":
          return workerRequest("site", signal);
        case "pay":
          return workerRequest(`payroll?month=${month}`, signal);
        case "slips":
          return rows(
            supabase
              .from("salary_slips")
              .select("*")
              .eq("worker_id", id)
              .order("period_start", { ascending: false }),
            signal,
          );
        case "updates":
          return rows(
            supabase
              .from("notifications")
              .select("*")
              .eq("target_user_id", id)
              .order("created_at", { ascending: false })
              .limit(50),
            signal,
          );
        case "recent":
          return rows(
            supabase
              .from("attendance")
              .select("*")
              .eq("worker_id", id)
              .order("date", { ascending: false })
              .limit(7),
            signal,
          );
        default:
          return rows(
            supabase
              .from("attendance")
              .select("*")
              .eq("worker_id", id)
              .gte("date", range.start)
              .lte("date", range.end)
              .order("date", { ascending: false }),
            signal,
          );
      }
    },
    [id, kind, month, enabled],
  );
  const resource = useAsyncData(load);
  useEffect(() => {
    if (!id || !enabled) return;
    const tables: Record<string, [string, string][]> = {
      profile: [["profiles", "id"]],
      site: [
        ["site_workers", "worker_id"],
        ["project_role_assignments", "user_id"],
      ],
      pay: [
        ["attendance", "worker_id"],
        ["salary_slips", "worker_id"],
        ["profiles", "id"],
      ],
      slips: [["salary_slips", "worker_id"]],
      updates: [["notifications", "target_user_id"]],
    };
    const channel = supabase.channel(`worker:${kind}:${id}:${month}`);
    // DELETE events cannot be row-filtered by Postgres Changes. The scoped
    // polling fallback handles deletions without subscribing to other IDs.
    for (const [table, column] of tables[kind] || [["attendance", "worker_id"]]) {
      for (const event of ["INSERT", "UPDATE"] as const)
        channel.on(
          "postgres_changes",
          { event, schema: "public", table, filter: `${column}=eq.${id}` },
          resource.retry,
        );
    }
    let active = true;
    if (kind === "site") {
      supabase
        .from("workers")
        .select("id")
        .eq("user_id", id)
        .then(({ data }) => {
          if (!active) return;
          const linked = supabase.channel(`worker-site-links:${id}`);
          for (const worker of data || [])
            if (worker.id && worker.id !== id)
              for (const event of ["INSERT", "UPDATE"] as const)
                linked.on(
                  "postgres_changes",
                  {
                    event,
                    schema: "public",
                    table: "site_workers",
                    filter: `worker_id=eq.${worker.id}`,
                  },
                  resource.retry,
                );
          linked.subscribe();
          linkedChannel = linked;
        });
    }
    let linkedChannel: ReturnType<typeof supabase.channel> | undefined;
    channel.subscribe();
    // Reconnect and missed-event fallback, still scoped by the authenticated identity.
    const poll = setInterval(resource.retry, 60000);
    return () => {
      active = false;
      clearInterval(poll);
      supabase.removeChannel(channel);
      if (linkedChannel) supabase.removeChannel(linkedChannel);
    };
  }, [id, kind, month, enabled, resource.retry]);
  return resource;
}
function MonthSelector({
  month,
  setMonth,
}: {
  month: string;
  setMonth: (month: string) => void;
}) {
  const move = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  return (
    <View className="flex-row items-center justify-between gap-2">
      <Button
        label="‹"
        accessibilityLabel="Previous month"
        variant="secondary"
        onPress={() => move(-1)}
        style={{ minWidth: 48 }}
      />
      <Text
        accessibilityRole="header"
        className="text-base font-semibold flex-1 text-center dark:text-white"
      >
        {new Date(`${month}-01T12:00:00`).toLocaleDateString("en-LK", {
          month: "long",
          year: "numeric",
        })}
      </Text>
      <Button
        label="›"
        accessibilityLabel="Next month"
        variant="secondary"
        onPress={() => move(1)}
        style={{ minWidth: 48 }}
      />
    </View>
  );
}
export function AttendanceCalendar({
  month,
  records,
}: {
  month: string;
  records: Attendance[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [year, number] = month.split("-").map(Number);
  const count = new Date(year, number, 0).getDate();
  const offset = new Date(year, number - 1, 1).getDay();
  useEffect(() => setSelected(null), [month]);
  const symbols: Record<string, string> = {
    Present: "P",
    Absent: "A",
    "On Leave": "L",
    "Not scheduled": "-",
  };
  const colors: Record<string, string> = {
    Present: "#DCFCE7",
    Absent: "#FEE2E2",
    "On Leave": "#FEF3C7",
    "Not scheduled": "#F1F5F9",
  };
  const daily = selected ? records.filter((r) => r.date === selected) : [];
  // Seven 48px targets cannot fit at 320px. Use a four-column dated grid at narrow widths.
  const columns = width < 208 ? 3 : width < 364 ? 4 : 7;
  return (
    <View
      className="gap-3"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <BodyText>
        {columns === 7
          ? "Sun | Mon | Tue | Wed | Thu | Fri | Sat"
          : "Select a date to see your times"}
      </BodyText>
      <View className="flex-row flex-wrap">
        {Array.from(
          { length: count + (columns === 7 ? offset : 0) },
          (_, i) => {
            const day = i - (columns === 7 ? offset : 0) + 1;
            if (day < 1)
              return (
                <View
                  key={`blank${i}`}
                  style={{ width: `${100 / columns}%` }}
                />
              );
            const key = `${month}-${String(day).padStart(2, "0")}`;
            const record = records.find((r) => r.date === key);
            const status = record?.status || "Not scheduled";
            return (
              <View
                key={key}
                style={{ width: `${100 / columns}%`, padding: 2 }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${dateLabel(key)}, ${status}`}
                  onPress={() => setSelected(key)}
                  style={{
                    minHeight: 52,
                    borderRadius: 8,
                    backgroundColor: colors[status] || colors["Not scheduled"],
                    justifyContent: "center",
                    alignItems: "center",
                    borderWidth: selected === key ? 2 : 0,
                    borderColor: "#F97316",
                  }}
                >
                  <Text className="text-sm font-semibold text-slate-900">
                    {day}
                  </Text>
                  <Text className="text-xs text-slate-700">
                    {symbols[status] || "-"}
                  </Text>
                </Pressable>
              </View>
            );
          },
        )}
      </View>
      <BodyText>P Present | A Absent | L On Leave | - Not scheduled</BodyText>
      <BodyText>Unrecorded days are not treated as absences.</BodyText>
      {selected && (
        <View className="gap-2">
          <BodyText>{dateLabel(selected)}</BodyText>
          {daily.length ? (
            daily.map((r) => <RecordDetails key={r.id} record={r} />)
          ) : (
            <BodyText>No attendance recorded for this day.</BodyText>
          )}
        </View>
      )}
    </View>
  );
}
function RecordDetails({ record: r }: { record: Attendance }) {
  return (
    <View className="gap-2">
      <StatusBadge status={r.status} />
      <BodyText>
        In {timeLabel(r.check_in_time)} · Out {timeLabel(r.check_out_time)}
      </BodyText>
      <BodyText>
        {r.hours_worked ?? 0} hours · {r.overtime_hours ?? 0} overtime hours
      </BodyText>
      <BodyText>{r.site_name || "Site name not recorded"}</BodyText>
    </View>
  );
}
function RecordList({ records }: { records: Attendance[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View className="gap-3">
      {records.map((r) => (
        <View key={r.id} className="border-b border-slate-100 pb-3">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open === r.id }}
            onPress={() => setOpen(open === r.id ? null : r.id)}
            className="min-h-[48px] justify-center"
          >
            <Text className="font-semibold text-sm dark:text-white">
              {dateLabel(r.date)} · {r.status}
            </Text>
            <BodyText>
              {timeLabel(r.check_in_time)} · {timeLabel(r.check_out_time)} ·{" "}
              {r.hours_worked ?? 0} h · OT {r.overtime_hours ?? 0} h
            </BodyText>
          </Pressable>
          {open === r.id && <RecordDetails record={r} />}
        </View>
      ))}
    </View>
  );
}
function Contacts({ assignment }: { assignment: any }) {
  const phone = assignment?.manager?.contact_number
    ?.replace(/[^+0-9]/g, "")
    .replace(/^0/, "+94");
  return (
    <View className="gap-2">
      <BodyText>
        {assignment?.manager?.full_name ||
          "Site manager contact not available yet"}
      </BodyText>
      {phone && (
        <>
          <Button
            label="Call site manager"
            variant="secondary"
            onPress={() => Linking.openURL(`tel:${phone}`)}
          />
          <Button
            label="WhatsApp site manager"
            variant="secondary"
            onPress={() =>
              Linking.openURL(`https://wa.me/${phone.replace("+", "")}`)
            }
          />
        </>
      )}
    </View>
  );
}
function QRModal({
  profile,
  offline,
  onClose,
}: {
  profile: any;
  offline: boolean;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  useEffect(() => {
    if (Platform.OS === "web") return;
    let original: number | undefined;
    let closed = false;
    import("expo-brightness")
      .then(async (b) => {
        original = await b.getBrightnessAsync();
        if (!closed) await b.setBrightnessAsync(1);
        if (closed && original !== undefined)
          await b.setBrightnessAsync(original);
      })
      .catch(() => {});
    return () => {
      closed = true;
      if (original !== undefined)
        import("expo-brightness")
          .then((b) => b.setBrightnessAsync(original!))
          .catch(() => {});
    };
  }, []);
  let svgRef: any = null;

  const downloadQR = () => {
    if (svgRef && svgRef.toDataURL) {
      svgRef.toDataURL(async (data: string) => {
        if (Platform.OS === 'web') {
          const a = document.createElement('a');
          a.href = `data:image/png;base64,${data}`;
          a.download = `worker_qr_${profile.worker_code || profile.id}.png`;
          a.click();
        } else {
          try {
            const FileSystem = await import('expo-file-system');
            const Sharing = await import('expo-sharing');
            const fileUri = `${FileSystem.documentDirectory}worker_qr_${profile.worker_code || profile.id}.png`;
            await FileSystem.writeAsStringAsync(fileUri, data, { encoding: FileSystem.EncodingType.Base64 });
            const isAvailable = await Sharing.isAvailableAsync();
            if (isAvailable) {
              await Sharing.shareAsync(fileUri);
            } else {
              Alert.alert('Sharing not available', 'Unable to share or save the QR code on this device.');
            }
          } catch (e) {
            Alert.alert('Error', 'Failed to save QR code.');
          }
        }
      });
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-white">
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            padding: 16,
            gap: 16,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Button label="Close QR" variant="secondary" onPress={onClose} />
          {offline && (
            <Text className="text-sm text-slate-500">Offline - Saved QR</Text>
          )}
          {profile?.qr_code ? (
            <View>
              <QRCode
                value={profile.qr_code}
                size={Math.max(120, Math.min(width * 0.8, height * 0.55, 600))}
                backgroundColor="white"
                getRef={(c) => (svgRef = c)}
              />
              <Button label="Download QR" onPress={downloadQR} style={{ marginTop: 16 }} />
            </View>
          ) : (
            <Text>QR code has not been assigned yet.</Text>
          )}
          <Text className="text-xl font-bold text-center">
            {profile?.full_name}
          </Text>
          <Text className="text-base text-center">
            {profile?.worker_code || "Worker code pending"}
          </Text>
          <Text className="text-sm text-slate-600 text-center">
            Hold your phone steady for the Site Manager to scan
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
function PaySummary({ pay }: { pay: any }) {
  return (
    <View className="gap-3">
      <StatusBadge
        status={
          pay.final ? `Final · ${pay.slip_number || "Payslip"}` : "Estimated"
        }
      />
      <BodyText>
        {pay.total_days} days x {money(pay.daily_rate)} daily rate ={" "}
        {money(pay.basic_pay)}
      </BodyText>
      <BodyText>
        {pay.overtime_hours ?? 0} overtime hours x hourly rate x 1.5 ={" "}
        {money(pay.overtime_pay)}
      </BodyText>
      <BodyText>Deductions: {money(pay.deductions ?? 0)}</BodyText>
      <Text className="text-2xl font-bold dark:text-white">
        {money(pay.total_pay)}
      </Text>
      {!pay.total_days && <BodyText>No days recorded yet this period</BodyText>}
    </View>
  );
}
function Slip({
  slip,
  initialOpen = false,
}: {
  slip: any;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const net = slip.total_amount ?? slip.total_pay;
  const gross =
    slip.basic_pay != null && slip.overtime_pay != null
      ? Number(slip.basic_pay) + Number(slip.overtime_pay)
      : null;
  const exportPdf = async () => {
    setBusy(true);
    setError("");
    try {
      const now = new Date().toISOString();
      await deliverReport(
        {
          title: `Payslip ${slip.slip_number || dateLabel(slip.period_start)}`,
          scope: `${dateLabel(slip.period_start)} - ${dateLabel(slip.period_end)}`,
          retrievedAt: now,
          exportedAt: now,
          sections: [
            {
              title: "Pay breakdown",
              headers: ["Item", "Value"],
              rows: [
                ["Days", slip.total_days ?? null],
                ["Hours", slip.total_hours ?? null],
                ["Overtime hours", slip.overtime_hours ?? null],
                ["Base pay", money(slip.basic_pay)],
                ["Overtime pay", money(slip.overtime_pay)],
                ["Gross", money(gross)],
                ["Deductions", money(slip.deductions ?? 0)],
                ["Net pay", money(net)],
              ],
            },
          ],
        },
        "pdf",
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className="gap-3 border-b border-slate-100 pb-4">
      <Text className="font-semibold dark:text-white">
        {dateLabel(slip.period_start)} · {dateLabel(slip.period_end)}
      </Text>
      <Text className="text-2xl font-bold dark:text-white">{money(net)}</Text>
      <StatusBadge
        status={
          String(slip.status).toLowerCase() === "paid" ? "Paid" : "Generated"
        }
      />
      <BodyText>Generated {dateLabel(slip.created_at)}</BodyText>
      <Button
        label={open ? "Hide details" : "View"}
        variant="secondary"
        onPress={() => setOpen(!open)}
      />
      {open && (
        <>
          <BodyText>
            {slip.slip_number || "Payslip"} ·{" "}
            {slip.total_days ?? "Not recorded"} days |{" "}
            {slip.total_hours ?? "Not recorded"} hours ·{" "}
            {slip.overtime_hours ?? "Not recorded"} overtime hours
          </BodyText>
          <BodyText>
            Gross {money(gross)} | Deductions {money(slip.deductions ?? 0)} |
            Net {money(net)}
          </BodyText>
        </>
      )}
      <Button label="Download PDF" onPress={exportPdf} loading={busy} />
      {error && <ErrorState message={error} onRetry={exportPdf} />}
    </View>
  );
}
export default function WorkerPortal({
  screen,
}: {
  screen: "dashboard" | "attendance" | "payroll" | "notifications";
}) {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const [now, setNow] = useState(Date.now());
  const [qr, setQr] = useState(false);
  const [cached, setCached] = useState<any>(null);
  const profile = useWorkerResource("profile", month, screen === "dashboard"),
    site = useWorkerResource("site", month, screen === "dashboard"),
    attendance = useWorkerResource(
      "attendance",
      month,
      screen === "dashboard" || screen === "attendance",
    ),
    pay = useWorkerResource(
      "pay",
      month,
      screen === "dashboard" || screen === "payroll",
    ),
    slips = useWorkerResource(
      "slips",
      month,
      screen === "dashboard" || screen === "payroll",
    ),
    recent = useWorkerResource("recent", month, screen === "dashboard"),
    updates = useWorkerResource(
      "updates",
      month,
      screen === "dashboard" || screen === "notifications",
    );
  useEffect(() => {
    setCached(null);
    if (user?.id) {
      let active = true;
      cachedWorker(user.id).then((p) => {
        if (active) setCached(p);
      });
      return () => {
        active = false;
      };
    }
  }, [user?.id]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const identity = profile.data || cached;
  const today = attendance.data?.find((r: Attendance) => r.date === todayKey());
  const todayText =
    today?.status === "On Leave"
      ? "On leave"
      : today?.check_out_time
        ? `Checked out at ${timeLabel(today.check_out_time)}`
        : today?.check_in_time
          ? `Checked in at ${timeLabel(today.check_in_time)}`
          : "Not checked in";
  const siteCard = (
    <Block title="My Site" state={site} empty={waiting}>
      {(a) => (
        <View className="gap-3">
          <Text className="font-semibold dark:text-white">
            {a.project.name}
          </Text>
          <BodyText>
            {a.site.address || a.project.location || "Address not recorded"}
          </BodyText>
          {(a.site.address || a.project.location) && (
            <Button
              label="Open in Maps"
              variant="secondary"
              onPress={() =>
                Linking.openURL(
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.site.address || a.project.location)}`,
                )
              }
            />
          )}
          <Contacts assignment={a} />
          <BodyText>
            Start {dateLabel(a.project.start_date)} | Expected end{" "}
            {dateLabel(a.project.end_date)}
          </BodyText>
        </View>
      )}
    </Block>
  );
  const todayCard = (
    <Block title="Today" state={attendance}>
      {() => (
        <View className="gap-3">
          <StatusBadge status={todayText} />
          <BodyText>
            {site.data?.site.address ||
              site.data?.project.name ||
              (site.loading
                ? "Loading site..."
                : site.error
                  ? "Site details unavailable"
                  : waiting)}
          </BodyText>
          {today?.check_in_time && !today?.check_out_time && (
            <Text className="text-2xl font-bold dark:text-white">
              {Math.max(
                0,
                (now - new Date(today.check_in_time).getTime()) / 3600000,
              ).toFixed(2)}{" "}
              hours so far
            </Text>
          )}
          <Button
            label="Show my QR"
            disabled={!identity?.qr_code}
            onPress={() => setQr(true)}
          />
          {!identity?.qr_code && (
            <BodyText>Your QR has not been assigned yet.</BodyText>
          )}
        </View>
      )}
    </Block>
  );
  const summary = (
    <Block
      title="This month"
      state={{
        ...pay,
        loading: pay.loading || attendance.loading,
        error: pay.error || attendance.error,
        retry: () => {
          pay.retry();
          attendance.retry();
        },
      }}
    >
      {(p) => (
        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          {[
            [
              "Days Present",
              new Set(
                (attendance.data || [])
                  .filter((r: Attendance) => r.status === "Present")
                  .map((r: Attendance) => r.date),
              ).size,
            ],
            [
              "Hours Worked",
              (attendance.data || [])
                .reduce(
                  (n: number, r: Attendance) => n + Number(r.hours_worked || 0),
                  0,
                )
                .toLocaleString("en-LK", { maximumFractionDigits: 2 }),
            ],
            [
              "Overtime Hours",
              (attendance.data || [])
                .reduce(
                  (n: number, r: Attendance) =>
                    n + Number(r.overtime_hours || 0),
                  0,
                )
                .toLocaleString("en-LK", { maximumFractionDigits: 2 }),
            ],
            [
              p.final ? "Final Earnings (LKR)" : "Estimated Earnings (LKR)",
              Number(p.total_pay ?? 0).toLocaleString("en-LK"),
            ],
          ].map(([label, value]) => (
            <View
              key={label}
              style={{ width: width >= 1024 ? "23%" : "48%", minWidth: 0 }}
            >
              <StatCard
                fullWidth
                compact
                label={label}
                value={value ?? "Not recorded"}
              />
            </View>
          ))}
        </View>
      )}
    </Block>
  );
  const calendar = (
    <Block title="Attendance calendar" state={attendance}>
      {(records) => <AttendanceCalendar month={month} records={records} />}
    </Block>
  );
  const latest = (
    <Block
      title="Latest payslip"
      state={slips}
      empty="Your first payslip will appear here after your next pay period"
    >
      {(data) => <Slip slip={data[0]} />}
    </Block>
  );
  const recentCard = (
    <Block
      title="Recent check-ins"
      state={recent}
      empty="No attendance recorded yet"
    >
      {(data) => (
        <View className="gap-3">
          <RecordList records={data} />
          <Button
            label="View all attendance"
            variant="secondary"
            onPress={() => router.push("/worker/attendance")}
          />
        </View>
      )}
    </Block>
  );
  return (
    <View className="flex-1 bg-brand-light min-w-0">
      <TopNav
        title={
          screen === "dashboard"
            ? "My Dashboard"
            : screen === "attendance"
              ? "My Attendance"
              : screen === "payroll"
                ? "My Payroll"
                : "My Updates"
        }
        showAction={false}
      />
      <ScrollView 
        className="flex-1 px-4 md:px-8 py-6"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="max-w-7xl mx-auto w-full" style={{ gap: 16, minWidth: 0 }}>
          {screen === "dashboard" && (
            <>
              <Block
                title={`${Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", hourCycle: "h23" }).format(new Date(now))) < 12 ? "Good morning" : Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", hourCycle: "h23" }).format(new Date(now))) < 18 ? "Good afternoon" : "Good evening"}, ${profile.data?.full_name?.trim() || user?.email?.split("@")[0] || ""}`}
                state={profile}
              >
                {(p) => (
                  <View className="gap-2">
                    <View className="bg-cyan-50 rounded-xl p-3 gap-2">
                      <Text className="text-cyan-600 font-semibold">
                        {p.worker_code || "Worker code pending"}
                      </Text>
                      <StatusBadge status="Worker" />
                    </View>
                    {site.loading ? (
                      <LoadingState />
                    ) : site.error ? (
                      <ErrorState message={site.error} onRetry={site.retry} />
                    ) : (
                      <BodyText>
                        {site.data
                          ? `${site.data.project.name} - ${site.data.site.address || "Assigned site"}`
                          : waiting}
                      </BodyText>
                    )}
                  </View>
                )}
              </Block>
              {profile.error && cached?.qr_code && (
                <Button label="Show my saved QR" onPress={() => setQr(true)} />
              )}
              {width >= 1024 ? (
                <View className="flex-row gap-4">
                  <View
                    className="min-w-0 gap-4"
                    style={{ flex: width < 1280 ? 2 : 1 }}
                  >
                    {todayCard}
                    {summary}
                    {siteCard}
                  </View>
                  <View className="flex-1 min-w-0 gap-4">
                    {calendar}
                    {latest}
                    {recentCard}
                  </View>
                </View>
              ) : (
                <>
                  {todayCard}
                  {site.data && (
                    <Card style={{ marginBottom: 0 }}>
                      <Text className="text-base font-semibold dark:text-white mb-3">
                        Contact site manager
                      </Text>
                      <Contacts assignment={site.data} />
                    </Card>
                  )}
                  <View className="gap-4">
                    <Button
                      label="My Attendance"
                      variant="secondary"
                      onPress={() => router.push("/worker/attendance")}
                    />
                    <Button
                      label="My Payroll"
                      variant="secondary"
                      onPress={() => router.push("/worker/payroll")}
                    />
                  </View>
                  {summary}
                  {siteCard}
                  {calendar}
                  {latest}
                  {recentCard}
                </>
              )}
            </>
          )}
          {(screen === "attendance" || screen === "payroll") && (
            <MonthSelector month={month} setMonth={setMonth} />
          )}
          {screen === "attendance" && (
            <>
              <Block title="Month summary" state={attendance}>
                {(data: Attendance[]) => (
                  <View className="gap-2">
                    <BodyText>
                      {data.filter((r) => r.status === "Present").length} days
                      present |{" "}
                      {data.filter((r) => r.status === "Absent").length} absent
                      | {data.filter((r) => r.status === "On Leave").length} on
                      leave
                    </BodyText>
                    <BodyText>
                      {data
                        .reduce((n, r) => n + Number(r.hours_worked || 0), 0)
                        .toFixed(2)}{" "}
                      hours ·{" "}
                      {data
                        .reduce((n, r) => n + Number(r.overtime_hours || 0), 0)
                        .toFixed(2)}{" "}
                      overtime hours
                    </BodyText>
                  </View>
                )}
              </Block>
              {calendar}
              <Block
                title="Daily records"
                state={attendance}
                empty="No attendance recorded this month"
              >
                {(data) => <RecordList records={data} />}
              </Block>
            </>
          )}
          {screen === "payroll" && (
            <>
              <Block title="Pay this month" state={pay}>
                {(p) => <PaySummary pay={p} />}
              </Block>
              <Block
                title="Salary slips"
                state={slips}
                empty="No salary slips generated yet. Slips are generated by your Project Manager at the end of each pay period."
              >
                {(data) => (
                  <View className="gap-4">
                    {data.map((s: any) => (
                      <Slip
                        key={s.id}
                        slip={s}
                        initialOpen={params.id === s.id}
                      />
                    ))}
                  </View>
                )}
              </Block>
            </>
          )}
          {(screen === "dashboard" || screen === "notifications") && (
            <Block title="Updates" state={updates} empty="No updates yet">
              {(data) => (
                <View className="gap-4">
                  {data
                    .slice(0, screen === "dashboard" ? 3 : 50)
                    .map((n: any) => (
                      <UpdateItem
                        key={n.id}
                        notification={n}
                        expanded={screen === "notifications"}
                        onRead={updates.retry}
                      />
                    ))}
                  {screen === "dashboard" && (
                    <Button
                      label="View all updates"
                      variant="secondary"
                      onPress={() =>
                        router.push("/worker/notifications" as any)
                      }
                    />
                  )}
                </View>
              )}
            </Block>
          )}
        </View>
      </ScrollView>
      {qr && (
        <QRModal
          profile={{
            ...identity,
            full_name:
              identity?.full_name?.trim() || user?.email?.split("@")[0],
          }}
          offline={!!profile.error}
          onClose={() => setQr(false)}
        />
      )}
    </View>
  );
}
