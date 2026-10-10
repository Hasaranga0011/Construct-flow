import React from "react";
import { View, Text } from "react-native";

import { useResponsive } from "../../hooks/useResponsive";

export type IndicatorType = "success" | "warning" | "danger" | "neutral";

interface StatCardProps {
  label: string;
  value: string | number;
  indicatorText?: string;
  indicatorType?: IndicatorType;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  compact?: boolean;
}

export const StatCard = ({
  label,
  value,
  indicatorText,
  indicatorType = "neutral",
  icon,
  fullWidth,
  compact = false,
}: StatCardProps) => {
  const { isPhone, isTablet } = useResponsive();

  const getIndicatorColor = () => {
    switch (indicatorType) {
      case "success":
        return "text-green-600";
      case "warning":
        return "text-yellow-600";
      case "danger":
        return "text-red-600";
      default:
        return "text-gray-500";
    }
  };

  return (
    <View
      style={
        !fullWidth && isTablet ? { flexBasis: "45%", flexGrow: 1 } : undefined
      }
      className={`bg-white rounded-lg ${compact ? "p-2" : "p-4 md:p-5"} shadow-sm border border-gray-100 ${fullWidth ? "w-full flex-grow min-w-0" : isPhone ? "w-full mb-3" : "flex-1 mx-1 md:mx-2 mb-3 md:mb-0"}`}
    >
      <View className="flex-row justify-between items-start mb-2">
        <Text
          style={{ flexShrink: 1, minWidth: 0 }}
          maxFontSizeMultiplier={1.3}
          className={`flex-1 min-w-0 text-brand-text-muted text-xs font-semibold ${compact ? "" : "pr-2 uppercase"}`}
        >
          {label}
        </Text>
        {icon ? (
          <View>{icon}</View>
        ) : !compact ? (
          <View className="w-4 h-4 bg-gray-200 rounded-full" />
        ) : null}
      </View>

      <Text
        style={{ flexShrink: 1, minWidth: 0 }}
        maxFontSizeMultiplier={1.3}
        className={`${compact ? "text-2xl" : "text-2xl md:text-3xl"} font-bold text-brand-text mb-2`}
      >
        {value}
      </Text>

      <View className="flex-row items-center mt-auto">
        <Text
          style={{ flexShrink: 1, minWidth: 0 }}
          maxFontSizeMultiplier={1.3}
          className={`flex-1 min-w-0 text-xs font-medium ${getIndicatorColor()}`}
        >
          {indicatorText}
        </Text>
      </View>
    </View>
  );
};
