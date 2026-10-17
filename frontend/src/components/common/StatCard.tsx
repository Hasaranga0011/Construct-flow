import React from "react";
import { View, Text, Platform } from "react-native";
import Ionicons from '@expo/vector-icons/Ionicons';

import { useResponsive } from "../../hooks/useResponsive";
import { useTheme } from "../../context/ThemeContext";
import { AutoFitText } from "./AutoFitText";

export type IndicatorType = "success" | "warning" | "danger" | "neutral";
export type StatCardColorScheme = "blue" | "emerald" | "amber" | "purple" | "rose" | "orange" | "cyan";

interface StatCardProps {
  label: string;
  value: string | number;
  indicatorText?: string;
  indicatorType?: IndicatorType;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  compact?: boolean;
  colorScheme?: StatCardColorScheme;
}

const COLOR_CONFIGS: Record<StatCardColorScheme, {
  bgLight: string;
  bgDark: string;
  borderLight: string;
  borderDark: string;
  iconBgLight: string;
  iconBgDark: string;
  iconColor: string;
  labelColorLight: string;
  labelColorDark: string;
  indicatorTextColorLight: string;
  indicatorTextColorDark: string;
  dotColor: string;
  shadowColor: string;
}> = {
  blue: {
    bgLight: "#EFF6FF", // Light sky/blue-50
    bgDark: "rgba(30, 58, 138, 0.22)",
    borderLight: "#BFDBFE", // blue-200
    borderDark: "rgba(59, 130, 246, 0.35)",
    iconBgLight: "#DBEAFE", // blue-100
    iconBgDark: "rgba(59, 130, 246, 0.25)",
    iconColor: "#2563EB",
    labelColorLight: "#1E40AF",
    labelColorDark: "#93C5FD",
    indicatorTextColorLight: "#1D4ED8",
    indicatorTextColorDark: "#60A5FA",
    dotColor: "#2563EB",
    shadowColor: "#3B82F6",
  },
  emerald: {
    bgLight: "#ECFDF5", // Light emerald/mint-50
    bgDark: "rgba(6, 78, 59, 0.22)",
    borderLight: "#A7F3D0", // emerald-200
    borderDark: "rgba(16, 185, 129, 0.35)",
    iconBgLight: "#D1FAE5", // emerald-100
    iconBgDark: "rgba(16, 185, 129, 0.25)",
    iconColor: "#059669",
    labelColorLight: "#065F46",
    labelColorDark: "#6EE7B7",
    indicatorTextColorLight: "#047857",
    indicatorTextColorDark: "#34D399",
    dotColor: "#10B981",
    shadowColor: "#10B981",
  },
  amber: {
    bgLight: "#FFFBEB", // Light warm amber-50
    bgDark: "rgba(120, 53, 15, 0.22)",
    borderLight: "#FDE68A", // amber-200
    borderDark: "rgba(245, 158, 11, 0.35)",
    iconBgLight: "#FEF3C7", // amber-100
    iconBgDark: "rgba(245, 158, 11, 0.25)",
    iconColor: "#D97706",
    labelColorLight: "#92400E",
    labelColorDark: "#FCD34D",
    indicatorTextColorLight: "#B45309",
    indicatorTextColorDark: "#FBBF24",
    dotColor: "#F59E0B",
    shadowColor: "#F59E0B",
  },
  purple: {
    bgLight: "#FAF5FF", // Light lilac purple-50
    bgDark: "rgba(76, 29, 149, 0.22)",
    borderLight: "#E9D5FF", // purple-200
    borderDark: "rgba(168, 85, 247, 0.35)",
    iconBgLight: "#F3E8FF", // purple-100
    iconBgDark: "rgba(168, 85, 247, 0.25)",
    iconColor: "#7C3AED",
    labelColorLight: "#5B21B6",
    labelColorDark: "#D8B4FE",
    indicatorTextColorLight: "#6D28D9",
    indicatorTextColorDark: "#C084FC",
    dotColor: "#8B5CF6",
    shadowColor: "#8B5CF6",
  },
  rose: {
    bgLight: "#FFF1F2", // Light rose-50
    bgDark: "rgba(136, 19, 55, 0.22)",
    borderLight: "#FECDD3", // rose-200
    borderDark: "rgba(244, 63, 94, 0.35)",
    iconBgLight: "#FFE4E6", // rose-100
    iconBgDark: "rgba(244, 63, 94, 0.25)",
    iconColor: "#E11D48",
    labelColorLight: "#9F1239",
    labelColorDark: "#FDA4AF",
    indicatorTextColorLight: "#BE123C",
    indicatorTextColorDark: "#FB7185",
    dotColor: "#F43F5E",
    shadowColor: "#F43F5E",
  },
  orange: {
    bgLight: "#FFF7ED", // Light orange-50
    bgDark: "rgba(124, 45, 18, 0.22)",
    borderLight: "#FED7AA", // orange-200
    borderDark: "rgba(249, 115, 22, 0.35)",
    iconBgLight: "#FFEDD5", // orange-100
    iconBgDark: "rgba(249, 115, 22, 0.25)",
    iconColor: "#EA580C",
    labelColorLight: "#9A3412",
    labelColorDark: "#FDBA74",
    indicatorTextColorLight: "#C2410C",
    indicatorTextColorDark: "#FB923C",
    dotColor: "#F97316",
    shadowColor: "#F97316",
  },
  cyan: {
    bgLight: "#ECFEFF", // Light cyan-50
    bgDark: "rgba(22, 78, 99, 0.22)",
    borderLight: "#A5F3FC", // cyan-200
    borderDark: "rgba(6, 182, 212, 0.35)",
    iconBgLight: "#CFFAFE", // cyan-100
    iconBgDark: "rgba(6, 182, 212, 0.25)",
    iconColor: "#0891B2",
    labelColorLight: "#155E75",
    labelColorDark: "#67E8F9",
    indicatorTextColorLight: "#0E7490",
    indicatorTextColorDark: "#22D3EE",
    dotColor: "#06B6D4",
    shadowColor: "#06B6D4",
  },
};

