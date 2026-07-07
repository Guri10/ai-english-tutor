import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="max-w-sm text-zinc-600 dark:text-zinc-400">
        Enter your email and we&apos;ll send you a magic link to sign in.
      </p>
      <SignInForm redirectTo={redirectTo} />
    </div>
  );
}
