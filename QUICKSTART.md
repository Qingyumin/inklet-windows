# Inklet 0.11.13 for Windows

Extract the complete ZIP, keep all files together, and run Inklet.exe.
Save your documents and close the previous version before switching versions.
Settings and recovery data are stored locally; do not delete them during an update.

- Windows 10/11 x64, .NET Framework 4.7.2+ and WebView2 Runtime are required.
- Source and visual panes both support editing; Ctrl+S saves and Ctrl+Z undoes.
- Use the speaker button to read the selected text or start from the current paragraph. Pause, resume, previous/next segment and stop controls are available.
- Reading settings offer 16 online voices, 0.75x-2.0x speed, four pitch presets, a voice preview and heading/timer stop modes. Pitch presets are not emotional speaking styles.
- Online narration sends the current and prefetched text segments to Microsoft or your configured speech endpoint. Do not send sensitive documents without authorization. Offline system-voice fallback depends on voices installed on your computer.
- A self-hosted OpenAI-compatible /v1/audio/speech endpoint can be configured separately. No local TTS model or server is bundled, and individual model integrations are not verified. Optional API keys are currently stored unencrypted in local settings.
- Speech preprocessing can omit annotations or code; compare with the original for proofreading. Pronunciation and prosody are not guaranteed for every word.
- Background swatches are compact. Highlight tools appear only for a nonempty text selection, not a cursor alone.
- Supported HTML covers render in the reader, comments stay hidden and explicit anchors remain navigable. Arbitrary HTML/CSS and scripts are not executed.
- Use the outline or search to navigate. Numbered section references can be clicked.
- Leading YAML metadata is displayed as a property table; edit it in the source pane.
- Wide tables retain their horizontal position after search and offscreen reloading.
- Search updates and closing only refresh search highlights, without rebuilding unchanged document decorations or refreshing diagrams.
- Figures display at 80% by default. Single-click to zoom and pan; double-click Mermaid to edit its code or SVG to view read-only source (including embedded draw.io XML when available).
- Draw.io SVG/PNG exports are supported as images; raw .drawio XML is not rendered by this version.
- Source line breaks remain visible, including consecutive A/B/C-labelled lines.
- Explicit image placeholders stay as placeholders and do not block saving.
- If image embedding fails, review the warning and cancel or save with the original references retained. Document size limits, disk errors and external-file conflicts still block unsafe saves.
- Local images, math and Mermaid are supported, with HTML/PDF/DOCX export.
- Keep backups and try important workflows on copies first.

This build is unsigned; Windows may show an unknown-publisher warning.
The WebView2 compatibility settings disable renderer accessibility and can affect screen readers.
Source and releases: https://github.com/Qingyumin/inklet-windows

The application is licensed under MIT. See LICENSE and licenses/ for notices. Online speech services and external model weights have their own terms and licenses.
