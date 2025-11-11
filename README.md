## 项目地址
项目代码托管在 GitHub 上，访问地址：[https://approximetal.github.io/VoicePlatform/](https://approximetal.github.io/VoicePlatform/)

## 本地预览

1. **Clone 项目代码**
    ```
    git@github.com:Approximetal/VoicePlatform.git
    ```

2. **进入项目目录**
   ```bash
   cd ./speech_demos
   ```
3. **生成所需 manifest（如素材有更新需重新执行）**
   ```bash
   python3 scripts/generate_video_translation_manifest.py
   python3 scripts/generate_speech_editing_manifest.py
   python3 scripts/generate_audio_processing_manifest.py
   ...
   ```
4. **启动任意静态服务器**（示例使用 Python）
   ```bash
   python3 -m http.server 8000
   ```
5. 打开浏览器访问 `http://127.0.0.1:8000` 查看页面效果。

> 如需使用其他静态服务器（如 `npm serve`、`live-server` 等），同样在 `/mnt/code/speech_demos` 目录下启动即可。
