import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">AI English Tutor</h1>
      <p className="max-w-sm text-zinc-600 dark:text-zinc-400">
        Practice spoken English with an AI tutor that corrects you as you go.
      </p>
      <Link
        href="/sign-in"
        className="rounded-full bg-foreground px-6 py-3 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
      >
        Sign in
      </Link>
    </div>
  );
}
