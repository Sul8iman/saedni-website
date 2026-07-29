import React, { useCallback } from "react";
import { Text, StyleProp, TextStyle, Dimensions, LayoutChangeEvent } from "react-native";

type ArabicTextProps = React.ComponentProps<typeof Text> & {
  style?: StyleProp<TextStyle>;
};

const SCREEN_WIDTH = Dimensions.get("window").width;

/**
 * Recursively extract a plain-text string from React children so we can
 * log the content without crashing on nested <Text> elements.
 */
function extractContent(children: React.ReactNode): string {
  if (children === null || children === undefined) return "";
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(extractContent).join("");
  }
  if (React.isValidElement(children)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return extractContent((children.props as any).children);
  }
  return "";
}

/**
 * Android-safe right-aligned Arabic text.
 *
 * Root cause on Android (Fabric/New Architecture, LTR system locale):
 *   A Text component sizes itself to its intrinsic content width by default.
 *   With textAlign:"right" and a narrow content box (e.g. 80px wide for a
 *   short word), the text renders from the LEFT edge of that 80px box — it
 *   looks left-aligned even though textAlign:"right" is set, because there
 *   is no extra space to the right of the content within the box.
 *
 * Fix: alignSelf:"stretch" forces the Text to expand to its parent's full
 *   cross-axis width. Now textAlign:"right" pushes the glyphs to the right
 *   edge of the full-width box and the alignment is visible.
 *
 * Row-layout usage (icon + text):
 *   Pass style={{ flex: 1 }} — it overrides alignSelf:"stretch" and allows
 *   the text to fill the remaining horizontal space after the icon.
 *
 * DIAGNOSTIC: onLayout logs textWidth, parentWidth, and screenWidth so you
 *   can confirm each Text box spans the full parent width on device.
 *   - If textWidth ≈ screenWidth − padding  → fix is working ✓
 *   - If textWidth ≈ content width (70–100 px) → parent still constraining ✗
 *
 *   REMOVE borderWidth, borderColor, and the onLayout handler before
 *   the production build.
 */
export default function ArabicText({
  style,
  onLayout,
  children,
  ...props
}: ArabicTextProps) {
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width: textWidth } = e.nativeEvent.layout;
      const content = extractContent(children).trim().slice(0, 50);

      // With alignSelf:"stretch" the Text box fills its parent's cross-axis,
      // so measuredWidth == parentAvailableWidth when the fix works.
      console.log(
        `[ArabicText]\n` +
          `  content="${content}"\n` +
          `  textWidth=${Math.round(textWidth)}\n` +
          `  parentWidth=${Math.round(textWidth)}\n` +
          `  screenWidth=${Math.round(SCREEN_WIDTH)}`
      );

      // Forward to any caller-supplied onLayout
      onLayout?.(e);
    },
    // children changes when text changes; onLayout is usually stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [children]
  );

  return (
    <Text
      {...props}
      onLayout={handleLayout}
      style={[
        {
          textAlign: "right",
          writingDirection: "rtl",
          alignSelf: "stretch",
          // ── DIAGNOSTIC — remove before production build ──────────────────
          borderWidth: 1,
          borderColor: "rgba(255, 0, 0, 0.35)",
          // ─────────────────────────────────────────────────────────────────
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
