// FCM v1 client for Supabase Edge Functions (Deno).
//
// Authenticates with the Firebase service account JSON via OAuth2 JWT-Bearer
// flow. Caches the access token in-memory for ~50 minutes. Sends one HTTP
// request per token (FCM v1 has no multicast endpoint, but with HTTP/2
// keep-alive this is fast and lets us return per-token failure reasons).
//
// Configure via environment variables:
//   FCM_SERVICE_ACCOUNT_JSON  - the full service-account JSON, as a string
//                               (download from Firebase Console -> Project
//                                Settings -> Service Accounts -> Generate
//                                new private key).

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

let cached: CachedToken | null = null;
let cachedAccount: ServiceAccount | null = null;

function loadServiceAccount(): ServiceAccount {
  if (cachedAccount) return cachedAccount;
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("FCM_SERVICE_ACCOUNT_JSON env var is not set");
  cachedAccount = JSON.parse(raw) as ServiceAccount;
  return cachedAccount;
}

// Convert PEM PKCS#8 to a CryptoKey for RS256 signing.
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string"
    ? new TextEncoder().encode(input)
    : input;
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function mintAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const sa = loadServiceAccount();
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const signingInput =
    `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const key = await importPrivateKey(sa.private_key);
  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64url(new Uint8Array(sigBuf))}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!resp.ok) {
    throw new Error(`OAuth token mint failed: ${resp.status} ${await resp.text()}`);
  }
  const json = await resp.json();
  cached = {
    token: json.access_token as string,
    expiresAt: Date.now() + ((json.expires_in as number) - 60) * 1000,
  };
  return cached.token;
}

export type Platform = "ios" | "android" | "web";

export interface PushPayload {
  title: string;
  body: string;
  data: Record<string, string>; // FCM data must be string-valued
  channel: string;              // Android channel id
  priority: "critical" | "high" | "medium" | "low";
  sound?: string;
  collapseKey?: string;
}

// Build the FCM v1 message envelope for a single token.
function buildMessage(token: string, platform: Platform, p: PushPayload) {
  const isCritical = p.priority === "critical" || p.priority === "high";

  // Android-specific config.
  const android = {
    priority: isCritical ? "HIGH" : "NORMAL",
    notification: {
      title: p.title,
      body: p.body,
      channel_id: p.channel,
      sound: p.sound ? p.sound.replace(/\.[^.]+$/, "") : undefined,
      // Replace prior notification with same tag instead of stacking.
      tag: p.collapseKey ?? undefined,
    },
    collapse_key: p.collapseKey ?? undefined,
  };

  // iOS / APNs-specific config.
  const apnsHeaders: Record<string, string> = {
    "apns-priority": isCritical ? "10" : "5",
    "apns-push-type": "alert",
  };
  if (p.collapseKey) apnsHeaders["apns-collapse-id"] = p.collapseKey;

  const apns = {
    headers: apnsHeaders,
    payload: {
      aps: {
        alert: { title: p.title, body: p.body },
        sound: p.sound ?? "default",
        "thread-id": p.collapseKey ?? p.channel,
        "interruption-level": isCritical ? "time-sensitive" : "active",
        // Server-driven badge would go here; for v1 we leave the OS to count.
      },
    },
  };

  return {
    message: {
      token,
      data: p.data,
      android,
      apns,
      // We deliberately omit the top-level `notification` so that platform-
      // specific configs control display. iOS and Android each render from
      // their own block above.
    },
  };
}

export interface SendResult {
  success: boolean;
  // Set when token should be removed from device_tokens (UNREGISTERED).
  deadToken?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export async function sendToToken(
  token: string,
  platform: Platform,
  payload: PushPayload,
): Promise<SendResult> {
  const sa = loadServiceAccount();
  const accessToken = await mintAccessToken();
  const url =
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  const body = JSON.stringify(buildMessage(token, platform, payload));
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body,
  });

  if (resp.ok) return { success: true };

  const errText = await resp.text();
  let errCode = "UNKNOWN";
  try {
    const parsed = JSON.parse(errText);
    errCode = parsed?.error?.details?.[0]?.errorCode ??
      parsed?.error?.status ?? "UNKNOWN";
  } catch { /* keep UNKNOWN */ }

  // FCM v1 dead-token signals.
  const dead = errCode === "UNREGISTERED" ||
    errCode === "INVALID_ARGUMENT" ||
    errCode === "NOT_FOUND" ||
    resp.status === 404;

  return {
    success: false,
    deadToken: dead,
    errorCode: errCode,
    errorMessage: errText.slice(0, 500),
  };
}
