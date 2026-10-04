"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const modulePath = path.join(
  __dirname, "..", "skills", "english-movie-helper", "scripts", "lib", "docx.js",
);

function docx() {
  return require(modulePath);
}

const pairs = [{
  english: { text: "♪ A & B < C > D" },
  chinese: { text: "🎵 甲和乙" },
}];

test("escapes XML without changing visible text", () => {
  const xml = docx().buildDocumentXml(pairs);
  assert.match(xml, /♪ A &amp; B &lt; C &gt; D/);
  assert.match(xml, /🎵 甲和乙/);
});

test("writes two-column A4 layout", () => {
  const xml = docx().buildDocumentXml(pairs);
  assert.match(xml, /w:pgSz w:w="11906" w:h="16838"/);
  assert.match(xml, /w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850"/);
  assert.match(xml, /w:cols w:num="2" w:space="567"/);
});

test("uses required fonts colors sizes and borders", () => {
  const xml = docx().buildDocumentXml(pairs);
  assert.match(xml, /Times New Roman/);
  assert.match(xml, /w:eastAsia="宋体"/);
  assert.match(xml, /w:color w:val="C00000"/);
  assert.match(xml, /w:color w:val="000000"/);
  assert.equal((xml.match(/w:sz w:val="21"/g) || []).length, 2);
  assert.match(xml, /w:bottom w:val="single" w:sz="4" w:space="4" w:color="D9D9D9"/);
});

test("keeps English with Chinese", () => {
  const xml = docx().buildDocumentXml(pairs);
  assert.match(xml, /<w:keepNext\/>/);
});

test("preserves emoji", () => {
  const xml = docx().buildDocumentXml(pairs);
  assert.equal(xml.includes("🎵"), true);
});

test("creates a DOCX ZIP with required entries", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "english-movie-helper-docx-"));
  const output = path.join(directory, "sample.docx");
  try {
    docx().writeBilingualDocx(pairs, output);
    const data = fs.readFileSync(output);
    assert.equal(data.readUInt32LE(0), 0x04034b50);
    const binaryText = data.toString("latin1");
    assert.equal(binaryText.includes("[Content_Types].xml"), true);
    assert.equal(binaryText.includes("_rels/.rels"), true);
    assert.equal(binaryText.includes("word/document.xml"), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
