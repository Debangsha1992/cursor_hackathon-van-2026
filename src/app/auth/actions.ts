"use server";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export type ActionResult = { error: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;

// Email+password sign-in. Honors a `next` form field (set by the login page
// from its ?next= search param) so deep links bounce users back where they
// were trying to go. Falls back to /dashboard.
export async function signInAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = sanitizeNext(String(formData.get("next") ?? ""));

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (!EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Supabase returns "Invalid login credentials" verbatim — surface it as-is
      // so users can tell the difference between bad password and bad email.
      return { error: error.message };
    }

    revalidatePath("/", "layout");
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: friendlyError(err) };
  }
  redirect(next);
}

// Email+password sign-up. We use the service-role admin API with
// `email_confirm: true` so the account is usable immediately — the default
// `signUp()` path requires email verification and tends to trip the project's
// SMTP rate limit, which would silently break the form. After creating the
// confirmed user we immediately sign them in on the same request so the
// session cookie is set before we redirect.
export async function signUpAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (!EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return { error: `Password must be at least ${MIN_PASSWORD_LEN} characters.` };
  }
  if (confirm && confirm !== password) {
    return { error: "Passwords do not match." };
  }

  try {
    const admin = createSupabaseServiceRoleClient();
    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: displayName ? { display_name: displayName } : undefined,
    });

    if (createErr) {
      // Most common failure: the email is already registered. Supabase phrases
      // it as "A user with this email address has already been registered".
      // We forward the underlying message so the user knows whether to retry
      // with a different email or just sign in.
      return { error: createErr.message };
    }

    const supabase = await createSupabaseServerClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInErr) {
      // The account exists but we couldn't open a session — send the user to
      // the login page with their email pre-filled rather than leaving them
      // stranded on the signup screen.
      return { error: `Account created. Please sign in: ${signInErr.message}` };
    }

    revalidatePath("/", "layout");
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: friendlyError(err) };
  }
  redirect("/dashboard");
}

// Server-side sign-out. Always returns the user to the home page so the
// header re-renders without their email.
export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

function friendlyError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}

// Only allow same-origin pathname redirects after sign-in. Anything else
// (full URL, protocol-relative, missing leading slash) falls back to the
// default dashboard route to prevent open-redirect abuse via a crafted
// ?next= query string.
function sanitizeNext(raw: string): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//")) return "/dashboard";
  return raw;
}
