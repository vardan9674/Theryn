#!/usr/bin/env node
// Release gate for the iOS and Android apps. Run before every store upload:
//   npm run release:check
// It checks the things App Review and Google Play reject builds for, and the
// privacy promises Theryn makes. Exit code 1 means "don't ship yet".

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const has = (p) => existsSync(join(root, p));
const fails = [];
const warns = [];
const ok = [];
const check = (cond, pass, fail, warnOnly = false) => (cond ? ok.push(pass) : (warnOnly ? warns : fails).push(fail));

// ── Legal ────────────────────────────────────────────────────────────────
const legal = read("src/legal/legalConfig.js");
const todos = [...legal.matchAll(/^\s*(\w+):\s*"TODO/gm)].map((m) => m[1]);
check(todos.length === 0, "Privacy policy and terms facts are filled in", `Fill these in src/legal/legalConfig.js: ${todos.join(", ")}`);
for (const p of ["src/legal/PrivacyPolicy.jsx", "src/legal/Terms.jsx", "src/legal/DeleteAccountPage.jsx", "supabase/functions/delete-account/index.ts"]) {
  check(has(p), `${p} present`, `${p} is missing`);
}
check(/legalMatch/.test(read("src/main.jsx")), "/privacy, /terms and /delete-account are routed", "main.jsx no longer routes the legal pages");

// ── Version ──────────────────────────────────────────────────────────────
const version = JSON.parse(read("package.json")).version;
const pbx = has("ios/App/App.xcodeproj/project.pbxproj") ? read("ios/App/App.xcodeproj/project.pbxproj") : "";
const marketing = [...new Set([...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1]))];
check(marketing.length === 1 && marketing[0] === version, `iOS version ${version} matches package.json`, `iOS MARKETING_VERSION ${marketing.join("/") || "?"} ≠ package.json ${version}`);

// ── iOS ──────────────────────────────────────────────────────────────────
const plist = has("ios/App/App/Info.plist") ? read("ios/App/App/Info.plist") : "";
check(/ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(plist), "Export-compliance answer set (no custom encryption)", "Info.plist: add ITSAppUsesNonExemptEncryption = false");
check(!/<string>armv7<\/string>/.test(plist), "Device capability is arm64", "Info.plist still requires armv7");
check(!/<string>fetch<\/string>/.test(plist), "No unused background modes", "Info.plist declares the 'fetch' background mode, which the app doesn't use (rejection risk 2.5.4)");
check(has("ios/App/App/PrivacyInfo.xcprivacy") && /PrivacyInfo\.xcprivacy in Resources/.test(pbx), "Privacy manifest is bundled", "ios/App/App/PrivacyInfo.xcprivacy missing or not in the app target's resources");
if (has("ios/App/App/PrivacyInfo.xcprivacy")) {
  const pm = read("ios/App/App/PrivacyInfo.xcprivacy");
  check(/NSPrivacyTracking<\/key>\s*<false\/>/.test(pm), "Privacy manifest: no tracking", "Privacy manifest must declare NSPrivacyTracking = false");
}
const ent = has("ios/App/App/AppRelease.entitlements") ? read("ios/App/App/AppRelease.entitlements") : "";
check(/com\.apple\.developer\.applesignin/.test(ent), "Sign in with Apple entitlement", "Add Sign in with Apple to the entitlements (guideline 4.8)");
check(/signInWithApple/.test(read("src/App.jsx")), "Sign in with Apple offered on the sign-in screen", "The sign-in screen no longer offers Sign in with Apple");

// ── Android ──────────────────────────────────────────────────────────────
const manifest = has("android/app/src/main/AndroidManifest.xml") ? read("android/app/src/main/AndroidManifest.xml") : "";
check(/android:allowBackup="false"/.test(manifest), "Android backups exclude session data", "AndroidManifest: set android:allowBackup=\"false\"");
check(!/external-path/.test(has("android/app/src/main/res/xml/file_paths.xml") ? read("android/app/src/main/res/xml/file_paths.xml") : ""), "FileProvider limited to app folders", "file_paths.xml shares external storage");
const vars = has("android/variables.gradle") ? read("android/variables.gradle") : "";
const target = Number((vars.match(/targetSdkVersion = (\d+)/) || [])[1] || 0);
check(target >= 35, `Android targetSdk ${target}`, `Android targetSdk ${target} is below Google Play's minimum (35)`);
for (const perm of ["READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE", "ACCESS_FINE_LOCATION", "READ_CONTACTS", "CAMERA", "RECORD_AUDIO", "QUERY_ALL_PACKAGES", "USE_EXACT_ALARM"]) {
  check(!manifest.includes(`android.permission.${perm}`), `No ${perm}`, `AndroidManifest requests ${perm}, which needs a Play Console declaration`);
}

// ── Secrets never in git ─────────────────────────────────────────────────
let tracked = "";
try { tracked = execSync("git ls-files", { cwd: root, encoding: "utf8" }); } catch { warns.push("git not available; secret check skipped"); }
const secretFiles = tracked.split("\n").filter((f) => /^(ios|android)\/.*(google-services\.json|GoogleService-Info\.plist)$/.test(f) || /(\.p8|\.p12|\.jks|\.keystore|keystore\.properties|\.mobileprovision|service-account.*\.json|-fcm.*\.json)$/.test(f) || /(^|\/)\.env$/.test(f));
check(secretFiles.length === 0, "No keys, keystores or Firebase configs in git", `Remove from git: ${secretFiles.join(", ")}`);

// ── Report ───────────────────────────────────────────────────────────────
for (const m of ok) console.log(`  ✓ ${m}`);
for (const m of warns) console.log(`  ! ${m}`);
for (const m of fails) console.log(`  ✗ ${m}`);
console.log(fails.length ? `\n${fails.length} thing(s) to fix before a store release.` : "\nReady for a store build.");
process.exit(fails.length ? 1 : 0);
