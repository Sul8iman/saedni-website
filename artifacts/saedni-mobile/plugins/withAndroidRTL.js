// @ts-check
const { withAndroidManifest, withMainActivity } = require("@expo/config-plugins");

/**
 * withAndroidRTL — forces native Android RTL before Fabric/React Native
 * initialises, so Arabic layout is correct from the very first launch on
 * any device locale — no restart, no white flash, no expo-updates dependency.
 *
 * Two-layer defence:
 *
 *   Layer 1 — AndroidManifest.xml
 *     Sets android:layoutDirection="rtl" on <application> and every
 *     <activity>.  The OS creates every Window/View in RTL mode before any
 *     Java/Kotlin code runs.
 *
 *   Layer 2 — MainActivity.kt (or .java)
 *     Injects
 *       window.decorView.layoutDirection = View.LAYOUT_DIRECTION_RTL
 *     at the very start of the existing onCreate() body — BEFORE
 *     super.onCreate() — so Fabric's root ShadowNode sees RTL even if the
 *     manifest value were somehow ignored.
 *
 *     This plugin MUST be listed LAST in app.json's "plugins" array so that
 *     it runs after expo-splash-screen (and any other plugin) has already
 *     added its own onCreate content.  We inject into the existing override
 *     rather than creating a second one (which would be a compile error).
 *
 * iOS is unaffected — both mods are Android-only.
 */
const withAndroidRTL = (config) => {
  config = applyManifest(config);
  config = applyMainActivity(config);
  return config;
};

// ── Layer 1: AndroidManifest.xml ────────────────────────────────────────────

function applyManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application?.[0];
    if (!application) {
      console.warn("[withAndroidRTL] <application> element not found in AndroidManifest.xml");
      return config;
    }

    // Force RTL on the <application> element — inherited by all activities
    application.$["android:layoutDirection"] = "rtl";

    // Belt-and-suspenders: also set it explicitly on every <activity>
    for (const activity of application.activity ?? []) {
      activity.$["android:layoutDirection"] = "rtl";
    }

    return config;
  });
}

// ── Layer 2: MainActivity ────────────────────────────────────────────────────

function applyMainActivity(config) {
  return withMainActivity(config, (config) => {
    const lang = config.modResults.language;
    const src = config.modResults.contents;

    if (lang === "kt") {
      config.modResults.contents = patchKotlin(src);
    } else {
      config.modResults.contents = patchJava(src);
    }

    return config;
  });
}

/**
 * Patch Kotlin MainActivity.  Idempotent — does nothing if already patched.
 *
 * Strategy:
 *   A) If an override fun onCreate already exists (added by expo-splash-screen
 *      or another plugin), inject our RTL line at the very start of its body
 *      — we do NOT add a second onCreate (that would be a compile error).
 *   B) If no onCreate exists yet, insert our own complete override after the
 *      class opening brace.
 */
function patchKotlin(src) {
  // Guard: already patched
  if (src.includes("LAYOUT_DIRECTION_RTL")) return src;

  // 1. Ensure "import android.view.View" is present
  if (!src.includes("import android.view.View")) {
    // Insert right after "import android.os.Bundle"
    src = src.replace(
      /(import android\.os\.Bundle\n)/,
      "$1import android.view.View\n"
    );
    // Fallback: insert after the last "import android." line
    if (!src.includes("import android.view.View")) {
      src = src.replace(
        /(import android\.[^\n]+\n)(?!import android\.)/,
        "$1import android.view.View\n"
      );
    }
  }

  const rtlLine =
    "    // Force RTL before Fabric creates the root ShadowNode\n" +
    "    window.decorView.layoutDirection = View.LAYOUT_DIRECTION_RTL\n";

  // 2a. INJECT into existing onCreate override (strategy A)
  //     Match the exact pattern Expo generates:
  //       override fun onCreate(savedInstanceState: Bundle?) {\n
  const existingOnCreate =
    /(  override fun onCreate\(savedInstanceState: Bundle\?\) \{)(\n)/;

  if (existingOnCreate.test(src)) {
    src = src.replace(existingOnCreate, `$1$2${rtlLine}`);
    return src;
  }

  // 2b. No existing onCreate — insert our own complete override (strategy B)
  const onCreateBlock = [
    "",
    "  override fun onCreate(savedInstanceState: Bundle?) {",
    "    // Force RTL before Fabric creates the root ShadowNode",
    "    window.decorView.layoutDirection = View.LAYOUT_DIRECTION_RTL",
    "    super.onCreate(savedInstanceState)",
    "  }",
    "",
  ].join("\n");

  src = src.replace(
    /(class MainActivity : ReactActivity\(\) \{)/,
    `$1${onCreateBlock}`
  );

  return src;
}

/**
 * Patch Java MainActivity.  Idempotent.
 */
function patchJava(src) {
  if (src.includes("LAYOUT_DIRECTION_RTL")) return src;

  if (!src.includes("import android.view.View;")) {
    src = src.replace(
      /(import android\.os\.Bundle;)/,
      "$1\nimport android.view.View;"
    );
  }

  const rtlLine =
    "    // Force RTL before Fabric creates the root ShadowNode\n" +
    "    getWindow().getDecorView().setLayoutDirection(View.LAYOUT_DIRECTION_RTL);\n";

  // Inject into existing onCreate if present
  const existingOnCreate =
    /(@Override\s+protected void onCreate\(android\.os\.Bundle savedInstanceState\) \{)(\n)/;
  if (existingOnCreate.test(src)) {
    src = src.replace(existingOnCreate, `$1$2${rtlLine}`);
    return src;
  }

  // No existing onCreate — insert our own
  const onCreateJava = [
    "",
    "  @Override",
    "  protected void onCreate(android.os.Bundle savedInstanceState) {",
    "    // Force RTL before Fabric creates the root ShadowNode",
    "    getWindow().getDecorView().setLayoutDirection(View.LAYOUT_DIRECTION_RTL);",
    "    super.onCreate(savedInstanceState);",
    "  }",
    "",
  ].join("\n");

  src = src.replace(
    /(public class MainActivity extends ReactActivity \{)/,
    `$1${onCreateJava}`
  );

  return src;
}

module.exports = withAndroidRTL;