function getAutoColorScheme(label: string, indicatorType?: IndicatorType): StatCardColorScheme {
  const l = (label || "").toLowerCase();
  if (l.includes("project") || l.includes("site") || l.includes("assigned") || l.includes("order")) return "blue";
  if (l.includes("worker") || l.includes("labour") || l.includes("present") || l.includes("checked in") || l.includes("attendance")) return "emerald";
  if (l.includes("stock") || l.includes("inventory") || l.includes("material") || l.includes("overtime") || l.includes("low")) return "amber";
  if (l.includes("budget") || l.includes("revenue") || l.includes("earning") || l.includes("spent") || l.includes("cost") || l.includes("pay") || l.includes("estimate")) return "purple";
  if (l.includes("issue") || l.includes("delay") || l.includes("risk") || l.includes("late") || l.includes("danger")) return "rose";
  if (l.includes("transit") || l.includes("dispatch") || l.includes("progress") || l.includes("hour")) return "cyan";

  if (indicatorType === "danger") return "rose";
  if (indicatorType === "warning") return "amber";
  if (indicatorType === "success") return "emerald";
  return "blue";
}

function getDefaultIcon(label: string, scheme: StatCardColorScheme): keyof typeof Ionicons.glyphMap {
  const l = (label || "").toLowerCase();
  if (l.includes("project")) return "business-outline";
  if (l.includes("site")) return "location-outline";
  if (l.includes("user")) return "people-outline";
  if (l.includes("order")) return "receipt-outline";
  if (l.includes("worker") || l.includes("labour")) return "construct-outline";
  if (l.includes("present") || l.includes("day")) return "calendar-outline";
  if (l.includes("stock") || l.includes("material") || l.includes("inventory")) return "cube-outline";
  if (l.includes("alert") || l.includes("low")) return "alert-circle-outline";
  if (l.includes("budget") || l.includes("revenue") || l.includes("spent") || l.includes("earning") || l.includes("pay")) return "wallet-outline";
  if (l.includes("transit") || l.includes("delivery")) return "navigate-outline";
  if (l.includes("issue") || l.includes("late")) return "warning-outline";
  if (l.includes("progress")) return "trending-up-outline";
  if (l.includes("hour") || l.includes("time")) return "time-outline";

  switch (scheme) {
    case "blue": return "business-outline";
    case "emerald": return "checkmark-circle-outline";
    case "amber": return "alert-circle-outline";
    case "purple": return "wallet-outline";
    case "rose": return "warning-outline";
    case "orange": return "cube-outline";
    case "cyan": return "trending-up-outline";
    default: return "stats-chart-outline";
  }
}

