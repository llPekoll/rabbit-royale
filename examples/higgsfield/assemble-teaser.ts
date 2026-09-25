import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const dir = "output/x-teaser-01/video";
const shots = ["01-kingdom", "02-crown", "03-hunted"];
const font = "/System/Library/Fonts/Supplemental/Arial Bold.ttf";
const captions = {
  en: ["Everyone wants the crown.", "Until they wear it.", "Now everyone wants you."],
  fr: ["Tout le monde veut la couronne.", "Jusqu’à ce qu’il la porte.", "Maintenant, tout le monde te veut."],
};
const run = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });

// Select 2.5s + 2.5s + 3s of the generated shots; retain subtle original ambience.
const filters = shots.flatMap((_, index) => {
  const duration = index === 2 ? 3 : 2.5;
  return [
    `[${index}:v]trim=start=0.3:duration=${duration},setpts=PTS-STARTPTS,scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${index}]`,
    `[${index}:a]atrim=start=0.3:duration=${duration},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=0.12,afade=t=out:st=${duration - 0.15}:d=0.15[a${index}]`,
  ];
});
filters.push("[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a]");
run([
  ...shots.flatMap(shot => ["-i", `${dir}/${shot}.mp4`]),
  "-filter_complex", filters.join(";"), "-map", "[v]", "-map", "[a]",
  "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
  `${dir}/rabbit-royale-intro-clean-480p.mp4`,
]);

for (const [language, lines] of Object.entries(captions)) {
  const intervals = [[0, 2.5], [2.5, 5], [5, 8]];
  const textFilters = lines.map((line, index) => {
    const path = `${dir}/caption-${language}-${index}.txt`;
    writeFileSync(path, line);
    const [start, end] = intervals[index];
    return `drawtext=fontfile='${font}':textfile='${path}':fontsize=27:fontcolor=white:x=(w-text_w)/2:y=h-65:box=1:boxcolor=0x082820@0.82:boxborderw=12:enable='gte(t,${start})*lt(t,${end})'`;
  });
  const titlePath = `${dir}/title.txt`;
  writeFileSync(titlePath, "RABBIT ROYALE");
  textFilters.push(`drawtext=fontfile='${font}':textfile='${titlePath}':fontsize=20:fontcolor=0xFFE29A:x=(w-text_w)/2:y=25:shadowcolor=black:shadowx=1:shadowy=2:enable='gte(t,5)'`);
  run(["-i", `${dir}/rabbit-royale-intro-clean-480p.mp4`, "-vf", textFilters.join(","), "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-c:a", "copy", "-movflags", "+faststart", `${dir}/rabbit-royale-intro-${language}-480p.mp4`]);
}
console.log(`Saved clean, English and French 8-second intros to ${dir}`);
