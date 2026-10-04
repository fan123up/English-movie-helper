# English Movie Helper

从本地 MKV/MP4 文件已有的英文、中文文本字幕轨中提取双语字幕，按时间一对一配对，并生成适合英语听力口语学习的紧凑 Word 文档。

## 能做什么

- 自动识别独立的英文与中文字幕轨，也支持手动指定流索引。
- 默认要求起止时间完全相同，避免错配和字幕复用。
- 生成 A4 双栏 DOCX：英文在上、中文在下、组间浅灰分隔线。
- 保留字幕原文和已有音乐符号，不翻译、不补写、不修改源影片。
- 支持包含中文和空格的 Windows 路径。

不支持 OCR、语音识别、翻译、视频下载、DRM 绕过、图形字幕或只有画面烧录字幕的影片。

## 依赖

- Node.js 18 或更高版本
- FFmpeg 与 FFprobe

本项目不包含 FFmpeg，也不会自动安装依赖。

## 直接运行

```powershell
node skills/english-movie-helper/scripts/extract_bilingual_subtitles.js `
  "D:\电影\example.mkv" `
  --output "D:\电影\example-bilingual.docx"
```

便携版 FFmpeg：

```powershell
node skills/english-movie-helper/scripts/extract_bilingual_subtitles.js `
  "D:\电影\example.mp4" `
  --output "D:\电影\example-bilingual.docx" `
  --ffmpeg "D:\tools\ffmpeg\bin\ffmpeg.exe" `
  --ffprobe "D:\tools\ffmpeg\bin\ffprobe.exe"
```

完整选项：

```text
--output <path>
--english-stream <index>
--chinese-stream <index>
--ffmpeg <path>
--ffprobe <path>
--tolerance-ms <integer>
--help
```

成功时标准输出为 JSON，包含所选流索引、字幕条数、精确/容差配对数、未使用中文字幕条数和输出路径。

## 安装为 Codex Skill

将 `skills/english-movie-helper` 整个目录复制到：

```text
%USERPROFILE%\.codex\skills\english-movie-helper
```

重新开启一个 Codex 对话后，可直接描述“从本地 MKV/MP4 提取内嵌中英文字幕并生成 Word”，也可显式使用 `$english-movie-helper`。

## 共享 Skill 目录

兼容 Agent Skills 目录约定的工具可尝试放置在：

```text
%USERPROFILE%\.agents\skills\english-movie-helper
```

本项目可以复制到该共享目录，但这不等于已确认豆包桌面版会自动发现它。豆包的具体版本、Skill 入口与目录支持情况需要在豆包中新建任务实际验证；在可见调用前，不应宣称安装成功。

## 发布到 GitHub

仓库根目录已包含 `plugin.json`、MIT `LICENSE`、Skill 源码与测试。发布时保留当前目录结构即可。不要把个人电影、生成文档、FFmpeg 二进制或本地验证文件提交到仓库。

## 测试

```powershell
node --test tests/*.test.js
```

## 准确性边界

- “准确”表示忠实提取文件中已有的独立文本字幕轨，并按时间戳一对一对应。
- 中文轨可以比英文轨多出片头卡、说明卡等条目；它们会计入 `unusedChineseCues`，不会强行配给英文。
- 若英文存在未匹配条目，程序会停止，不会生成看似完整但实际错位的文档。

