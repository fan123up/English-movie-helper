"use strict";

function codedError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function parseTimestamp(value) {
  const match = value.match(/^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) throw codedError("MALFORMED_SRT", `无法解析字幕时间：${value}`);
  return (((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000) + Number(match[4]);
}

function decodeEntities(text) {
  const entities = {
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&amp;": "&",
  };
  return text.replace(/&(lt|gt|quot|#39|apos|amp);/g, (value) => entities[value]);
}

function normalizeCueText(text) {
  return decodeEntities(String(text))
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\\[^}]+\}/g, "")
    .replace(/\\N/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSrt(text) {
  const blocks = String(text)
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean);

  return blocks.map((block, blockIndex) => {
    const lines = block.split("\n");
    const numberText = lines.shift()?.trim();
    const timing = lines.shift()?.trim() || "";
    const number = Number(numberText);
    const timingMatch = timing.match(/^(\S+)\s+-->\s+(\S+)/);
    if (!Number.isInteger(number) || !timingMatch || lines.length === 0) {
      throw codedError("MALFORMED_SRT", `第 ${blockIndex + 1} 个字幕块格式无效。`);
    }
    return {
      number,
      start: parseTimestamp(timingMatch[1]),
      end: parseTimestamp(timingMatch[2]),
      text: normalizeCueText(lines.join(" ")),
    };
  });
}

function pairCues(english, chinese, toleranceMs = 0) {
  if (!Number.isInteger(toleranceMs) || toleranceMs < 0) {
    throw codedError("INVALID_TOLERANCE", "--tolerance-ms 必须是非负整数。", { toleranceMs });
  }

  const candidateIndexes = english.map((englishCue) => {
    const indexes = [];
    chinese.forEach((chineseCue, index) => {
      if (
        Math.abs(englishCue.start - chineseCue.start) <= toleranceMs
        && Math.abs(englishCue.end - chineseCue.end) <= toleranceMs
      ) {
        indexes.push(index);
      }
    });
    return indexes;
  });

  const ambiguousEnglish = candidateIndexes
    .map((indexes, index) => ({ indexes, cue: english[index] }))
    .filter((item) => item.indexes.length > 1);
  if (ambiguousEnglish.length > 0) {
    throw codedError("AMBIGUOUS_PAIRING", "至少一条英文字幕对应多条中文字幕。", { cues: ambiguousEnglish });
  }

  const usage = new Map();
  candidateIndexes.forEach((indexes, englishIndex) => {
    if (indexes.length === 1) {
      const chineseIndex = indexes[0];
      const users = usage.get(chineseIndex) || [];
      users.push(englishIndex);
      usage.set(chineseIndex, users);
    }
  });
  const reused = [...usage.entries()].filter(([, users]) => users.length > 1);
  if (reused.length > 0) {
    throw codedError("AMBIGUOUS_PAIRING", "同一条中文字幕会被多条英文字幕复用。", { reused });
  }

  const unmatched = candidateIndexes
    .map((indexes, index) => ({ indexes, cue: english[index] }))
    .filter((item) => item.indexes.length === 0)
    .map((item) => item.cue);
  if (unmatched.length > 0) {
    throw codedError("UNMATCHED_ENGLISH_CUES", `有 ${unmatched.length} 条英文字幕没有唯一中文字幕。`, { cues: unmatched });
  }

  let exactPairs = 0;
  let tolerancePairs = 0;
  const pairs = english.map((englishCue, index) => {
    const chineseCue = chinese[candidateIndexes[index][0]];
    const exact = englishCue.start === chineseCue.start && englishCue.end === chineseCue.end;
    if (exact) exactPairs += 1;
    else tolerancePairs += 1;
    return { english: englishCue, chinese: chineseCue, exact };
  });
  const used = new Set(candidateIndexes.map((indexes) => indexes[0]));
  const unusedChinese = chinese.filter((_, index) => !used.has(index));

  return { pairs, exactPairs, tolerancePairs, unusedChinese };
}

module.exports = {
  normalizeCueText,
  pairCues,
  parseSrt,
};
