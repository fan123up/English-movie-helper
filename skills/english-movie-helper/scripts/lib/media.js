"use strict";

const { spawnSync } = require("node:child_process");

const TEXT_CODECS = new Set(["subrip", "ass", "ssa", "webvtt", "mov_text", "text"]);

function codedError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function probeMedia(mediaPath, ffprobePath = "ffprobe", runner = spawnSync) {
  const args = [
    "-v", "error",
    "-show_entries", "stream=index,codec_name,codec_type:stream_tags=language,title",
    "-of", "json",
    "--",
    mediaPath,
  ];
  const result = runner(ffprobePath, args, {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw codedError(
      "FFPROBE_FAILED",
      `ffprobe 无法读取媒体文件：${result.stderr || result.error?.message || "未知错误"}`,
      { status: result.status },
    );
  }
  try {
    return JSON.parse(result.stdout || "{}");
  } catch (error) {
    throw codedError("FFPROBE_INVALID_JSON", "ffprobe 返回了无法解析的 JSON。", { cause: error });
  }
}

function classifyTextSample(text) {
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const total = latin + cjk;
  const latinRatio = total === 0 ? 0 : latin / total;
  const cjkRatio = total === 0 ? 0 : cjk / total;
  return {
    latinRatio,
    cjkRatio,
    mixed: latinRatio >= 0.2 && cjkRatio >= 0.2,
  };
}

function languageScore(stream, sample, target) {
  const title = String(stream.tags?.title || "").toLowerCase();
  const language = String(stream.tags?.language || "").toLowerCase();
  const profile = classifyTextSample(sample || "");
  const bilingualTitle = /中英|英中|双语|bilingual/.test(title);
  let score = 0;

  if (target === "english") {
    if (["eng", "en"].includes(language)) score += 100;
    if (/英文字幕|english/.test(title)) score += 80;
    if (bilingualTitle) score += 5;
    if (/中文字幕|简体|繁体|chinese/.test(title) && !/英文字幕|english/.test(title)) score -= 80;
    if (profile.latinRatio >= 0.8) score += 60;
    if (profile.cjkRatio >= 0.8) score -= 60;
    if (profile.mixed) score -= 40;
  } else {
    if (["zho", "chi", "zh", "chs", "cht"].includes(language)) score += 100;
    if (/中文字幕|简体|繁体|chinese/.test(title)) score += 80;
    if (bilingualTitle) score += 5;
    if (/英文字幕|english/.test(title) && !/中文字幕|chinese/.test(title)) score -= 80;
    if (profile.cjkRatio >= 0.8) score += 60;
    if (profile.latinRatio >= 0.8) score -= 60;
    if (profile.mixed) score -= 40;
  }
  return score;
}

function chooseUnique(streams, samples, target) {
  const ranked = streams
    .map((stream) => ({ stream, score: languageScore(stream, samples.get(stream.index), target) }))
    .sort((a, b) => b.score - a.score || a.stream.index - b.stream.index);
  if (ranked.length === 0 || ranked[0].score <= 0) {
    throw codedError(
      target === "english" ? "MISSING_ENGLISH_STREAM" : "MISSING_CHINESE_STREAM",
      `没有可靠的${target === "english" ? "英文" : "中文"}文本字幕轨。`,
      { candidates: ranked },
    );
  }
  if (ranked[1] && ranked[1].score === ranked[0].score) {
    throw codedError(
      target === "english" ? "AMBIGUOUS_ENGLISH_STREAM" : "AMBIGUOUS_CHINESE_STREAM",
      `${target === "english" ? "英文" : "中文"}字幕轨存在并列候选，请显式指定流索引。`,
      { candidates: ranked.filter((item) => item.score === ranked[0].score) },
    );
  }
  return ranked[0].stream;
}

function selectSubtitleStreams(streams, samples = new Map(), explicitIndexes = {}) {
  const textStreams = streams.filter(
    (stream) => stream.codec_type === "subtitle" && TEXT_CODECS.has(stream.codec_name),
  );
  if (textStreams.length === 0) {
    throw codedError("NO_TEXT_SUBTITLE_TRACKS", "文件中没有受支持的文本字幕轨。", { streams });
  }

  if (textStreams.length === 1) {
    const only = textStreams[0];
    if (classifyTextSample(samples.get(only.index) || "").mixed) {
      throw codedError("MIXED_ONLY_UNSUPPORTED", "仅检测到一条混合双语字幕轨，当前版本不将其拆成两个独立轨道。", { stream: only });
    }
  }

  const byIndex = new Map(textStreams.map((stream) => [stream.index, stream]));
  const explicitEnglish = explicitIndexes.englishStream;
  const explicitChinese = explicitIndexes.chineseStream;
  const english = explicitEnglish === undefined
    ? chooseUnique(textStreams, samples, "english")
    : byIndex.get(Number(explicitEnglish));
  const chinese = explicitChinese === undefined
    ? chooseUnique(textStreams, samples, "chinese")
    : byIndex.get(Number(explicitChinese));

  if (!english) throw codedError("INVALID_ENGLISH_STREAM", "指定的英文字幕流不存在或不是受支持的文本字幕。", { index: explicitEnglish });
  if (!chinese) throw codedError("INVALID_CHINESE_STREAM", "指定的中文字幕流不存在或不是受支持的文本字幕。", { index: explicitChinese });
  if (english.index === chinese.index) {
    throw codedError("SAME_STREAM_SELECTED", "英文和中文字幕不能使用同一条字幕流。", { index: english.index });
  }
  return { english, chinese };
}

module.exports = {
  TEXT_CODECS,
  classifyTextSample,
  probeMedia,
  selectSubtitleStreams,
};
