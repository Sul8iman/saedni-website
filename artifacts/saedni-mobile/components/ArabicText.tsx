import React from "react";
import { Text, StyleProp, TextStyle } from "react-native";

type ArabicTextProps = React.ComponentProps<typeof Text> & {
  style?: StyleProp<TextStyle>;
};

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
 *   Example:
 *     <View style={{ flexDirection: "row-reverse", width: "100%" }}>
 *       <Icon />
 *       <ArabicText style={{ flex: 1 }}>…</ArabicText>
 *     </View>
 *
 * DIAGNOSTIC BORDERS: The red borders show the actual rendered width of each
 *   Text box so you can confirm it spans the full parent width on device.
 *   Remove the borderWidth / borderColor lines before the production build.
 */
export default function ArabicText({ style, ...props }: ArabicTextProps) {
  return (
    <Text
      {...props}
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
    />
  );
}
