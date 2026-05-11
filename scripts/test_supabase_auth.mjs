// One-shot connectivity probe for the Supabase project. Run with:
//   node scripts/test_supabase_auth.mjs
// It hits /auth/v1/settings (always public) and attempts a throwaway
// signUp() to confirm the publishable key is wired correctly. Safe to
// delete once the auth flow is verified.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://zsrxnxjjgsiahlhtcshy.supabase.co";
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_0rFTu-zXOXRU9utjj9vXCA_wbmgclso";

const supabase = createClient(url, key);

console.log("--- /auth/v1/settings ---");
const settings = await fetch(`${url}/auth/v1/settings`, {
  headers: { apikey: key },
}).then((r) => r.json());
console.log("external providers enabled:", Object.entries(settings.external ?? {})
  .filter(([, v]) => v === true)
  .map(([k]) => k));
console.log("disable_signup:", settings.disable_signup);
console.log("mailer_autoconfirm:", settings.mailer_autoconfirm);

console.log("\n--- signUp throwaway ---");
const testEmail = `paperpilot-test-${Date.now()}@gmail.com`;
const { data, error } = await supabase.auth.signUp({
  email: testEmail,
  password: "paperpilot-strong-pw-123",
});
if (error) {
  console.log("signUp error:", error.status, error.message);
  process.exitCode = 1;
} else {
  console.log("signUp ok. user id:", data.user?.id);
  console.log("session returned?", !!data.session);
}
