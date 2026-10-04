#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { probeMedia, selectSubtitleStreams, TEXT_CODECS } = require("./lib/media");
const { pairCues, parseSrt } = require("./lib/subtitles");
const { writeBilingualDocx } = require("./lib/docx");

function codedError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function helpText() {
  return `English Movie Helper

从本地 MKV/MP4 的内嵌英文、中文文本字幕轨生成双语 Word 文档。

用法：
  node extract_bilingual_subtitles.js <media> --output <docx> [options]

选项：
  --output <path>           必填，输出 DOCX 路径
  --english-stream <index>  显式指定英文字幕流的全局索引
  --chinese-stream <index>  显式指定中文字幕流的全局索引
  --ffmpeg <path>           ffmpeg 路径，默认 ffmpeg
  --ffprobe <path>          ffprobe 路径，默认 ffprobe
  --tolerance-ms <integer>  时间匹配容差，默认 0
  --help                    显示帮助
`;
}

function parseArgs(argv) {
  if (argv.includes("--help")) return { help: true };
  const options = {
    ffmpeg: "ffmpeg",
    ffprobe: "ffprobe",
    toleranceMs: 0,
  };
  const values = {
    "--output": "output",
    "--english-stream": "englishStream",
    "--chinese-stream": "chineseStream",
    "--ffmpeg": "ffmpeg",
    "--ffprobe": "ffprobe",
    "--tolerance-ms": "toleranceMs",
  };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const key = values[token];
    if (!key) throw codedError("UNKNOWN_OPTION", `未知选项：${token}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw codedError("MISSING_OPTION_VALUE", `${token} 缺少参数值。`);
    }
    options[key] = value;
    index += 1;
  }
  if (positional.length !== 1) {
    throw codedError("MISSING_MEDIA", "必须提供且只能提供一个本地 MKV/MP4 文件。 ");
  }
  options.media = positional[0];
  if (!options.output) throw codedError("MISSING_OUTPUT", "必须使用 --output 指定 DOCX 输出路径。");
  if (![".mkv", ".mp4"].includes(path.extname(options.media).toLowerCase())) {
    throw codedError("UNSUPPORTED_MEDIA_EXTENSION", "仅支持 .mkv 和 .mp4 文件。", { media: options.media });
  }
  if (path.extname(options.output).toLowerCase() !== ".docx") {
    throw codedError("INVALID_OUTPUT_EXTENSION", "--output 必须以 .docx 结尾。", { output: options.output });
  }
  options.toleranceMs = Number(options.toleranceMs);
  if (!Number.isInteger(options.toleranceMs) || options.toleranceMs < 0) {
    throw codedError("INVALID_TOLERANCE", "--tolerance-ms 必须是非负整数。");
  }
  for (const key of ["englishStream", "chineseStream"]) {
    if (options[key] !== undefined) {
      options[key] = Number(options[key]);
      if (!Number.isInteger(options[key]) || options[key] < 0) {
        throw codedError("INVALID_STREAM_INDEX", "字幕流索引必须是非负整数。");
      }
    }
  }
  return options;
}

function checkedRun(command, args, runner = spawnSync, extraOptions = {}) {
  const result = runner(command, args, {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    ...extraOptions,
  });
  if (result.error?.code === "ENOENT") {
    throw codedError("MISSING_EXECUTABLE", `找不到可执行文件：${command}`, { command });
  }
  if (result.error || result.status !== 0) {
    throw codedError(
      "EXTERNAL_COMMAND_FAILED",
      `外部命令执行失败：${command}\n${result.stderr || result.error?.message || "未知错误"}`,
      { command, args, status: result.status },
    );
  }
  return result;
}

async function withTemporaryDirectory(action) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "english-movie-helper-"));
  try {
    return await action(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function subtitleToSrt(ffmpeg, media, streamIndex, runner, outputPath) {
  const destination = outputPath || "pipe:1";
  const args = ["-v", "error", "-y", "-i", media, "-map", `0:${streamIndex}`, "-c:s", "srt"];
  if (!outputPath) args.push("-f", "srt");
  args.push(destination);
  return checkedRun(ffmpeg, args, runner).stdout || "";
}

async function runExtraction(options, dependencies = {}) {
  const runner = dependencies.runner || spawnSync;
  const media = path.resolve(options.media);
  const output = path.resolve(options.output);
  if (!fs.existsSync(media) || !fs.statSync(media).isFile()) {
    throw codedError("MEDIA_NOT_FOUND", `媒体文件不存在：${media}`);
  }
  checkedRun(options.ffmpeg, ["-version"], runner);
  checkedRun(options.ffprobe, ["-version"], runner);

  const probe = probeMedia(media, options.ffprobe, runner);
  const textStreams = (probe.streams || []).filter(
    (stream) => stream.codec_type === "subtitle" && TEXT_CODECS.has(stream.codec_name),
  );
  const samples = new Map();
  for (const stream of textStreams) {
    samples.set(stream.index, subtitleToSrt(options.ffmpeg, media, stream.index, runner));
  }
  const selected = selectSubtitleStreams(probe.streams || [], samples, options);

  return withTemporaryDirectory(async (directory) => {
    const englishPath = path.join(directory, "english.srt");
    const chinesePath = path.join(directory, "chinese.srt");
    subtitleToSrt(options.ffmpeg, media, selected.english.index, runner, englishPath);
    subtitleToSrt(options.ffmpeg, media, selected.chinese.index, runner, chinesePath);
    const english = parseSrt(fs.readFileSync(englishPath, "utf8"));
    const chinese = parseSrt(fs.readFileSync(chinesePath, "utf8"));
    const pairing = pairCues(english, chinese, options.toleranceMs);

    fs.mkdirSync(path.dirname(output), { recursive: true });
    const temporaryOutput = path.join(
      path.dirname(output),
      `.${path.basename(output)}.${process.pid}.${Date.now()}.tmp`,
    );
    try {
      writeBilingualDocx(pairing.pairs, temporaryOutput);
      fs.renameSync(temporaryOutput, output);
    } finally {
      if (fs.existsSync(temporaryOutput)) fs.rmSync(temporaryOutput, { force: true });
    }

    return {
      englishStream: selected.english.index,
      chineseStream: selected.chinese.index,
      englishCues: english.length,
      chineseCues: chinese.length,
      exactPairs: pairing.exactPairs,
      tolerancePairs: pairing.tolerancePairs,
      unusedChineseCues: pairing.unusedChinese.length,
      output,
    };
  });
}

async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      process.stdout.write(helpText());
      return 0;
    }
    const summary = await runExtraction(options);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`[${error.code || "UNEXPECTED_ERROR"}] ${error.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = {
  checkedRun,
  helpText,
  main,
  parseArgs,
  runExtraction,
  subtitleToSrt,
  withTemporaryDirectory,
};
