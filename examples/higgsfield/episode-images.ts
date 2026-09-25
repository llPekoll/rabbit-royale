// Keyframes of an episode, one shot at a time (billable, one image per variant):
//   bun --env-file=.env.local run examples/higgsfield/episode-images.ts A 2
// Nano Banana is disabled on our API key (503 model_disabled), so Grok Image 2.0,
// which takes up to ten ordered references.
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { config, higgsfield, APIError } from "@higgsfield/client/v2";

const episode = "episodes/ep01-carotte-bombe/shots";
const out = `${episode}/out`;
const exists = (path: string) => access(path).then(() => true, () => false);

const IDENTITY = `
CHARACTER: a chunky, boxy little rabbit, faithful to the attached pixel sprite: off-white body with a pale grey-beige lower half, thick dark charcoal outline, two tall straight rectangular ears with pink insides, tiny pink nose, two SMALL black dot eyes (no big round mascot eyes), stubby paws. Simple bold block shapes, like a vinyl toy made from the sprite.
CARROT: the attached pixel carrot, absurdly huge — saturated orange root with dark red shading on one side, a big ROUND bushy tuft of bright green leaves.
WORLD: the attached game screenshot — isometric grass island made of square tiles, dark teal pine trees, round bushes, small red mushrooms, turquoise sea around. Frank daylight, shadows are deep navy blue, never grey or black.
STYLE: high-fidelity stylized 3D render, collectible vinyl figure / toy diorama look, soft studio lighting, saturated colours, hard contrast, readable as a tiny thumbnail: large shapes, little fine detail.
FORMAT: square 1:1. Subject centred, keep the top third fairly empty for caption text.
FORBIDDEN: photorealism, realistic fur, a real rabbit, big anime eyes, capes, crowns, clothing; any text, letters, logo, UI, watermark; volcano.`;

type Shot = { refs: string[]; prompt: string };

