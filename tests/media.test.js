"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const mediaModule = path.join(
  __dirname,
  "..",
  "skills",
  "english-movie-helper",
  "scripts",
  "lib",
  "media.js",
);

function media() {
  return require(mediaModule);
}

function stream(index, codec, title = "", language = "") {
  return { index, codec_name: codec, codec_type: "subtitle", tags: { title, language } };
}

test("selects dedicated English and Chinese tracks", () => {
  const streams = [
    stream(2, "ass", "中英字幕"),
    stream(3, "ass", "英中字幕"),
    stream(4, "subrip", "中文字幕"),
    stream(5, "subrip", "英文字幕"),
  ];
  const samples = new Map([
    [2, "Hello 你好"],
    [3, "你好 Hello"],
    [4, "你好，世界"],
    [5, "Hello, world"],
  ]);

  const selected = media().selectSubtitleStreams(streams, samples, {});

  assert.equal(selected.english.index, 5);
  assert.equal(selected.chinese.index, 4);
});

test("rejects tied English candidates", () => {
  const streams = [
    stream(4, "subrip", "中文字幕"),
    stream(5, "subrip", "英文字幕"),
    stream(6, "subrip", "英文字幕"),
  ];
  const samples = new Map([
    [4, "你好"],
    [5, "Hello"],
    [6, "Goodbye"],
  ]);

  assert.throws(
    () => media().selectSubtitleStreams(streams, samples, {}),
    (error) => error.code === "AMBIGUOUS_ENGLISH_STREAM",
  );
});

test("rejects mixed bilingual track as two tracks", () => {
  const streams = [stream(2, "ass", "中英字幕")];
  const samples = new Map([[2, "Hello 你好"]]);

  assert.throws(
    () => media().selectSubtitleStreams(streams, samples, {}),
    (error) => error.code === "MIXED_ONLY_UNSUPPORTED",
  );
});

test("rejects image subtitle codecs", () => {
  const streams = [stream(2, "hdmv_pgs_subtitle", "中文字幕")];

  assert.throws(
    () => media().selectSubtitleStreams(streams, new Map(), {}),
    (error) => error.code === "NO_TEXT_SUBTITLE_TRACKS",
  );
});

test("accepts Chinese paths without shell interpolation", () => {
  const calls = [];
  const fakeRunner = (command, args, options) => {
    calls.push({ command, args, options });
    return {
      status: 0,
      stdout: JSON.stringify({ streams: [] }),
      stderr: "",
    };
  };
  const input = "D:\\电影目录\\诺丁山 (1999).mkv";

  media().probeMedia(input, "C:\\工具\\ffprobe.exe", fakeRunner);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "C:\\工具\\ffprobe.exe");
  assert.equal(calls[0].args.at(-1), input);
  assert.equal(calls[0].options.shell, false);
});
