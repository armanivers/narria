/**
 * Writes custom_front.json in the same folder as the ElevenLabs output custom_front.mp3
 * (per-user dir: .../audio/personalized/users/<parentId>/).
 * Default welcome line uses the same segment + word shape as the reference track (scaled to real MP3 duration).
 */

const fs = require("node:fs");
const path = require("node:path");
const { parseFile } = require("music-metadata");

const SPEAKER = { id: "speaker_0", name: "Speaker 0" };

/** Reference clip length the template timings were tuned for */
const REF_DURATION_SEC = 6.8;

/** Reference child name length in the timing template (… "Hello, Jad. …") */
const REF_TEMPLATE_NAME = "Jad";

const REF_SEG1_START = 0.099;
const REF_SEG1_END = 2.839;
const REF_SEG2_START = 2.879;
const REF_SEG2_END = 6.8;

function round3(x) {
  return Math.round(Number(x) * 1000) / 1000;
}

/** Matches buildCustomFrontLine() when ELEVENLABS_CUSTOM_FRONT_TEMPLATE is unset */
function defaultCustomFrontText(childName) {
  const who = String(childName || "").trim() || "friend";
  return `Hello, ${who}. Welcome to the world of dragons. Uh, buckle down for the journey`;
}

function isDefaultCustomFrontSpoken(spokenText, childName) {
  return String(spokenText || "") === defaultCustomFrontText(childName);
}

/**
 * Segment 2 words — absolute times from reference JSON (total clip 6.8s).
 * Scaled by `scale` when writing.
 */
const SEG2_TEMPLATE_WORDS = [
  { text: "dragons.", start_time: 2.879, end_time: 3.48 },
  { text: " ", start_time: 3.48, end_time: 3.98 },
  { text: "Uh,", start_time: 3.98, end_time: 4.039 },
  { text: " ", start_time: 4.039, end_time: 4.48 },
  { text: "buckle", start_time: 4.48, end_time: 4.92 },
  { text: " ", start_time: 4.92, end_time: 5.099 },
  { text: "down", start_time: 5.099, end_time: 5.48 },
  { text: " ", start_time: 5.48, end_time: 5.599 },
  { text: "for", start_time: 5.599, end_time: 5.699 },
  { text: " ", start_time: 5.699, end_time: 5.779 },
  { text: "the", start_time: 5.779, end_time: 5.839 },
  { text: " ", start_time: 5.839, end_time: 5.959 },
  { text: "journey", start_time: 5.96, end_time: 6.8 }
];

function buildSegment1Words(childName, segStart, segEnd) {
  const who = String(childName || "").trim() || "friend";
  const nameDot = `${who}.`;
  const tokens = ["Hello,", " ", nameDot, " ", "Welcome", " ", "to", " ", "the", " ", "world", " ", "of"];
  const refLen = REF_TEMPLATE_NAME.length;
  const nameExtra = Math.max(0, who.length - refLen);
  /** Longer names get more relative weight inside segment 1 (on top of character-based split). */
  const nameBoost = 1 + 0.18 * nameExtra + 0.02 * Math.max(0, nameExtra - 6);
  const weights = tokens.map((t) => {
    if (t === " ") return 0.22;
    if (t === nameDot) {
      return Math.max(0.55, who.length * 0.34) * nameBoost;
    }
    return Math.max(0.45, t.length * 0.28);
  });
  const totalW = weights.reduce((a, b) => a + b, 0);
  const dur = segEnd - segStart;
  const words = [];
  let acc = segStart;
  for (let i = 0; i < tokens.length; i += 1) {
    const isLast = i === tokens.length - 1;
    const chunkEnd = isLast ? segEnd : acc + (dur * weights[i]) / totalW;
    words.push({
      text: tokens[i],
      start_time: round3(acc),
      end_time: round3(chunkEnd)
    });
    acc = chunkEnd;
  }
  if (words.length) {
    words[words.length - 1].end_time = round3(segEnd);
  }
  return words;
}

/**
 * Map reference segment-2 times (2.879…6.8s) into [seg2Start, seg2End] after segment 1 grew/shrank with name length.
 */
function mapSeg2RefTime(tRef, seg2Start, seg2End) {
  const r0 = REF_SEG2_START;
  const r1 = REF_SEG2_END;
  return seg2Start + ((tRef - r0) / (r1 - r0)) * (seg2End - seg2Start);
}

/**
 * Build default two-segment track using real MP3 duration. Segment 1 length scales with how much longer
 * the child's name is than the reference "Jad" so the "…world of" / "dragons…" boundary moves appropriately.
 */