const SUBJECT = `The character is the attached pixel sprite (inputs 1-2), a white rabbit: chunky compact body, pale grey-beige lower half, dark charcoal outline, two tall straight ears with pink insides, tiny pink nose, two SMALL black dot eyes, stubby paws. Input 3 is the carrot: saturated orange root, big round bushy green top. Input 4 is the game world: isometric island of square grass tiles, dark teal pines, round bushes, red mushrooms, turquoise sea.
SHOT: medium shot, facing camera, the whole rabbit and the whole carrot inside the frame. The rabbit holds a gigantic carrot high above its head with both paws, trophy pose, eyes closed in pure happiness, ears straight up. Island and pines behind. Bright sunny day, blue sky. Square 1:1, subject centred, top third calm for caption text. No text, logo, UI, capes, crowns or clothes.`;
const DA_REFS = ["refs/white-stand-x16.png", "refs/white-idle-x16.png", "refs/carrot-big-x8.png", "refs/game-screenshot.png"];
const DA: Record<string, string> = {
  pixel: "STYLE: high-end pixel art key art, like a premium indie game title illustration. Crisp hard-edged pixels on a strict grid, no anti-aliasing, no blur, limited palette taken from input 4, navy-blue shadows, dithering in the sky. Same pixel language as the game, just a much bigger, more detailed sprite. Not 3D, not smooth.",
  hd2d: "STYLE: HD-2D. The rabbit and carrot stay flat crisp PIXEL-ART sprites, standing inside a real 3D miniature diorama of the island: tilt-shift depth of field, soft bloom, warm sunlight, glowing rim light, volumetric light rays. Pixel characters, cinematic 3D lighting.",
  clay: "STYLE: stop-motion claymation. Rabbit and carrot sculpted in matte plasticine with visible thumbprints, the island a handmade miniature set with felt grass and clay pines, real studio lighting, shallow depth of field. Blocky shape of the sprite kept, charming handmade look.",
  cartoon: "STYLE: bold flat 2D cartoon, modern TV animation look. Thick uniform dark outlines, flat cel colours with one hard shadow tone, simple graphic background, very expressive squash-and-stretch pose. Blocky shape of the sprite kept.",
};
const shots: Record<string, Shot> = {
  A: {
    refs: ["refs/white-stand-x16.png", "refs/white-idle-x16.png", "refs/carrot-big-x8.png", "refs/game-screenshot.png"],
    prompt: `Input 1 and 2 are the character (pixel sprite, enlarged). Input 3 is the carrot. Input 4 is the world. ${IDENTITY}
SHOT: medium close-up, chest up, facing the camera. The rabbit holds a gigantic carrot above its head with both paws, arms fully stretched, trophy pose. Eyes closed with pure happiness (two little upward arcs), ears straight up. Grass island and pine trees behind, softly out of focus. Warm frontal light. Sincere joy, no irony, no joke in the image itself.`,
  },
  B: {
    refs: ["out/A.png"],
    prompt: `Edit input 1 minimally — same rabbit, same pose, same carrot, same framing, same background. Only changes: a violent warm ORANGE light floods in from off-screen right, hard-edged, lighting the right side of the face and body; the rest keeps its normal light. The eyes are now WIDE open (still small black dots, just open), ears snapped fully upright, head turned very slightly to the right. Raw surprise, not fear. NO fire, NO explosion visible anywhere in the frame — only its light. No text.`,
  },
  C: {
    refs: ["out/A.png", "refs/brown-tumble-x16.png", "refs/brown-idle-x16.png", "refs/game-screenshot.png"],
    prompt: `Input 1 is our rabbit and the render style — keep exactly this character and look. Input 2 and 3 are the second rabbit: same kind of character but BROWN. Input 4 is the world. ${IDENTITY}
SHOT: wide shot of a small isometric grass island. Bottom-left foreground, seen FROM BEHIND and small in frame: our white rabbit, perfectly still, giant carrot held up above its head. Background right: the brown rabbit blasted into the air by an explosion — low arc, body spinning, paws up. Beneath it a torn-open tile, orange fireball, ground shockwave ring, black smoke, flying dirt and grass chunks. Both rabbits read instantly: bottom-left / top-right. Triumphant foreground, catastrophe in the background.`,
  },
};

shots["da-home"] = {
  refs: ["refs/home-bg.png", ...DA_REFS],
  prompt: `Input 1 is the ART STYLE reference only: copy its detailed painterly pixel art, rich pixel clusters, lush greens, warm golden sunlight with light rays, fluffy clouds, sparkling turquoise sea, depth with a leafy foreground. Do NOT copy its character: no cape, no crown, no sword, no banner, no castle.
${SUBJECT.replace(/inputs 1-2/, "inputs 2-3").replace("Input 3 is the carrot", "Input 4 is the carrot").replace("Input 4 is the game world", "Input 5 is the game world")}
STYLE: exactly the rendering of input 1 — hand-crafted pixel-art key art, crisp pixels, no smooth 3D, no blur on the character. The rabbit is a white pixel-art rabbit drawn in that same detailed style, keeping the sprite's tall straight pink-lined ears, dot eyes and chunky body.`,
};

for (const [key, style] of Object.entries(DA)) shots[`da-${key}`] = { refs: DA_REFS, prompt: `${SUBJECT}\n${style}` };

