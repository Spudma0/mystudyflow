# MyStudyFlow Backend

A small Express + TypeScript server that powers MyStudyFlow's two AI features using
the Claude API. The API key lives here on the server — **never** in the mobile app.

## Setup

1. Paste your Anthropic API key into [`.env`](.env) (get one at
   https://console.anthropic.com):

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

2. Install dependencies (already done if you ran `npm install` here):

   ```
   npm install
   ```

3. Start the server in dev mode (auto-reloads on changes):

   ```
   npm run dev
   ```

   You should see: `MyStudyFlow backend listening on http://localhost:3000`.

## Endpoints

| Method | Path                       | Purpose                                   |
| ------ | -------------------------- | ----------------------------------------- |
| GET    | `/health`                  | Returns `{ ok: true }`                     |
| POST   | `/api/timetable/transcribe`| Extract classes from a timetable image     |
| POST   | `/api/notes/summarize`     | Summarize notes + generate practice Q&A    |

The mobile app calls these from [`src/lib/ai.ts`](../src/lib/ai.ts).

## Connecting the app

The app reads the backend URL from `EXPO_PUBLIC_API_URL` (default
`http://localhost:3000`). Depending on where the app runs:

- **Web / iOS simulator:** `http://localhost:3000`
- **Android emulator:** `http://10.0.2.2:3000`
- **Physical device:** `http://<your-computer-LAN-IP>:3000` (same Wi-Fi)

Set it before starting Expo, e.g. in a project-root `.env`:

```
EXPO_PUBLIC_API_URL=http://192.168.1.50:3000
```

## Choosing a model (cost vs. quality)

Set `CLAUDE_MODEL` in `.env`. Rough per-import cost (one timetable image or a
couple of note pages):

| Model             | `CLAUDE_MODEL`      | Input $/1M | Output $/1M | Notes                          |
| ----------------- | ------------------- | ---------- | ----------- | ------------------------------ |
| Claude Haiku 4.5  | `claude-haiku-4-5`  | $1         | $5          | Cheapest; fine for extraction  |
| Claude Sonnet 5   | `claude-sonnet-5`   | $3         | $15         | Balanced                       |
| Claude Opus 4.8   | `claude-opus-4-8`   | $5         | $25         | Highest quality (default)      |

For high-volume timetable extraction, `claude-haiku-4-5` keeps costs very low.
