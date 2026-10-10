import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Image, Switch } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { supabase } from "@/lib/supabase";
import { useAsyncData } from "@/hooks/useAsyncData";
import {
  ScreenContainer,
  Card,
  Button,
  LoadingState,
  EmptyState,
  ErrorState,
} from "@/components/ui";
import { LogoutConfirmationModal } from "@/components/common/LogoutConfirmationModal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { rows } from "@/services/workerData";
export function normalizeSriLankanPhone(value: string) {
  const digits = value
    .replace(/[\s()-]/g, "")
    .replace(/^0094/, "+94")
    .replace(/^0/, "+94")
    .replace(/^94/, "+94");
  if (digits && !/^\+94[1-9]\d{8}$/.test(digits))
    throw new Error("Enter a Sri Lankan phone number, such as 077 123 4567.");
  return digits;
}
async function bounded<T>(promise: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Request timed out. Please try again.")),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
function Field({
  label,
  value,
  onChange,
  secure = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
}) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold dark:text-white">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        autoCapitalize={secure ? "none" : "sentences"}
        className="border border-slate-200 rounded-xl p-3 min-h-[48px] text-base dark:text-white min-w-0"
      />
    </View>
  );
}
export default function WorkerAccount({
  settings = false,
}: {
  settings?: boolean;
}) {
  const { user, signOut } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [logout, setLogout] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const lastAction = useRef<(() => Promise<void>) | null>(null);
  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!user) throw new Error("Please sign in.");
      return rows(
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        signal,
      );
    },
    [user?.id],
  );
  const profile = useAsyncData(load);
  useEffect(() => {
    if (profile.data)
      setForm(
        Object.fromEntries(
          ["full_name", "contact_number", "address", "emergency_contact"].map(
            (key) => [key, profile.data[key] || ""],
          ),
        ),
      );
  }, [profile.data]);
  const run = async (action: () => Promise<void>) => {
    lastAction.current = action;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const update = async (values: any) => {
    const result: any = await bounded(
      supabase.from("profiles").update(values).eq("id", user!.id).select("id"),
    );
    if (result.error) throw result.error;
    if (!result.data?.length)
      throw new Error("Your profile could not be saved. Please try again.");
    setMessage("Saved");
    profile.retry();
  };
  const upload = () =>
    run(async () => {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        throw new Error("Allow photo access to choose your profile photo.");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64) throw new Error("Unable to read this photo.");
      const path = `${user!.id}/avatar-${Date.now()}.jpg`;
      const response = await bounded(
        supabase.storage.from("avatars").upload(path, decode(asset.base64), {
          contentType: asset.mimeType || "image/jpeg",
        }),
      );
      if (response.error) throw response.error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      await update({ avatar_url: data.publicUrl });
    });
  if (profile.loading) return <LoadingState />;
  if (profile.error)
    return <ErrorState message={profile.error} onRetry={profile.retry} />;
  if (!profile.data)
    return (
      <EmptyState
        title="Profile unavailable"
        message="Please contact your Project Manager."
      />
    );
  const p = profile.data;
  return (
    <ScreenContainer>
      <View className="gap-4 min-w-0">
        {error && (
          <ErrorState
            message={error}
            onRetry={() => {
              if (lastAction.current) void run(lastAction.current);
            }}
          />
        )}
        {!!message && (
          <Text accessibilityRole="alert" className="text-green-700">
            {message}
          </Text>
        )}
        {!settings ? (
          <>
            <Card style={{ marginBottom: 0 }}>
              <View className="gap-3">
                {p.avatar_url && (
                  <Image
                    source={{ uri: p.avatar_url }}
                    className="w-24 h-24 rounded-full"
                    accessibilityLabel="Your profile photo"
                  />
                )}
                <Button
                  label="Change photo"
                  variant="secondary"
                  onPress={upload}
                  loading={busy}
                />
                <StatusBadge status="Worker" />
                <Text className="font-semibold text-cyan-600">
                  {p.worker_code || "Worker code pending"}
                </Text>
                <Text className="text-sm text-slate-500">
                  Role and worker code are read-only.
                </Text>
              </View>
            </Card>
            <Card style={{ marginBottom: 0 }}>
              <View className="gap-4">
                <Text className="text-base font-semibold dark:text-white">
                  My contact details
                </Text>
                {[
                  ["full_name", "Full name"],
                  ["contact_number", "Phone (+94)"],
                  ...("address" in p ? [["address", "Address"]] : []),
                  ...("emergency_contact" in p
                    ? [["emergency_contact", "Emergency contact phone"]]
                    : []),
                ].map(([key, label]) => (
                  <Field
                    key={key}
                    label={label}
                    value={form[key] || ""}
                    onChange={(value) =>
                      setForm((f) => ({ ...f, [key]: value }))
                    }
                  />
                ))}
                <Button
                  label="Save contact details"
                  loading={busy}
                  onPress={() =>
                    run(async () => {
                      if (!form.full_name?.trim())
                        throw new Error("Enter your full name.");
                      const values: any = {
                        full_name: form.full_name.trim(),
                        contact_number: normalizeSriLankanPhone(
                          form.contact_number,
                        ),
                      };
                      if ("address" in p) values.address = form.address;
                      if ("emergency_contact" in p)
                        values.emergency_contact = normalizeSriLankanPhone(
                          form.emergency_contact,
                        );
                      await update(values);
                    })
                  }
                />
              </View>
            </Card>
          </>
        ) : (
          <>
            <Card style={{ marginBottom: 0 }}>
              <View className="gap-3">
                <Text className="text-base font-semibold dark:text-white">
                  Appearance
                </Text>
                <Button
                  variant="secondary"
                  label={
                    isDark ? "Switch to light theme" : "Switch to dark theme"
                  }
                  onPress={toggleTheme}
                />
              </View>
            </Card>
            <Card style={{ marginBottom: 0 }}>
              <View className="gap-4">
                <Text className="text-base font-semibold dark:text-white">
                  Notification preferences
                </Text>
                {[
                  ["email", "Payslip emails"],
                  ["in_app", "In-app updates"],
                ].map(([key, label]) => (
                  <View
                    key={key}
                    className="flex-row items-center gap-3 min-h-[48px]"
                  >
                    <Text className="flex-1 text-sm dark:text-white">
                      {label}
                    </Text>
                    <Switch
                      hitSlop={14}
                      accessibilityLabel={label}
                      disabled={busy}
                      value={p.notification_preferences?.[key] !== false}
                      onValueChange={(value) =>
                        run(() =>
                          update({
                            notification_preferences: {
                              ...p.notification_preferences,
                              [key]: value,
                            },
                          }),
                        )
                      }
                    />
                  </View>
                ))}
              </View>
            </Card>
            <Card style={{ marginBottom: 0 }}>
              <View className="gap-4">
                <Text className="text-base font-semibold dark:text-white">
                  Change password
                </Text>
                <Field
                  label="New password"
                  value={password}
                  onChange={setPassword}
                  secure={!show}
                />
                <Field
                  label="Confirm password"
                  value={confirm}
                  onChange={setConfirm}
                  secure={!show}
                />
                <Button
                  label={show ? "Hide passwords" : "Show passwords"}
                  variant="secondary"
                  onPress={() => setShow(!show)}
                />
                <Button
                  label="Change password"
                  loading={busy}
                  onPress={() =>
                    run(async () => {
                      if (password.length < 8)
                        throw new Error("Use at least 8 characters.");
                      if (password !== confirm)
                        throw new Error("Passwords do not match.");
                      const result = await bounded(
                        supabase.auth.updateUser({ password }),
                      );
                      if (result.error) throw result.error;
                      setPassword("");
                      setConfirm("");
                      setMessage("Password changed.");
                    })
                  }
                />
              </View>
            </Card>
            <Button
              label="Sign out"
              variant="danger"
              loading={busy}
              onPress={() => setLogout(true)}
            />
            <LogoutConfirmationModal
              visible={logout}
              isDark={isDark}
              onCancel={() => setLogout(false)}
              onConfirm={() => {
                setLogout(false);
                run(signOut);
              }}
            />
          </>
        )}
      </View>
    </ScreenContainer>
  );
}
