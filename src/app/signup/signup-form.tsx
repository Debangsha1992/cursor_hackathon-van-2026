"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { signUpAction } from "../auth/actions";

type Props = {
  initialError?: string;
};

export function SignupForm({ initialError }: Props) {
  const [error, setError] = useState<string | undefined>(initialError);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isPending, startTransition] = useTransition();

  const passwordsMatch = confirm.length === 0 || password === confirm;
  const passwordLongEnough = password.length === 0 || password.length >= 8;
  const submitDisabled =
    isPending || !passwordsMatch || !passwordLongEnough;

  async function onSubmit(formData: FormData) {
    setError(undefined);
    startTransition(async () => {
      const result = await signUpAction(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <form
      action={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-border/60 bg-card/40 p-6"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="display_name">Display name (optional)</Label>
        <Input
          id="display_name"
          name="display_name"
          type="text"
          autoComplete="name"
          maxLength={64}
          placeholder="How should we address you?"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          aria-invalid={!passwordLongEnough || undefined}
        />
        {!passwordLongEnough ? (
          <p className="text-xs text-destructive">
            Password must be at least 8 characters.
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm_password">Confirm password</Label>
        <Input
          id="confirm_password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Re-enter your password"
          aria-invalid={!passwordsMatch || undefined}
        />
        {!passwordsMatch ? (
          <p className="text-xs text-destructive">Passwords don&apos;t match.</p>
        ) : null}
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitDisabled}>
        {isPending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-xs text-muted-foreground">
        By creating an account you agree to PaperPilot&apos;s paper-trading
        disclaimer. No live execution, ever.
      </p>
    </form>
  );
}
