---
name: english-movie-helper
description: "Use when 用户要从本地 MKV/MP4 的内嵌英文与中文文本字幕轨提取双语字幕，并整理成适合英语学习的 Word 文档；不用于 OCR、语音识别、翻译、视频下载或 DRM 绕过。"
---

# English Movie Helper

从用户指定的本地 `.mkv` 或 `.mp4` 中读取已有的英文、中文文本字幕轨，准确配对后生成紧凑的双语 `.docx`。优先保证来源真实、对应准确和源文件不变。

## 执行原则

- 只读取媒体文件，不修改、转码、移动或覆盖源文件。
- 先确认 `node`、`ffmpeg`、`ffprobe` 可用；缺失时说明依赖，不擅自安装。
- 只处理 `subrip`、`ass`、`ssa`、`webvtt`、`mov_text`、`text` 字幕。图形字幕、烧录字幕和音轨不属于本 Skill 范围。
- 不自行翻译、补写、润色字幕，也不根据电影名称推断歌词。音乐符号仅保留字幕源中已有的 `♪`、`♫`、`🎵` 等标记。
- 默认按起止时间完全相同进行一对一配对。只有用户明确接受时间容差时才使用 `--tolerance-ms`。
- 自动选轨出现并列或只有混合双语轨时必须停止，列出候选流索引，让用户指定；不得静默猜测。
- 先生成用户要求的文件，再报告路径与统计信息；不要用聊天预览替代成品。

## 工作流

1. 确认输入是本地 `.mkv` 或 `.mp4`，并确定输出 `.docx` 路径。
2. 定位本 Skill 目录中的 `scripts/extract_bilingual_subtitles.js`。
3. 执行：

```powershell
node scripts/extract_bilingual_subtitles.js "D:\path\movie.mkv" --output "D:\path\movie-bilingual.docx"
```

4. 如果工具报告字幕轨歧义，先向用户展示候选信息，再按用户选择添加：

```powershell
--english-stream 5 --chinese-stream 4
```

5. 成功后根据标准输出中的 JSON 报告：英文流、中文流、英文条数、中文条数、精确配对数、容差配对数、未使用中文条数和输出路径。

## 输出格式

- A4 纵向、双栏、约 1.5 cm 页边距和 1 cm 栏间距。
- 英文在上：Times New Roman、10.5 pt、深红色。
- 中文在下：宋体、10.5 pt、黑色。
- 每组字幕后使用浅灰分隔线，英文段与对应中文段尽量保持在同一页。
- 不显示时间码，不添加 `English`、`中文` 标签。

## 异常处理

遇到依赖缺失、字幕轨歧义、配对失败或格式不受支持时，读取 [references/troubleshooting.md](references/troubleshooting.md)，按错误码解释原因并给出最小下一步。不要退化成 OCR、语音识别或自动翻译。

