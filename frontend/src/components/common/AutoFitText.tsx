import React, { useCallback, useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  StyleProp,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { compactDisplayValue } from '../../lib/amount';

/**
 * Approximate glyph advance widths (in em) for Inter / system sans at bold weight.
 * Intentionally slightly generous so the estimate errs on the side of fitting.
 */
const glyphWidth = (ch: string): number => {
  if (/[0-9]/.test(ch)) return 0.64;
  if (ch === ' ') return 0.28;
  if (/[.,:;'|!]/.test(ch)) return 0.3;
  if (/[il]/.test(ch)) return 0.3;
  if (/[\/\-()]/.test(ch)) return 0.4;
  if (/[MW%@]/.test(ch)) return 0.9;
  if (/[A-Z]/.test(ch)) return 0.72;
  return 0.6;
};

/** Estimated rendered width of `text` at `fontSize` px. */
export const estimateTextWidth = (text: string, fontSize: number): number => {
  let em = 0;
  for (const ch of text) em += glyphWidth(ch);
  return em * fontSize;
};

export interface AutoFitTextProps {
  /** Full value to display (already formatted, e.g. "Rs. 12,266,652,281.71"). */
  value: string | number;
  /** Largest font size used when space allows. */
  maxFontSize?: number;
  /** Smallest font size before switching to the compact value. */
  minFontSize?: number;
  /**
   * Shorter value used when the full value cannot fit at `minFontSize`.
   * Defaults to an auto-derived compact form ("Rs. 12.27B"). Pass `false` to disable.
   */
  compactValue?: string | false;
  /** When the compact value is shown, render the exact value underneath in small text. */
  showFullValueCaption?: boolean;
  className?: string;
  /** Text style (colour, weight…). Do not set fontSize here - it is computed. */
  style?: StyleProp<TextStyle>;
  captionClassName?: string;
  captionStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * Single-line text that scales its font to the available width instead of breaking
 * numbers mid-way (e.g. "Rs. 12,266,652,281\n.71"). Works on web and native:
 * width is measured with onLayout and the font size is computed from glyph metrics;
 * native additionally uses adjustsFontSizeToFit as a final safety net.
 */
export function AutoFitText({
  value,
  maxFontSize = 26,
  minFontSize = 14,
  compactValue,
  showFullValueCaption = true,
  className,
  style,
  captionClassName = 'text-gray-500',
  captionStyle,
  containerStyle,
  accessibilityLabel,
  testID,
}: AutoFitTextProps) {
  const [width, setWidth] = useState(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width);
    setWidth(prev => (prev === next ? prev : next));
  }, []);

  const full = String(value ?? '');
  const compact = compactValue === false ? null : compactValue ?? compactDisplayValue(full);

  const fitFor = (text: string) => {
    if (width <= 0) return maxFontSize;
    const unit = estimateTextWidth(text, 1);
    if (unit <= 0) return maxFontSize;
    // 4% breathing room for rounding and font differences.
    return Math.min(maxFontSize, Math.floor((width * 0.96) / unit));
  };

  const fullSize = fitFor(full);
  const useCompact = width > 0 && fullSize < minFontSize && !!compact && compact !== full;
  const display = useCompact ? (compact as string) : full;
  const fontSize = Math.max(minFontSize, useCompact ? fitFor(display) : fullSize);

  return (
    <View
      onLayout={onLayout}
      style={[{ alignSelf: 'stretch', minWidth: 0, maxWidth: '100%' }, containerStyle]}
      testID={testID}
    >
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        adjustsFontSizeToFit={Platform.OS !== 'web'}
        minimumFontScale={0.5}
        maxFontSizeMultiplier={1.3}
        accessibilityLabel={accessibilityLabel ?? full}
        className={className}
        style={[
          Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as any) : undefined,
          style,
          {
            fontSize,
            lineHeight: Math.round(fontSize * 1.25),
          },
        ]}
      >
        {display}
      </Text>
      {useCompact && showFullValueCaption && (
        <AutoFitText
          value={full}
          maxFontSize={12}
          minFontSize={9}
          compactValue={false}
          showFullValueCaption={false}
          className={captionClassName}
          style={captionStyle}
          accessibilityLabel={`Exact value ${full}`}
        />
      )}
    </View>
  );
}

export default AutoFitText;
