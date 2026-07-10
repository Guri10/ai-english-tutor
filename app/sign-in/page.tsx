import { SignInForm } from "./sign-in-form";

// Spec §4 auth failures: app/auth/callback/route.ts redirects here with
// ?error=auth-callback-failed on an expired/misused OAuth code — this is
// what actually shows that error rather than silently dropping it.
const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  "auth-callback-failed":
    "That sign-in link didn't work — it may have expired or already been used. Please sign in again.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}) {
  const { redirectTo, error } = await searchParams;
  const callbackError = error ? CALLBACK_ERROR_MESSAGES[error] : undefined;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="max-w-sm text-zinc-600 dark:text-zinc-400">
        Sign in with your Google account to get started.
      </p>
      <SignInForm redirectTo={redirectTo} initialError={callbackError} />
    </div>
  );
}
