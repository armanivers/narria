/**
 * One-time / idempotent: add custom: false to all audio entries; convert string array items to { src, custom }.
 * Run: node scripts/migrate-books-audio-custom.js
 */
const fs = require("node:fs");
const path = require("node:path");

const booksPath = path.join(__dirname, "..", "data", "books.json");
const books = JSON.parse(fs.readFileSync(booksPath, "utf8"));

function tagAudio(audio) {
  if (audio == null) return audio;
  if (typeof audio === "string") {
    const s = audio.trim();
    return s ? { src: s, startDelayMs: 0, custom: false } : audio;
  }
  if (Array.isArray(audio)) {
    return audio.map(tagAudio);
  }
  if (typeof audio === "object" && Object.prototype.hasOwnProperty.call(audio, "src")) {
    return {
      ...audio,
      custom: audio.custom === true
    };
  }
  return audio;
}

for (const book of books) {
  if (book.coverAudio) {
    for (const side of ["front", "back"]) {
      const o = book.coverAudio[side];
      if (o && typeof o === "object") {
        book.coverAudio[side] = { ...o, custom: o.custom === true };
      }
    }
  }
  for (const page of book.pages || []) {
    page.audio = tagAudio(page.audio);
    if (page.choiceOutcomes && typeof page.choiceOutcomes === "object") {
      for (const key of Object.keys(page.choiceOutcomes)) {
        const out = page.choiceOutcomes[key];
        if (out && out.audio != null) {
          out.audio = tagAudio(out.audio);
        }
      }
    }
  }
}

fs.writeFileSync(booksPath, `${JSON.stringify(books, null, 2)}\n`);
console.log("Updated", booksPath);