export const StatCard = ({
  label,
  value,
  indicatorText,
  indicatorType = "neutral",
  icon,
  fullWidth,
  compact = false,
  colorScheme,
}: StatCardProps) => {
  const { isPhone, isTablet, isDesktop } = useResponsive();
  const { isDark } = useTheme();

  const scheme = colorScheme || getAutoColorScheme(label, indicatorType);
  const config = COLOR_CONFIGS[scheme] || COLOR_CONFIGS.blue;

  return (
    <View
      style={[
        {
          backgroundColor: isDark ? config.bgDark : config.bgLight,
          borderColor: isDark ? config.borderDark : config.borderLight,
          borderWidth: 1.2,
          borderRadius: 16,
          shadowColor: config.shadowColor,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0 : 0.07,
          shadowRadius: 8,
          elevation: 2,
        },
        !fullWidth && isTablet ? { flexBasis: "45%", flexGrow: 1, minWidth: 0 } : { minWidth: 0 },
      ]}
      className={`${compact ? "p-3" : "p-4 md:p-5"} ${
        fullWidth
          ? "w-full flex-grow min-w-0"
          : isPhone
          ? "w-full mb-3"
          : "flex-1 mx-1 md:mx-2 mb-3 md:mb-0"
      }`}
    >
      <View className="flex-row justify-between items-center mb-3">
        <Text
          style={{
            flexShrink: 1,
            minWidth: 0,
            color: isDark ? config.labelColorDark : config.labelColorLight,
          }}
          maxFontSizeMultiplier={1.3}
          className={`flex-1 min-w-0 text-xs font-bold tracking-wider ${
            compact ? "" : "pr-2 uppercase"
          }`}
        >
          {label}
        </Text>
        <View
          style={{
            width: compact ? 30 : 36,
            height: compact ? 30 : 36,
            borderRadius: 10,
            backgroundColor: isDark ? config.iconBgDark : config.iconBgLight,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon ? (
            icon
          ) : (
            <Ionicons
              name={getDefaultIcon(label, scheme)}
              size={compact ? 15 : 18}
              color={config.iconColor}
            />
          )}
        </View>
      </View>

      <AutoFitText
        value={value}
        maxFontSize={compact || !isDesktop ? 24 : 30}
        minFontSize={16}
        className="font-extrabold text-brand-text dark:text-white"
        containerStyle={{ marginBottom: 8 }}
        captionClassName="text-brand-text-muted"
      />

      {indicatorText ? (
        <View className="flex-row items-center gap-1.5 mt-auto">
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 3.5,
              backgroundColor:
                indicatorType === "danger"
                  ? "#EF4444"
                  : indicatorType === "warning"
                  ? "#F59E0B"
                  : indicatorType === "success"
                  ? "#10B981"
                  : config.dotColor,
            }}
          />
          <Text
            style={{
              flexShrink: 1,
              minWidth: 0,
              color:
                indicatorType === "danger"
                  ? "#DC2626"
                  : indicatorType === "warning"
                  ? "#D97706"
                  : indicatorType === "success"
                  ? "#059669"
                  : (isDark ? config.indicatorTextColorDark : config.indicatorTextColorLight),
            }}
            maxFontSizeMultiplier={1.3}
            className="flex-1 min-w-0 text-xs font-semibold"
          >
            {indicatorText}
          </Text>
        </View>
      ) : null}
    </View>
  );
};
