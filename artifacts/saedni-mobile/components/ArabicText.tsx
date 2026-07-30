import React, { useCallback } from "react";
import {
  Text,
  StyleProp,
  TextStyle,
  Dimensions,
  LayoutChangeEvent,
  StyleSheet,
  I18nManager,
} from "react-native";

type ArabicTextProps = React.ComponentProps<typeof Text> & {
  style?: StyleProp<TextStyle>;
};

const SCREEN_WIDTH = Dimensions.get("window").width;

function extractContent(children: React.ReactNode): string {
  if (children === null || children === undefined) return "";
  if (typeof children === "string" || typeof children === "number")
    return String(children);
  if (Array.isArray(children)) return children.map(extractContent).join("");
  if (React.isValidElement(children))
    return extractContent((children.props as { children?: React.ReactNode }).children);
  return "";
}

/**
 * Android-safe right-aligned Arabic text (diagnostic build).
 * DIAGNOSTIC borders and logs — remove before production.
 */
export default function ArabicText({
  style,
  onLayout,
  children,
  ...props
}: ArabicTextProps) {
  const baseStyle: TextStyle = {
    textAlign: "right",
    writingDirection: "rtl",
    alignSelf: "stretch",
    // ── DIAGNOSTIC border — remove before production ────
    borderWidth: 1,
    borderColor: "rgba(255, 0, 0, 0.35)",
    // ────────────────────────────────────────────────────
  };

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width: textWidth } = e.nativeEvent.layout;
      const content = extractContent(children).trim().slice(0, 50);

      // Resolve the final merged style so we can see what actually applied
      const resolved = StyleSheet.flatten([baseStyle, style]) as TextStyle;

      console.log(
        `[ArabicText]\n` +
          `  content="${content}"\n` +
          `  textWidth=${Math.round(textWidth)}\n` +
          `  parentWidth=${Math.round(textWidth)}\n` +
          `  screenWidth=${Math.round(SCREEN_WIDTH)}\n` +
          `  --- computed style ---\n` +
          `  textAlign="${resolved.textAlign}"\n` +
          `  writingDirection="${resolved.writingDirection}"\n` +
          `  alignSelf="${resolved.alignSelf}"\n` +
          `  --- I18nManager state ---\n` +
          `  isRTL=${I18nManager.isRTL}\n` +
          `  doLeftAndRightSwapInRTL=${I18nManager.doLeftAndRightSwapInRTL}`
      );

      onLayout?.(e);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [children]
  );

  return (
    <Text
      {...props}
      onLayout={handleLayout}
      style={[baseStyle, style]}
    >
      {children}
    </Text>
  );
}
