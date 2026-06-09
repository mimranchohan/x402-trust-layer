/**
 * Renders 5 narration MP4s via ffmpeg drawtext (Windows-safe, no SVG).
 * Run: npm run videos:render
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs", "sales", "videos", "mp4");
mkdirSync(outDir, { recursive: true });

const FONT =
  process.platform === "win32"
    ? "C\\\\:/Windows/Fonts/segoeui.ttf"
    : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

const VIDEOS = [
  {
    id: "01-hook",
    title: "Who guards the agent wallet?",
    duration: 22,
    lines: [
      "Your AI agent can pay for APIs now.",
      "USDC on Base. No API keys.",
      "But who decides IF it should pay?",
      "Finance needs proof — not blind trust.",
      "We built x402 Trust Layer for Alchemy.",
      "Guard. Pay. Verify. On-chain proof.",
    ],
  },
  {
    id: "02-standard-demo",
    title: "Live demo — real USDC",
    duration: 30,
    lines: [
      "This is live — real money on Base.",
      "First: policy guard checks the payment.",
      "Allowed — only then we proceed.",
      "Second: Alchemy x402 settles USDC.",
      "Third: receipt auditor validates proof.",
      "Total about one dollar ten cents.",
      "Every step logged for your team.",
    ],
  },
  {
    id: "03-enterprise",
    title: "Enterprise — mandate + ledger",
    duration: 34,
    lines: [
      "Agent fleets need more than guard.",
      "A human signs a spending mandate.",
      "Every payment checked against scope.",
      "Then guard, pay, and receipt verify.",
      "Compliance ledger for your CFO.",
      "Tamper-proof audit hash exported.",
      "SOC2-ready proof. No black box.",
    ],
  },
  {
    id: "04-developer",
    title: "Trust layer for builders",
    duration: 24,
    lines: [
      "Building agents that pay for APIs?",
      "You need guardrails before money moves.",
      "Check policy before every payment.",
      "Verify the receipt after settlement.",
      "Alchemy handles the rail.",
      "We handle policy and proof.",
    ],
  },
  {
    id: "05-cfo-pitch",
    title: "CFO — prove every payment",
    duration: 22,
    lines: [
      "Agents spend USDC autonomously.",
      "Finance asks: prove every dollar.",
      "We link Basescan transactions.",
      "Receipt auditor confirms validity.",
      "Compliance ledger for audit export.",
      "No more mystery agent spend.",
    ],
  },
];

function findFfmpeg() {
  const bundled = join(root, "node_modules", "ffmpeg-static", "ffmpeg.exe");
  if (existsSync(bundled)) return bundled;
  const bundledUnix = join(root, "node_modules", "ffmpeg-static", "ffmpeg");
  if (existsSync(bundledUnix)) return bundledUnix;
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    return "ffmpeg";
  } catch {
    return null;
  }
}

function escDrawtext(s) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "'\\''")
    .replace(/%/g, "\\%");
}

function renderSegment(ffmpeg, text, durationSec, outPath, isTitle = false) {
  const size = isTitle ? 52 : 40;
  const y = isTitle ? "(h*0.42)" : "(h*0.78)";
  const label = escDrawtext(text);
  const vf = [
    `drawtext=fontfile='${FONT}':text='${label}':fontsize=${size}:fontcolor=white:x=(w-text_w)/2:y=${y}`,
    `drawtext=fontfile='${FONT}':text='x402trustlayer.xyz':fontsize=28:fontcolor=0x64748b:x=(w-text_w)/2:y=h-80`,
  ].join(",");
  execSync(
    `"${ffmpeg}" -y -f lavfi -i color=c=0x0f172a:s=1920x1080:d=${durationSec.toFixed(2)} -vf "${vf}" -c:v libx264 -pix_fmt yuv420p -r 30 "${outPath}"`,
    { stdio: "ignore" },
  );
}

const ffmpeg = findFfmpeg();
if (!ffmpeg) {
  console.error("ffmpeg not found. Run: npm install");
  process.exit(1);
}

const tmpDir = join(outDir, ".tmp");
mkdirSync(tmpDir, { recursive: true });

for (const v of VIDEOS) {
  const segDur = v.duration / (v.lines.length + 1);
  const segs = [];
  const titlePath = join(tmpDir, `${v.id}-title.mp4`);
  renderSegment(ffmpeg, v.title, segDur, titlePath, true);
  segs.push(titlePath);

  for (let i = 0; i < v.lines.length; i++) {
    const segPath = join(tmpDir, `${v.id}-${i}.mp4`);
    renderSegment(ffmpeg, v.lines[i], segDur, segPath, false);
    segs.push(segPath);
  }

  const listFile = join(tmpDir, `${v.id}-list.txt`);
  writeFileSync(
    listFile,
    segs.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"),
  );
  const outMp4 = join(outDir, `${v.id}.mp4`);
  execSync(
    `"${ffmpeg}" -y -f concat -safe 0 -i "${listFile}" -c copy "${outMp4}"`,
    { stdio: "inherit" },
  );
  console.log("✓", outMp4);
}

console.log("\n5 videos ready:", outDir);
