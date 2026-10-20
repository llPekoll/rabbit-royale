// LA VOIX DE MAMAN (2026-10-17) : les lignes des trois livres (intro.shiro.*,
// intro.kuro.*, intro.sea.*, sans les titres de chapitre) lues par ElevenLabs,
// une langue apres l'autre, dans godot/assets/intro/voice/<locale>/ — et le
// manifeste godot/assets/intro/voice.json que lit BookVoice.
//
// Un fichier porte le hash de son texte et de la voix : relancer ne paie que
// les lignes qui ont change. Les credits sont comptes (plan gratuit = 10 000
// caracteres), `--dry` dit ce que ca coutera sans rien envoyer.
//
//   bun tools/voice-books.ts --dry
//   bun tools/voice-books.ts models | voices
//   bun tools/voice-books.ts sample <voiceId,...> [locale] [cle]   (essai, dans le scratch)
//   bun tools/voice-books.ts [--only=fr,en]
//
// La cle : ~/.config/rabbit-royale/elevenlabs-key (ou ELEVENLABS_API_KEY).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = join(import.meta.dir, "..");
const I18N = join(ROOT, "godot/assets/i18n");
const OUT = join(ROOT, "godot/assets/intro/voice");
const MANIFEST = join(ROOT, "godot/assets/intro/voice.json");
const LOCALES = ["en", "fr", "es", "it", "pt-BR", "vi", "zh"];
const BOOKS = ["shiro", "kuro", "sea"];

// LA VOIX, choisie a l'essai (`sample`). Changer l'un de ces trois repaie tout.
// Le plan gratuit n'ouvre que les voix de base d'ElevenLabs (402 sur la
// bibliotheque, et Voice Design refuse par l'API) : Alice, vieillie par AGE
// (2026-10-17, « old alice2 » parmi Matilda, Alice et Bella).
const VOICE = process.env.VOICE_ID ?? "Xb7hH8MSUJpSbSDYk0k2";
const MODEL = process.env.VOICE_MODEL ?? "eleven_v4";
const SETTINGS = { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true };

// MAMAN EST VIEILLE : la prise baisse d'environ 2,6 demi-tons et ralentit un
// peu (asetrate 0,86 puis atempo 1,05), les aigus s'adoucissent. Applique aux
// prises brutes gardees dans RAW : le changer ne coute aucun credit.
const AGE = "asetrate=44100*0.86,aresample=44100,atempo=1.05,lowpass=f=8000";

// LES PRISES BRUTES, telles qu'ElevenLabs les rend, hors du repo : ce sont
// elles qu'on paie.
const RAW = join(homedir(), ".cache/rabbit-royale/voice-raw");

// Ce que le jeu lit : mono, 48 kbps (le moteur web n'a pas Vorbis, donc MP3).
const BITRATE = "48k";

const API = "https://api.elevenlabs.io/v1";

function key(): string {
  const file = join(homedir(), ".config/rabbit-royale/elevenlabs-key");
  const k = process.env.ELEVENLABS_API_KEY ?? (existsSync(file) ? readFileSync(file, "utf8") : "");
  if (!k.trim()) throw new Error(`pas de cle : ${file}`);
  return k.trim();
}

function flat(o: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof o === "string") out[prefix] = o;
  else if (o && typeof o === "object")
    for (const [k, v] of Object.entries(o)) flat(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

/** Les lignes lues d'une langue : cle -> texte. */
function lines(locale: string): Record<string, string> {
  const all = flat(JSON.parse(readFileSync(join(I18N, `${locale}.json`), "utf8")));
  const keep: Record<string, string> = {};
  for (const [k, v] of Object.entries(all)) {
    const [a, book, id] = k.split(".");
    if (a === "intro" && BOOKS.includes(book) && id && !/^ch\d+$/.test(id) && k.split(".").length === 3) keep[k] = v;
  }
  return keep;
}

function hash(...parts: unknown[]): string {
  return createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 10);
}

/** La prise brute d'une ligne : payee une fois, gardee dans RAW. */
async function take(locale: string, k: string, text: string): Promise<Buffer> {
  const file = join(RAW, locale, `${k}-${hash(VOICE, MODEL, SETTINGS, locale, text)}.mp3`);
  if (existsSync(file)) return readFileSync(file);
  const mp3 = await speak(VOICE, locale, text);
  mkdirSync(join(RAW, locale), { recursive: true });
  writeFileSync(file, mp3);
  console.log(`${locale} ${k} (${text.length})`);
  return mp3;
}

