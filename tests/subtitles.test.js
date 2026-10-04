"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const modulePath = path.join(
  __dirname, "..", "skills", "english-movie-helper", "scripts", "lib", "subtitles.js",
);

function subtitles() {
  return require(modulePath);
}

test("parses multiline UTF-8 cues", () => {
  const cues = subtitles().parseSrt(
    "1\n00:00:01,000 --> 00:00:03,500\nHello &amp; welcome\nsecond line\n",
  );
  assert.deepEqual(cues, [{
    number: 1,
    start: 1000,
    end: 3500,
    text: "Hello & welcome second line",
  }]);
});

test("pairs exact timestamps", () => {
  const english = [{ number: 1, start: 1000, end: 2000, text: "Hello" }];
  const chinese = [{ number: 9, start: 1000, end: 2000, text: "你好" }];

  const result = subtitles().pairCues(english, chinese, 0);

  assert.equal(result.pairs.length, 1);
  assert.equal(result.pairs[0].chinese.text, "你好");
  assert.equal(result.exactPairs, 1);
  assert.equal(result.tolerancePairs, 0);
});

test("reports Chinese-only cards", () => {
  const english = [{ number: 1, start: 1000, end: 2000, text: "Hello" }];
  const chinese = [
    { number: 1, start: 0, end: 500, text: "字幕制作" },
    { number: 2, start: 1000, end: 2000, text: "你好" },
  ];

  const result = subtitles().pairCues(english, chinese, 0);

  assert.deepEqual(result.unusedChinese.map((cue) => cue.text), ["字幕制作"]);
});

test("fails on unmatched English", () => {
  const english = [{ number: 7, start: 1000, end: 2000, text: "Hello" }];

  assert.throws(
    () => subtitles().pairCues(english, [], 0),
    (error) => error.code === "UNMATCHED_ENGLISH_CUES" && error.cues[0].number === 7,
  );
});

test("does not reuse Chinese cue", () => {
  const english = [
    { number: 1, start: 1000, end: 2000, text: "One" },
    { number: 2, start: 1000, end: 2000, text: "Two" },
  ];
  const chinese = [{ number: 1, start: 1000, end: 2000, text: "一" }];

  assert.throws(
    () => subtitles().pairCues(english, chinese, 0),
    (error) => error.code === "AMBIGUOUS_PAIRING",
  );
});

test("rejects ambiguous tolerance match", () => {
  const english = [{ number: 1, start: 1000, end: 2000, text: "One" }];
  const chinese = [
    { number: 1, start: 990, end: 1990, text: "一" },
    { number: 2, start: 1010, end: 2010, text: "壹" },
  ];

  assert.throws(
    () => subtitles().pairCues(english, chinese, 20),
    (error) => error.code === "AMBIGUOUS_PAIRING",
  );
});

test("preserves source music symbols", () => {
  assert.equal(subtitles().normalizeCueText("♪ <i>She may</i> ♫"), "♪ She may ♫");
});
