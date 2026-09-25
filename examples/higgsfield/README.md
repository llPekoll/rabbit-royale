# Seedance 2.5 example

Server-side TypeScript with the official `@higgsfield/client/v2` SDK and Bun.

1. Edit the ignored project-root `.env.local` locally. Set `HF_CREDENTIALS=key-id:key-secret` using your actual key ID and secret. Never paste credentials into chat or use a `VITE_` prefix.
2. From the project root, run `bun run higgsfield:example`.

Each run with valid credentials submits one billable text-to-video request: `A cinematic scene at sunset`, 5 seconds, 480p, 16:9, MP4, with audio enabled. The resolution was lowered for the test at the user's request. Bun loads `.env.local` at runtime; no additional loader is required. Keep this example outside the browser application.

The script waits with `subscribe` and prints only the video URL to stdout after a completed response with a valid URL. Errors go to stderr with a nonzero exit code. Raw SDK errors and credentials are never printed. Submission retries are disabled to avoid duplicate billable requests after ambiguous network failures.

Polling is bounded to ten minutes. SDK 0.2.6 recognizes `completed`, `failed`, and `nsfw` as polling terminal states; a cancellation reported with another status can therefore time out. The example never treats cancellation or a timeout as success. Check the dashboard before repeating a request after any timeout or ambiguous failure.

Official references read before implementation:
- https://docs.higgsfield.ai/docs/how-to/sdk
- https://console.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/api-reference
