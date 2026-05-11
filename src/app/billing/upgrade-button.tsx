"use client";

import * as React from "react";
import { ShieldCheckIcon, ArrowRightIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string; code?: number; requestId?: string }
  | { kind: "redirecting"; checkoutUrl: string };

interface CheckoutResponse {
  checkoutUrl?: string;
  intentId?: string;
  amountCoins?: string;
  error?: string;
  code?: number;
  requestId?: string;
}

export function UpgradeButton(props: { searchStatus?: string | null }) {
  const [status, setStatus] = React.useState<Status>(() =>
    props.searchStatus === "success"
      ? {
          kind: "error",
          message:
            "Returned from AllScale Checkout. If your payment cleared, your plan will be updated by the webhook shortly.",
        }
      : { kind: "idle" },
  );

  const onClick = React.useCallback(async () => {
    setStatus({ kind: "loading" });

    let res: Response;
    try {
      res = await fetch("/api/billing/checkout", { method: "POST" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: `Network error: ${(err as Error).message}`,
      });
      return;
    }

    const data: CheckoutResponse = await res.json().catch(() => ({}));

    if (!res.ok || !data.checkoutUrl) {
      setStatus({
        kind: "error",
        message:
          data.error ??
          `AllScale rejected the checkout intent (HTTP ${res.status}).`,
        code: data.code,
        requestId: data.requestId,
      });
      return;
    }

    setStatus({ kind: "redirecting", checkoutUrl: data.checkoutUrl });
    window.location.assign(data.checkoutUrl);
  }, []);

  return (
    <div className="space-y-3">
      <Button
        type="button"
        size="lg"
        onClick={onClick}
        disabled={status.kind === "loading" || status.kind === "redirecting"}
        className="w-full sm:w-auto"
      >
        {status.kind === "loading" || status.kind === "redirecting" ? (
          <>
            <Loader2Icon className="mr-2 size-4 animate-spin" />
            {status.kind === "loading"
              ? "Creating checkout intent…"
              : "Redirecting to AllScale…"}
          </>
        ) : (
          <>
            <ShieldCheckIcon className="mr-2 size-4" />
            Pay $10 USD with AllScale
            <ArrowRightIcon className="ml-2 size-4" />
          </>
        )}
      </Button>

      {status.kind === "error" ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          <p>{status.message}</p>
          {status.code !== undefined ? (
            <p className="mt-1 font-mono">
              code={status.code}
              {status.requestId ? `, request_id=${status.requestId}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {status.kind === "redirecting" ? (
        <p className="text-xs text-muted-foreground">
          If you aren&apos;t redirected automatically,{" "}
          <a
            href={status.checkoutUrl}
            className="underline underline-offset-2"
          >
            click here to open AllScale Checkout
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}