function buildDefaultTwoSegmentTrack(childName, durationSec) {
  const who = String(childName || "").trim() || "friend";
  const R = REF_DURATION_SEC;

  const refSeg1Text = `Hello, ${REF_TEMPLATE_NAME}. Welcome to the world of`;
  const seg1Text = `Hello, ${who}. Welcome to the world of`;
  const lenRatio = Math.max(0.72, Math.min(1.75, seg1Text.length / refSeg1Text.length));

  const scale = durationSec / R;
  const seg1Start = (REF_SEG1_START / R) * durationSec;
  const refGap = REF_SEG2_START - REF_SEG1_END;

  const refSeg1Inner = REF_SEG1_END - REF_SEG1_START;
  const refSeg2Inner = REF_SEG2_END - REF_SEG2_START;

  /** Inner duration of segment 1: uniform scale × text-length vs reference (name is the main variable). */
  let seg1Inner = refSeg1Inner * scale * lenRatio;

  const gap = refGap * scale;
  const minSeg2Inner = refSeg2Inner * scale * 0.78;
  const maxSeg1Inner = Math.max(0.25 * durationSec, durationSec - seg1Start - gap - minSeg2Inner);

  seg1Inner = Math.min(seg1Inner, maxSeg1Inner);
  seg1Inner = Math.max(seg1Inner, refSeg1Inner * scale * 0.78);

  let seg1End = seg1Start + seg1Inner;
  let seg2Start = seg1End + gap;
  const seg2End = durationSec;

  if (seg2Start >= seg2End - 0.08) {
    const usable = durationSec - seg1Start - gap;
    const s1Part = usable * 0.4;
    seg1End = seg1Start + s1Part;
    seg2Start = seg1End + gap;
  }

  const seg2Text = "dragons. Uh, buckle down for the journey";
  const seg2Words = SEG2_TEMPLATE_WORDS.map((w) => ({
    text: w.text,
    start_time: round3(mapSeg2RefTime(w.start_time, seg2Start, seg2End)),
    end_time: round3(mapSeg2RefTime(w.end_time, seg2Start, seg2End))
  }));
  if (seg2Words.length) {
    seg2Words[seg2Words.length - 1].end_time = round3(seg2End);
  }

  return {
    language_code: null,
    segments: [
      {
        text: seg1Text,
        start_time: round3(seg1Start),
        end_time: round3(seg1End),
        speaker: { ...SPEAKER },
        words: buildSegment1Words(who, seg1Start, seg1End)
      },
      {
        text: seg2Text,
        start_time: round3(seg2Start),
        end_time: round3(seg2End),
        speaker: { ...SPEAKER },
        words: seg2Words
      }
    ]
  };
}

/** Tokenize for arbitrary TTS line: words and spaces like ElevenLabs-style JSON */
function tokenizeRough(text) {
  const s = String(text || "").trim();
  if (!s) return [];
  const tokens = [];
  const re = /(\S+)(\s*)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    tokens.push(m[1]);
    if (m[2]) tokens.push(m[2]);
  }
  return tokens;
}

function buildGenericTrack(spokenText, durationSec) {
  const tokens = tokenizeRough(spokenText);
  if (tokens.length === 0) {
    return {
      language_code: null,
      segments: [
        {
          text: spokenText,
          start_time: 0,
          end_time: round3(Math.max(0.1, durationSec)),
          speaker: { ...SPEAKER },
          words: [
            {
              text: spokenText || " ",
              start_time: 0,
              end_time: round3(Math.max(0.1, durationSec))
            }
          ]
        }
      ]
    };
  }

  const pad = Math.min(0.08, durationSec * 0.02);
  const segStart = pad;
  const segEnd = Math.max(segStart + 0.1, durationSec - pad);
  const dur = segEnd - segStart;
  const weights = tokens.map((t) => (/^\s+$/.test(t) ? 0.2 : Math.max(0.5, t.length * 0.35)));
  const totalW = weights.reduce((a, b) => a + b, 0);
  const words = [];
  let acc = segStart;
  for (let i = 0; i < tokens.length; i += 1) {
    const isLast = i === tokens.length - 1;
    const chunkEnd = isLast ? segEnd : acc + (dur * weights[i]) / totalW;
    words.push({
      text: tokens[i],
      start_time: round3(acc),
      end_time: round3(chunkEnd)
    });
    acc = chunkEnd;
  }
  if (words.length) {
    words[words.length - 1].end_time = round3(segEnd);
  }

  return {
    language_code: null,
    segments: [
      {
        text: spokenText,
        start_time: round3(segStart),
        end_time: round3(segEnd),
        speaker: { ...SPEAKER },
        words
      }
    ]
  };
}

/**
 * Read custom_front.mp3 duration, then write custom_front.json in that file's directory.
 * @param {{ customFrontMp3Path?: string; userVoiceDir?: string; childName: string; spokenText: string }} params
 *   Prefer `customFrontMp3Path` (absolute path to the MP3 just saved) so JSON always matches the same folder.
 */
async function writeCustomFrontSubtitlesJson(params) {
  const { childName, spokenText } = params;
  let mp3Path;
  if (params.customFrontMp3Path) {
    mp3Path = path.resolve(params.customFrontMp3Path);
  } else if (params.userVoiceDir) {
    mp3Path = path.join(path.resolve(params.userVoiceDir), "custom_front.mp3");
  } else {
    throw new Error("writeCustomFrontSubtitlesJson: pass customFrontMp3Path or userVoiceDir");
  }

  const dir = path.dirname(mp3Path);
  const outPath = path.join(dir, "custom_front.json");

  if (!fs.existsSync(mp3Path)) {
    throw new Error(`custom_front subtitles: MP3 not found at ${mp3Path}`);
  }

  let durationSec = REF_DURATION_SEC;
  try {
    const meta = await parseFile(mp3Path);
    const d = meta.format.duration;
    if (typeof d === "number" && Number.isFinite(d) && d > 0.15) {
      durationSec = d;
    }
  } catch (err) {
    console.warn("[custom_front subtitles] could not read MP3 duration, using reference:", err?.message || err);
  }

  const track = isDefaultCustomFrontSpoken(spokenText, childName)
    ? buildDefaultTwoSegmentTrack(childName, durationSec)
    : buildGenericTrack(spokenText, durationSec);

  fs.mkdirSync(dir, { recursive: true });
  const jsonBody = `${JSON.stringify(track, null, 2)}\n`;
  fs.writeFileSync(outPath, jsonBody, "utf8");

  if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 10) {
    throw new Error(`custom_front subtitles: failed to write ${outPath}`);
  }

  console.log("[custom_front subtitles] wrote", path.resolve(outPath), `(${Math.round(durationSec * 100) / 100}s)`);
  return { outPath: path.resolve(outPath), durationSec };
}

module.exports = {
  writeCustomFrontSubtitlesJson,
  defaultCustomFrontText,
  isDefaultCustomFrontSpoken
};
