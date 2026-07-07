"use client";

import { useActionState } from "react";
import { requestMagicLink, type MagicLinkState } from "./actions";

const initialState: MagicLinkState = { status: "idle" };

export function SignInForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction, pending] = useActionState(
    requestMagicLink,
    initialState
  );

  if (state.status === "sent") {
    return <p role="status">Check your email for a sign-in link.</p>;
  }

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      {redirectTo && (
        <input type="hidden" name="redirectTo" value={redirectTo} />
      )}
      <input
        type="email"
        name="email"
        required
        placeholder="you@example.com"
        autoComplete="email"
        className="rounded-full border border-black/[.08] px-5 py-3 dark:border-white/[.145]"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-foreground px-6 py-3 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {pending ? "Sending…" : "Send magic link"}
      </button>
      {state.status === "error" && (
        <p role="alert" className="text-red-600">
          {state.message}
        </p>
      )}
    </form>
  );
}
