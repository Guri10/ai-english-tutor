# AI English Tutor

A web app for friends and family (ages 10+) to practice spoken English with an AI tutor over voice. The AI holds a level-appropriate conversation, corrects mistakes in a style the student chooses (live, in-voice, or all at once at the end), and tracks progress — level, streaks, recurring mistake patterns — across sessions so future conversations adapt to the student.

Live at [ai-english-tutor-beta.vercel.app](https://ai-english-tutor-beta.vercel.app).

## How it works

1. Sign in with Google.
2. Tap **Start practice**. The app reads your level and known weak spots, picks a scenario, and the tutor opens with a spoken greeting — no manual scenario picker.
3. Push-to-talk: hold the mic button to speak, release to send. It's turn-based, like a walkie-talkie, not a live phone call.
4. Choose a correction style before you start: get corrected briefly, in-voice, right when a mistake happens, or save every correction for a recap at the end.
5. End the session to get a recap — updated level, streak, and (in end-of-session mode) the mistakes made along the way.

## Stack

- **Frontend:** Next.js (App Router), Tailwind, deployed on Vercel. Mobile-first — primary target is iPhone Safari.
- **Auth/DB:** Supabase — Google OAuth, Postgres (RLS-scoped to each signed-in user).
- **Conversation + voice:** OpenAI Realtime API for speech-to-text, tutor logic, and text-to-speech in one session; a separate OpenAI structured-output call summarizes each session afterward (level, mistakes, topics covered).

Full architecture, data model, and error-handling design: [docs/superpowers/specs/2026-07-07-ai-speaking-practice-design.md](docs/superpowers/specs/2026-07-07-ai-speaking-practice-design.md).

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

You'll need:

- A [Supabase](https://supabase.com) project, with the Google OAuth provider enabled and this repo's migrations applied (`supabase/migrations/`, via `supabase db push --linked`).
- An [OpenAI](https://platform.openai.com) API key with access to the Realtime API.

| Variable | Where it's used |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |
| `OPENAI_API_KEY` | Server-only — mints Realtime session tokens and runs post-session summarization; never sent to the browser |

## Testing

```bash
npm test        # vitest — deterministic logic only, Realtime/OpenAI calls mocked
npm run lint
npm run build
```

## Project state & workflow

This repo is built issue-by-issue by a coding agent, with a written workflow in [AGENTS.md](AGENTS.md) (issue tracker conventions, the implement → review → close cycle) and a running progress log in [current_state.md](current_state.md) — read that first before picking up any work here. Issues are tracked as [GitHub Issues](https://github.com/Guri10/ai-english-tutor/issues) on this repo, chained in dependency order through the design spec's vertical slices.
