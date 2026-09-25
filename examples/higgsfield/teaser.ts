// Run from project root: bun --env-file=.env.local run examples/higgsfield/teaser.ts
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { config, higgsfield, APIError } from "@higgsfield/client/v2";

const directory = "output/x-teaser-01";
const videos = `${directory}/video`;
const shots = ["01-kingdom", "02-crown", "03-hunted"];
const exists = async (path: string) => access(path).then(() => true, () => false);

async function main() {
  const credentials = process.env.HF_CREDENTIALS?.trim();
  if (!credentials || credentials === "key-id:key-secret") throw new Error("credentials");
  config({ credentials, maxRetries: 0, maxPollTime: 15 * 60 * 1000, pollInterval: 5000 });
  await mkdir(videos, { recursive: true });
  const guide = await readFile(`${directory}/README.md`, "utf8");
  const prompts = [...guide.matchAll(/```text\n([\s\S]*?)\n```/g)].map(match => match[1]);
  if (prompts.length !== 3) throw new Error("prompts");

  for (const [index, shot] of shots.entries()) {
    const recordPath = `${videos}/${shot}.json`;
    const target = `${videos}/${shot}.mp4`;
    let record: { status: string; videoUrl?: string; requestId?: string } | undefined;
    if (await exists(recordPath)) record = JSON.parse(await readFile(recordPath, "utf8"));
    if (record && record.status !== "completed") {
      console.error(`${shot}: existing unresolved request; check dashboard before resubmission.`);
      process.exitCode = 1;
      return;
    }
    if (!record) {
      console.log(`${shot}: uploading starting image.`);
      const uploadResponse = await fetch("https://api.higgsfield.ai/files/generate-upload-url", {
        method: "POST",
        headers: { Authorization: `Key ${credentials}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content_type: "image/png" }),
      });
      if (!uploadResponse.ok) throw new Error(`upload-url HTTP ${uploadResponse.status}`);
      const upload = await uploadResponse.json() as {
        upload_url: string; public_url: string; upload_headers: Record<string, string>;
      };
      const bytes = await readFile(`${directory}/${shot}.png`);
      const stored = await fetch(upload.upload_url, {
        method: "PUT", headers: upload.upload_headers, body: bytes,
      });
      if (!stored.ok) throw new Error(`upload HTTP ${stored.status}`);
      const prompt = prompts[index] + " Audio: gentle seaside breeze and soft leaf rustle only. No speech, no vocals, no music, no dramatic impacts.";
      const input = { prompt, duration: 4, image_url: upload.public_url, resolution: "480p", output_format: "mp4", generate_audio: true };
      await writeFile(`${videos}/${shot}-input.json`, JSON.stringify(input, null, 2));
      await writeFile(recordPath, JSON.stringify({ status: "submitting", startedAt: new Date().toISOString() }, null, 2));
      console.log(`${shot}: submitting one 4-second 480p generation.`);
      const result = await higgsfield.subscribe("bytedance/seedance-2.5/image-to-video", { input, withPolling: true });
      if (result.status !== "completed" || !result.video?.url || !result.video.url.startsWith("https://")) {
        await writeFile(recordPath, JSON.stringify({ status: result.status, requestId: result.request_id }, null, 2));
        console.error(`${shot}: no completed video returned.`);
        process.exitCode = 1;
        return;
      }
      record = { status: "completed", requestId: result.request_id, videoUrl: result.video.url };
      await writeFile(recordPath, JSON.stringify(record, null, 2));
    }
    if (!(await exists(target))) {
      const video = await fetch(record.videoUrl!);
      if (!video.ok) throw new Error(`download HTTP ${video.status}`);
      await writeFile(target, Buffer.from(await video.arrayBuffer()));
    }
    console.log(`${shot}: completed and saved to ${target}`);
  }
}

main().catch((error: unknown) => {
  // Never log SDK errors or response bodies, which may contain credentials.
  console.error(error instanceof APIError && typeof error.statusCode === "number"
    ? `Higgsfield HTTP ${error.statusCode}; generation stopped. Check dashboard before retrying.`
    : "Upload, generation, or download failed. Check saved state and dashboard before retrying.");
  process.exitCode = 1;
});
