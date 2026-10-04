# 排错说明

CLI 会在错误信息开头输出稳定的英文错误码。先按错误码判断，不要重复盲试。

| 错误码 | 含义与处理 |
|---|---|
| `MISSING_EXECUTABLE` | 找不到 `ffmpeg` 或 `ffprobe`。让用户提供可执行文件路径，分别传给 `--ffmpeg`、`--ffprobe`；安装前必须征得同意。 |
| `MEDIA_NOT_FOUND` | 输入路径不存在。核对完整路径、扩展名和是否多了一层目录。 |
| `UNSUPPORTED_MEDIA_EXTENSION` | 当前仅接受 `.mkv`、`.mp4`。不要自动转码其他格式。 |
| `NO_TEXT_SUBTITLE_TRACKS` | 没有支持的文本字幕轨，可能是图形字幕或画面烧录字幕。本 Skill 到此停止。 |
| `MISSING_ENGLISH_STREAM` / `MISSING_CHINESE_STREAM` | 未找到可靠的单语字幕轨。列出文件实际字幕流，不要自行翻译缺失语言。 |
| `AMBIGUOUS_ENGLISH_STREAM` / `AMBIGUOUS_CHINESE_STREAM` | 多条候选得分相同。请用户确认全局流索引，再用 `--english-stream` 或 `--chinese-stream`。 |
| `MIXED_ONLY_UNSUPPORTED` | 只有一条中英混合字幕轨，当前版本不拆分，避免把推测结果当成独立原字幕。 |
| `INVALID_ENGLISH_STREAM` / `INVALID_CHINESE_STREAM` | 指定的流不存在或不是支持的文本字幕。用 `ffprobe` 重新查看全局流索引。 |
| `SAME_STREAM_SELECTED` | 英文和中文不能指定同一字幕流。 |
| `MALFORMED_SRT` | FFmpeg 输出的 SRT 结构异常。保留错误信息，并确认原字幕轨能否被 FFmpeg 正常解码。 |
| `UNMATCHED_ENGLISH_CUES` | 至少一条英文字幕找不到唯一的中文字幕。默认不要放宽匹配；让用户决定是否设置小范围 `--tolerance-ms`。 |
| `AMBIGUOUS_PAIRING` | 容差范围内出现多个候选或字幕会被复用。缩小容差或改用时间一致的字幕轨。 |
| `EXTERNAL_COMMAND_FAILED` | FFmpeg/FFprobe 返回失败。报告其原始错误，不要吞掉路径、编解码器或权限信息。 |

## 查看字幕流

```powershell
ffprobe -v error -show_entries stream=index,codec_name,codec_type:stream_tags=language,title -of json -- "D:\path\movie.mkv"
```

这里使用的是 `ffprobe` 的全局 `stream.index`。CLI 中的 `--english-stream` 与 `--chinese-stream` 也使用同一索引。

## 指定便携版 FFmpeg

```powershell
node scripts/extract_bilingual_subtitles.js "D:\path\movie.mkv" `
  --output "D:\path\movie-bilingual.docx" `
  --ffmpeg "D:\tools\ffmpeg\bin\ffmpeg.exe" `
  --ffprobe "D:\tools\ffmpeg\bin\ffprobe.exe"
```

路径通过参数数组传递，支持中文和空格；不要拼接成 `cmd /c` 字符串。

