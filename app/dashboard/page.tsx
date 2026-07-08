import { createClient } from "@/lib/supabase/server";
import { requireUserClaims } from "@/lib/auth/require-user-claims";
import { fetchDashboardData } from "@/lib/dashboard/fetch-dashboard-data";

export default async function DashboardPage() {
  const supabase = await createClient();
  const claims = await requireUserClaims(supabase);
  const userId = claims.sub as string;
  const dashboard = await fetchDashboardData(supabase, userId);

  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-6 py-12">
      <h1 className="text-2xl font-semibold">Your progress</h1>

      <div className="grid w-full max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Level" value={dashboard.levelScore} />
        <StatTile label="Current streak" value={String(dashboard.streakCount)} />
        <StatTile label="Longest streak" value={String(dashboard.longestStreak)} />
        <StatTile label="Sessions" value={String(dashboard.totalSessions)} />
      </div>

      <div className="w-full max-w-2xl">
        <h2 className="mb-3 text-lg font-medium">Recurring mistakes</h2>
        {dashboard.recurringMistakes.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">
            No recurring mistakes yet — they&apos;ll show up here after a few
            practice sessions.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dashboard.recurringMistakes.map((mistake) => (
              <li
                key={mistake.mistakeType}
                className="flex items-center justify-between rounded-lg border border-black/[.08] px-4 py-3 dark:border-white/[.145]"
              >
                <span className="font-medium">
                  {mistake.mistakeType.replace(/_/g, " ")}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400">
                  {mistake.occurrenceCount}×
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="w-full max-w-2xl">
        <h2 className="mb-3 text-lg font-medium">Recent progress</h2>
        {dashboard.recentLevelHistory.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">
            No completed sessions yet — your level over time will show up
            here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dashboard.recentLevelHistory.map((entry) => (
              <li
                key={entry.recordedAt}
                className="flex items-center justify-between rounded-lg border border-black/[.08] px-4 py-3 dark:border-white/[.145]"
              >
                <span className="font-medium">{entry.levelScore}</span>
                <span className="text-zinc-600 dark:text-zinc-400">
                  {new Date(entry.recordedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-black/[.08] px-4 py-5 text-center dark:border-white/[.145]">
      <span className="text-2xl font-semibold">{value}</span>
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
    </div>
  );
}
