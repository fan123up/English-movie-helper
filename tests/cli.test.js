"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const CLI_PATH = path.join(__dirname, "..", "skills", "english-movie-helper", "scripts", "extract_bilingual_subtitles.js");

function loadCli() {
  return require(CLI_PATH);
}

test("rejects unsupported extension", () => {
  const { parseArgs } = loadCli();
  assert.throws(
    () => parseArgs(["movie.avi", "--output", "out.docx"]),
    (error) => error.code === "UNSUPPORTED_MEDIA_EXTENSION",
  );
});

test("reports missing executable", () => {
  const { checkedRun } = loadCli();
  const runner = () => ({ error: Object.assign(new Error("not found"), { code: "ENOENT" }), status: null });
  assert.throws(
    () => checkedRun("missing-ffmpeg", ["-version"], runner),
    (error) => error.code === "MISSING_EXECUTABLE" && /missing-ffmpeg/.test(error.message),
  );
});

test("requires output path", () => {
  const { parseArgs } = loadCli();
  assert.throws(
    () => parseArgs(["movie.mkv"]),
    (error) => error.code === "MISSING_OUTPUT",
  );
});

test("passes Chinese paths as literal arguments", () => {
  const { checkedRun } = loadCli();
  const seen = [];
  const runner = (command, args, options) => {
    seen.push({ command, args, options });
    return { status: 0, stdout: "", stderr: "" };
  };
  const media = "D:\\英语 电影\\诺丁山.mkv";
  checkedRun("ffmpeg.exe", ["-i", media], runner);
  assert.equal(seen[0].args[1], media);
  assert.equal(seen[0].options.shell, false);
});

test("cleans temporary files", async () => {
  const { withTemporaryDirectory } = loadCli();
  let created;
  await assert.rejects(
    () => withTemporaryDirectory(async (directory) => {
      created = directory;
      fs.writeFileSync(path.join(directory, "sample.srt"), "temporary");
      throw new Error("stop");
    }),
    /stop/,
  );
  assert.equal(fs.existsSync(created), false);
});

test("does not modify source hash", async () => {
  const { withTemporaryDirectory } = loadCli();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "english-movie-helper-test-"));
  const source = path.join(root, "电影 sample.mkv");
  fs.writeFileSync(source, Buffer.from("source bytes"));
  const before = crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex");
  await withTemporaryDirectory(async (directory) => {
    fs.writeFileSync(path.join(directory, "english.srt"), "1\n00:00:00,000 --> 00:00:01,000\nHello\n");
  });
  const after = crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex");
  fs.rmSync(root, { recursive: true, force: true });
  assert.equal(after, before);
});
