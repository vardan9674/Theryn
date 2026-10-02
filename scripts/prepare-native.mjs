#!/usr/bin/env node
// Copies the Firebase client configs (public identifiers, kept at the repo
// root) into the native projects before `cap sync`. Firebase reads them at
// runtime for push notifications. They are git-ignored inside ios/ and
// android/ so there is only one copy to keep up to date.
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pairs = [
  ["GoogleService-Info.plist", "ios/App/App/GoogleService-Info.plist"],
  ["google-services.json", "android/app/google-services.json"],
];
for (const [from, to] of pairs) {
  const src = join(root, from);
  if (!existsSync(src)) { console.warn(`! ${from} not found; push notifications won't work in this build`); continue; }
  if (!existsSync(dirname(join(root, to)))) continue;
  copyFileSync(src, join(root, to));
  console.log(`copied ${from} → ${to}`);
}