const SPRITE = `Inputs 1-2 are the rabbit: keep it EXACTLY as this low-resolution pixel sprite — same blocky pixels, same white/grey-beige colours, dark outline, tall straight pink-lined ears, dot eyes. Do not redraw it, do not smooth it, do not make it 3D or realistic: it stays a flat chunky pixel sprite with visible square pixels. Input 3 is the pixel carrot, same treatment. Input 4 is the game. The rabbit holds the giant pixel carrot high above its head with both paws, trophy pose, happy. Square 1:1, top third calm for caption text. No text, no letters, no logo.`;
const ENV: Record<string, string> = {
  real: "SCENE: a real photograph. A real sunny meadow on a rocky island by a turquoise sea, real grass, real pine trees, golden hour, shallow depth of field, shot on a 35mm lens. The flat pixel rabbit stands in the grass at real rabbit size like a glitch in reality, casting a soft real shadow. Photorealistic everything except the rabbit and carrot, which stay pixel sprites.",
  desk: "SCENE: a real photograph of a crypto trader's desk at night, three monitors glowing with red and green candlestick charts, energy drink cans, keyboard with RGB light, messy cables. The flat pixel rabbit stands on the desk between the keyboard and a mug, holding its pixel carrot up in triumph, lit by the monitors. Photorealistic everything except the rabbit and carrot, which stay pixel sprites.",
  crt: "SCENE: a real photograph of an old 90s CRT television in a dim cozy bedroom, warm lamp, game console cables on the carpet. On the curved glass screen, with visible scanlines and RGB phosphor glow, the game (input 4) is showing and our pixel rabbit fills the screen holding the carrot. The pixel carrot pokes OUT of the screen into the real room, breaking the glass boundary. Photorealistic room.",
  arcade: "SCENE: a real photograph of a dark retro arcade hall, neon pink and blue lights, rows of cabinets. Front and centre, an arcade cabinet whose glowing screen shows the game (input 4) with our pixel rabbit holding the carrot; the flat pixel rabbit is also climbing out of the screen onto the control panel, carrot raised, between the joystick and the buttons. Photorealistic arcade, the rabbit and carrot stay pixel sprites. No readable text on the cabinet.",
};
for (const [key, scene] of Object.entries(ENV)) shots[`env-${key}`] = { refs: ["refs/white-stand-x16.png", "refs/white-idle-x16.png", "refs/carrot-big-x8.png", "refs/game-screenshot.png"], prompt: `${SPRITE}\n${scene}` };

shots["da-pixel3d"] = {
  refs: ["refs/style-pixel3d.png", "refs/white-stand-x16.png", "refs/white-idle-x16.png", "refs/carrot-big-x8.png", "refs/game-screenshot.png"],
  prompt: `Input 1 is the ART STYLE reference only (ignore its character, backpack, clothes and jungle): a pixel-art character turned into a soft 3D figure — the sprite's square pixels become chunky cubes and pixel-painted texture on rounded 3D volumes, stylized game-engine render, soft warm light, lush foliage, shallow depth of field with creamy bokeh.
Inputs 2-3 are OUR rabbit sprite: rebuild EXACTLY this sprite in that 3D pixel style — same silhouette, same proportions, same pixel colours (white, pale grey-beige lower body, dark charcoal outline turned into dark edge pixels), two tall straight rectangular ears with pink insides, two small black square eyes, tiny pink square nose, stubby paws. Every visible pixel of the sprite stays a visible square on the 3D figure. Do not add a mouth, eyelashes, fur or clothes.
Input 4 is the carrot, same 3D pixel treatment: orange root with dark red pixel shading, big round bushy green top. Input 5 is the world: grass island, dark teal pines, round bushes, red mushrooms, turquoise sea.
SHOT: medium shot, facing camera, whole rabbit and whole carrot in frame. The rabbit holds a gigantic carrot high above its head with both paws, trophy pose, ears straight up, proud. Island grass and pines behind, blurred. Sunny day. Square 1:1, top third calm for caption text. No text, logo or UI.`,
};

