import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function PracticePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/sign-in");
  }

  const email = data.claims.email as string | undefined;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p>Signed in as {email}</p>
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
