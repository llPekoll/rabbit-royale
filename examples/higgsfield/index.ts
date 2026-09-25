// Server-side CLI only. Bun loads .env.local; never import this into the app.
import {
  APIError,
  AuthenticationError,
  NotEnoughCreditsError,
  TimeoutError,
  config,
  higgsfield,
} from "@higgsfield/client/v2";

async function main(): Promise<void> {
  const credentials = process.env.HF_CREDENTIALS?.trim();
  if (!credentials || credentials === "key-id:key-secret" || !/^[^:\s]+:[^:\s]+$/.test(credentials)) {
    console.error("Set HF_CREDENTIALS locally in .env.local to key-id:key-secret. No request was sent.");
    process.exitCode = 1;
    return;
  }

  config({
    credentials,
    maxRetries: 0, // Avoid resubmitting a billable POST after an ambiguous failure.
    maxPollTime: 10 * 60 * 1000,
    pollInterval: 3000,
  });

  console.error("Submitting one billable Seedance 2.5 request; waiting for completion…");
  const result = await higgsfield.subscribe("bytedance/seedance-2.5/text-to-video", {
    input: {
      prompt: "A cinematic scene at sunset",
      duration: 5,
      resolution: "480p",
      aspect_ratio: "16:9",
      output_format: "mp4",
      generate_audio: true,
    },
    withPolling: true,
  });

  // Treat all non-completed states as failure, including future SDK statuses.
  const status: string = result.status;
  if (status !== "completed") {
    const message = status === "canceled" || status === "cancelled"
      ? "Generation was canceled."
      : status === "nsfw" || status === "moderated"
        ? "Generation was blocked by moderation."
        : "Generation did not complete successfully.";
    console.error(message);
    process.exitCode = 1;
    return;
  }

  const url = result.video?.url;
  if (!url || !URL.canParse(url) || !["https:", "http:"].includes(new URL(url).protocol)) {
    console.error("Completed response did not contain a valid video URL.");
    process.exitCode = 1;
    return;
  }
  console.log(url);
}

main().catch((error: unknown) => {
  // Never log raw SDK errors: request configuration can contain auth headers.
  if (error instanceof AuthenticationError) {
    console.error("Higgsfield authentication failed. Check credentials locally.");
  } else if (error instanceof NotEnoughCreditsError) {
    console.error("Higgsfield refused the request: check available API credits and access.");
  } else if (error instanceof TimeoutError) {
    console.error("Polling timed out without confirmed completion. Check the Higgsfield dashboard before retrying; the request may still be running or canceled.");
  } else if (error instanceof APIError) {
    console.error("Higgsfield API request failed. Check the request in the dashboard before retrying.");
  } else {
    console.error("Generation could not be verified due to an SDK or network error. Check the dashboard before retrying.");
  }
  process.exitCode = 1;
});
