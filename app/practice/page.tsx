import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUserClaims } from "@/lib/auth/require-user-claims";
import { signOut } from "./actions";
import { PracticeSession } from "./practice-session";

export default async function PracticePage() {
  const supabase = await createClient();
  const claims = await requireUserClaims(supabase);
  const email = claims.email as string | undefined;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <p>Signed in as {email}</p>
      <PracticeSession />
      <Link href="/dashboard" className="underline">
        View your progress
      </Link>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-full border border-black/[.08] px-6 py-3 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
