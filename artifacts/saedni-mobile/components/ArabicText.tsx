import React from "react";
import { Text, Platform, StyleProp, TextStyle } from "react-native";

type ArabicTextProps = React.ComponentProps<typeof Text> & {
  style?: StyleProp<TextStyle>;
};

/**
 * Right-aligned Arabic text — iOS behaviour matches v1.0.1 exactly.
 *
 * iOS:  textAlign:"right" only.
 *       iOS renders Arabic glyphs correctly via the Unicode bidi algorithm
 *       with no additional configuration.  Do NOT add writingDirection or any
 *       I18nManager override — that injects native RTL which swaps the
 *       physical direction and moves text to the left.
 *
 * Android: textAlign:"right" + alignSelf:"stretch".
 *       Fabric/New Architecture sizes Text to its intrinsic content width.
 *       alignSelf:"stretch" expands the box to the parent width so the
 *       right-alignment is visible.  I18nManager.forceRTL is set at app
 *       start (Android-only, in _layout.tsx).
 *
 * Row-layout (icon + label): pass style={{ flex: 1 }} to override alignSelf.
 */
export default function ArabicText({ style, ...props }: ArabicTextProps) {
  const baseStyle: TextStyle = {
    textAlign: "right",
    ...Platform.select({
      android: {
        alignSelf: "stretch",
      },
    }),
  };

  return (
    <Text
      {...props}
      style={[baseStyle, style]}
    />
  );
}
