// The whole HQ part of an episode in ONE Seedance generation (billable):
//   bun --env-file=.env.local run examples/higgsfield/episode-video.ts
//   one clip per style: clay | pixel3d | real — `episode-video.ts clay`
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { config, higgsfield, APIError } from "@higgsfield/client/v2";

const episode = "episodes/ep01-carotte-bombe/shots";
const out = `${episode}/out`;
const RING = " Around the brown rabbit, a ring of glowing yellow tiles on the ground ROTATES continuously around it, clearly spinning like a turning wheel and following it as it hops, a player marker.";
const styles: Record<string, { refs: string[]; look: string; ring: boolean }> = {
  clay: {
    refs: ["cool/da-clay-v1.png", "refs/brown-idle-x16.png"],
    look: "Stop-motion claymation exactly like image 1: matte plasticine characters with thumbprints, handmade miniature set, felt grass, clay pines and mushrooms, real studio light, slight stop-motion stepping in the motion. EVERY shot stays stop-motion clay: the pine trees, bushes and mushrooms are the same sculpted clay props in every shot, never flat illustrated game art.",
    ring: true,
  },
  pixel3d: {
    refs: ["cool/pixel3d-clean.png", "refs/brown-idle-x16.png", "refs/game-screenshot.png"],
    look: "Stylized 3D pixel render exactly like image 1: characters and carrot built from chunky pixel cubes, soft warm cinematic light, shallow depth of field, blurred pines and cliffs behind. The white rabbit's chest and belly are one plain uniform surface.",
    ring: false,
  },
  real: {
    refs: ["cool/env-real-v1.png", "refs/white-stand-x16.png", "refs/brown-idle-x16.png"],
    look: "Real photographic world exactly like image 1: real grass, real rocks, real pines, real sea at golden hour, 35mm lens. The rabbits and the carrot stay FLAT low-resolution pixel sprites with visible square pixels, like glitches in reality, casting real shadows.",
    ring: false,
  },
};

const prompt = (look: string, ring: boolean) => `One continuous 8-second clip, square format. Same characters, same place, same light in every shot.
Image 1 is the hero (a white rabbit), the carrot and the exact look. Image 2 is a second rabbit: the exact same character design, but BROWN. ${look}

SHOT 1 (0s to 2s): wide shot of a small sunny clearing. The grass is empty, only a small tuft of green carrot leaves pokes out of the ground in the centre. The white rabbit hops in, grabs the leaves with both paws, leans back and pulls: a GIGANTIC carrot bursts out of the ground, dirt and grass flying.

SHOT 2 (2s to 3.5s): a smooth continuous zoom-in lasting the whole shot, from the wide shot to a medium close-up, facing camera. The rabbit lifts the giant carrot high above its head with both arms, trophy pose, eyes closed in pure happiness, ears straight up.

SHOT 3 (3.5s to 4.3s): same close framing. A sudden hard orange flash lights the right side of its face from off-screen right. Its eyes snap open, ears jolt upright, head starts turning right. Hard cut in the middle of the head turn. No fire visible in this shot.

SHOT 4 (4.3s to 8s): wide shot from behind the white rabbit. It is small in the bottom-left foreground, seen from behind, carrot still held high, completely frozen, it never reacts. In the background on the right, the brown rabbit hops in happily.${ring ? RING : ""} It steps on a patch of ground that explodes: orange fireball, shockwave ring on the ground, dirt chunks. The brown rabbit is launched backwards in a low arc, spinning twice, keeping its rabbit shape and ears the whole time, lands flat further away and bounces once. Black smoke drifts up. Short camera shake at the explosion.

No text, no letters, no logo, no UI. No clothes. No morphing: characters keep their shape and colours in every shot.`;
const exists = (path: string) => access(path).then(() => true, () => false);

async function upload(credentials: string, path: string): Promise<string> {
  const response = await fetch("https://api.higgsfield.ai/files/generate-upload-url", {
    method: "POST",
    headers: { Authorization: `Key ${credentials}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content_type: "image/png" }),
  });
  if (!response.ok) throw new Error(`upload-url HTTP ${response.status}`);
  const target = await response.json() as { upload_url: string; public_url: string; upload_headers: Record<string, string> };
  const stored = await fetch(target.upload_url, { method: "PUT", headers: target.upload_headers, body: await readFile(path) });
  if (!stored.ok) throw new Error(`upload HTTP ${stored.status}`);
  return target.public_url;
}

async function main() {
  const style = styles[process.argv[2] ?? ""];
  if (!style) throw new Error(`style: one of ${Object.keys(styles).join(", ")}`);
  const refs = style.refs;
  const tag = `hq2-${process.argv[2]}${process.argv[3] ? `-${process.argv[3]}` : ""}`;
  const credentials = process.env.HF_CREDENTIALS?.trim();
  if (!credentials || credentials === "key-id:key-secret") throw new Error("credentials");
  config({ credentials, maxRetries: 0, maxPollTime: 20 * 60 * 1000, pollInterval: 5000 });
  await mkdir(out, { recursive: true });

  const recordPath = `${out}/${tag}.json`;
  if (await exists(recordPath)) {
    console.error(`${tag}: already requested, check ${recordPath} and the dashboard before retrying.`);
    process.exitCode = 1;
    return;
  }

  const image_urls = [];
  for (const path of refs) image_urls.push(await upload(credentials, `${episode}/${path}`));
  const input = { prompt: prompt(style.look, style.ring), image_urls, duration: 8, aspect_ratio: "1:1", resolution: "720p", generate_audio: false };
  await writeFile(recordPath, JSON.stringify({ status: "submitting", refs, input }, null, 2));
  console.error(`${tag}: submitting one 8-second 720p reference-to-video generation…`);
  const result = await higgsfield.subscribe("bytedance/seedance-2.5/reference-to-video", { input, withPolling: true });
  const url = result.video?.url;
  await writeFile(recordPath, JSON.stringify({ status: result.status, requestId: result.request_id, url, refs, input }, null, 2));
  if (result.status !== "completed" || !url) {
    console.error(`${tag}: ${result.status}, no video.`);
    process.exitCode = 1;
    return;
  }
  const video = await fetch(url);
  if (!video.ok) throw new Error(`download HTTP ${video.status}`);
  await writeFile(`${out}/${tag}.mp4`, Buffer.from(await video.arrayBuffer()));
  console.log(`${out}/${tag}.mp4`);
}

main().catch((error: unknown) => {
  // Never log SDK errors or response bodies, which may contain credentials.
  console.error(error instanceof APIError && typeof error.statusCode === "number"
    ? `Higgsfield HTTP ${error.statusCode}; stopped. Check the dashboard before retrying.`
    : error instanceof Error ? error.message : "failed");
  process.exitCode = 1;
});