shots["da-anim"] = {
  refs: ["refs/style-pixel3d.png", "refs/white-stand-x16.png", "refs/white-idle-x16.png", "refs/carrot-big-x8.png", "refs/game-screenshot.png"],
  prompt: `Input 1 is the ART STYLE reference only (ignore its girl, backpack, clothes): a pixel-art sprite repainted as a frame from a hand-painted animated film. Look closely at it: the character is NOT voxels and NOT extruded cubes — its pixels stay FLAT square colour patches, slightly soft-edged, lying on a gently rounded painted form with soft painterly light and warm glow, like an anime / Ghibli-style film still. Background is lush painted foliage, soft cinematic lighting, dreamy bokeh, warm greens.
Inputs 2-3 are OUR rabbit sprite: repaint EXACTLY this sprite that way — same silhouette, same proportions, same pixel colour patches (white head, pale grey-beige lower body, dark charcoal outline pixels), two tall straight ears with pink insides, two small black square eyes, tiny pink square nose, stubby paws. The pixel squares must stay readable on the body. No mouth, no fur, no clothes, no big anime eyes.
Input 4 is the carrot, same treatment: flat orange pixel patches with dark red shading, big round bushy green top. Input 5 is the world: grass island, dark teal pines, round bushes, red mushrooms, turquoise sea glimpsed behind.
SHOT: medium shot, facing camera, whole rabbit and whole carrot in frame. The rabbit holds a gigantic carrot high above its head with both paws, trophy pose, ears straight up, eyes closed with joy. Warm sunny light filtering through leaves. Square 1:1, top third calm for caption text. No text, logo or UI.`,
};

shots["fix-pixel3d"] = {
  refs: ["cool/da-pixel3d-v2.png"],
  prompt: `Edit input 1 minimally: keep EVERYTHING identical — same rabbit, same pose, same carrot, same framing, same background, same render. Only change: remove the two white square patches on the rabbit's chest and belly; the chest and belly become one plain uniform pale grey-beige surface, same colour as the rest of the lower body. No new details. No text.`,
};

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
  const [name, countArg] = process.argv.slice(2);
  const shot = shots[name ?? ""];
  if (!shot) throw new Error(`shot: one of ${Object.keys(shots).join(", ")}`);
  const count = Math.min(4, Math.max(1, Number(countArg ?? 1)));
  const credentials = process.env.HF_CREDENTIALS?.trim();
  if (!credentials || credentials === "key-id:key-secret") throw new Error("credentials");
  config({ credentials, maxRetries: 0, maxPollTime: 10 * 60 * 1000, pollInterval: 3000 });
  await mkdir(out, { recursive: true });

  for (const path of shot.refs) if (!(await exists(`${episode}/${path}`))) throw new Error(`missing ${path}`);
  const image_urls = [];
  for (const path of shot.refs) image_urls.push(await upload(credentials, `${episode}/${path}`));

  await Promise.all(Array.from({ length: count }, async (_, i) => {
    const tag = `${name}-v${i + 1}`;
    const recordPath = `${out}/${tag}.json`;
    if (await exists(recordPath)) {
      console.error(`${tag}: already requested, skipped (delete ${recordPath} to redo).`);
      return;
    }
    const input = { prompt: shot.prompt.trim(), image_urls, resolution: "2k", aspect_ratio: "1:1", quality: "medium" };
    await writeFile(recordPath, JSON.stringify({ status: "submitting", refs: shot.refs, input }, null, 2));
    const result = await higgsfield.subscribe("xai/grok-imagine-image-2.0", { input, withPolling: true });
    const url = result.images?.[0]?.url;
    await writeFile(recordPath, JSON.stringify({ status: result.status, requestId: result.request_id, url, refs: shot.refs, input }, null, 2));
    if (result.status !== "completed" || !url) {
      console.error(`${tag}: ${result.status}, no image.`);
      return;
    }
    const image = await fetch(url);
    if (!image.ok) throw new Error(`download HTTP ${image.status}`);
    await writeFile(`${out}/${tag}.png`, Buffer.from(await image.arrayBuffer()));
    console.log(`${tag}: ${out}/${tag}.png`);
  }));
}

main().catch((error: unknown) => {
  // Never log SDK errors or response bodies, which may contain credentials.
  console.error(error instanceof APIError && typeof error.statusCode === "number"
    ? `Higgsfield HTTP ${error.statusCode}; stopped. Check the dashboard before retrying.`
    : error instanceof Error ? error.message : "failed");
  process.exitCode = 1;
});