function taken(locale: string, k: string, text: string): boolean {
  return existsSync(join(RAW, locale, `${k}-${hash(VOICE, MODEL, SETTINGS, locale, text)}.mp3`));
}

// ElevenLabs veut l'ISO 639-1.
const LANG: Record<string, string> = { en: "en", fr: "fr", "pt-BR": "pt", vi: "vi", zh: "zh" };

async function speak(voice: string, locale: string, text: string): Promise<Buffer> {
  const body = (withLang: boolean) =>
    JSON.stringify({
      text,
      model_id: MODEL,
      voice_settings: SETTINGS,
      ...(withLang ? { language_code: LANG[locale] } : {}),
    });
  const send = (withLang: boolean) =>
    fetch(`${API}/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key(), "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: body(withLang),
    });
  let res = await send(true);
  // Un modele qui ne prend pas language_code le refuse : on reessaie sans.
  if (res.status === 400 || res.status === 422) {
    const why = await res.text();
    if (!/language/i.test(why)) throw new Error(`${res.status} ${why}`);
    res = await send(false);
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Vieillie, mono, volume egal d'une ligne a l'autre, 48 kbps. */
function master(mp3: Buffer, out: string): void {
  const src = join(tmpdir(), `voice-${process.pid}.mp3`);
  writeFileSync(src, mp3);
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-ac", "1", "-af",
    `${AGE},loudnorm=I=-18:TP=-2:LRA=9`, "-ar", "44100", "-c:a", "libmp3lame", "-b:a", BITRATE, out]);
  rmSync(src, { force: true });
  if (r.status !== 0) throw new Error(`ffmpeg : ${r.stderr}`);
}

async function get(path: string): Promise<any> {
  const res = await fetch(`${API}${path}`, { headers: { "xi-api-key": key() } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === "models") {
  for (const m of await get("/models"))
    console.log(m.model_id, "|", m.name, "|", (m.languages ?? []).map((l: any) => l.language_id).join(","),
      "| x", m.model_rates?.character_cost_multiplier ?? "?");
  const u = await get("/user/subscription");
  console.log(`credits : ${u.character_count} / ${u.character_limit} (${u.tier})`);
} else if (cmd === "voices") {
  const v = await get("/voices");
  for (const x of v.voices)
    console.log(x.voice_id, "|", x.name, "|", x.category, "|", Object.values(x.labels ?? {}).join(", "));
} else if (cmd === "sample") {
  // Une meme ligne dans plusieurs voix, a ecouter avant de tout payer.
  const [ids, locale = "fr", k = "intro.shiro.queen"] = rest;
  const text = lines(locale)[k];
  const dir = process.env.SAMPLE_DIR ?? join(tmpdir(), "voice-samples");
  mkdirSync(dir, { recursive: true });
  for (const id of ids.split(",")) {
    const out = join(dir, `${locale}-${k}-${id}.mp3`);
    // La voix retenue garde sa prise : la passe complete ne la repaiera pas.
    master(id === VOICE ? await take(locale, k, text) : await speak(id, locale, text), out);
    console.log(out);
  }
} else {
  const dry = rest.includes("--dry") || cmd === "--dry";
  const only = [cmd, ...rest].find((a) => a?.startsWith("--only="))?.slice(7).split(",") ?? LOCALES;
  if (!dry && !VOICE) throw new Error("VOICE_ID= la voix choisie (bun tools/voice-books.ts voices)");
  const manifest: Record<string, Record<string, string>> = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, "utf8"))
    : {};
  let cost = 0;
  for (const locale of only) {
    const dir = join(OUT, locale);
    mkdirSync(dir, { recursive: true });
    const want: Record<string, string> = {};
    for (const [k, text] of Object.entries(lines(locale))) {
      const file = `${k}-${hash(VOICE, MODEL, SETTINGS, AGE, BITRATE, locale, text)}.mp3`;
      want[k] = file;
      if (existsSync(join(dir, file))) continue;
      if (!taken(locale, k, text)) cost += text.length;
      if (dry) continue;
      master(await take(locale, k, text), join(dir, file));
    }
    if (dry) continue;
    // Les anciennes prises de cette langue partent : seul le manifeste compte.
    for (const f of readdirSync(dir)) if (!Object.values(want).includes(f)) rmSync(join(dir, f));
    manifest[locale] = want;
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, "\t") + "\n");
  }
  console.log(`${dry ? "couterait" : "paye"} : ${cost} caracteres (x le multiplicateur du modele)`);
}
