export const speechVoiceGroups = [
  {
    label: '中文有声书 · 经典播讲',
    voices: [
      ['zh-CN-YunxiNeural', '云希 · 清朗男声（有声书领读）'],
      ['zh-CN-YunyangNeural', '云扬 · 沉稳男声（专业书籍播讲）'],
      ['zh-CN-XiaoxiaoNeural', '晓晓 · 温润女声（文学散文朗读）'],
      ['zh-CN-YunjianNeural', '云健 · 浑厚男声（历史纪实叙事）'],
      ['zh-CN-XiaoyiNeural', '晓伊 · 清脆女声（轻快科普读物）'],
      ['zh-CN-YunxiaNeural', '云夏 · 少年清亮（轻松故事品读）'],
    ],
  },
  {
    label: '二代多语种模型 · 中英混读防拆词',
    voices: [
      ['en-US-AvaMultilingualNeural', '晓雅 Ava · 柔美多语女声（中英防拆词）'],
      ['en-US-AndrewMultilingualNeural', '云安 Andrew · 磁性多语男声（中英双语讲书）'],
      ['en-US-EmmaMultilingualNeural', '晓艾 Emma · 知性多语女声（长文连贯领读）'],
      ['en-US-BrianMultilingualNeural', '云博 Brian · 沉稳多语男声（技术说明文档）'],
    ],
  },
  {
    label: '港台人文与特色方言讲书',
    voices: [
      ['zh-TW-HsiaoChenNeural', '晓臻 · 温婉女声（台湾国语书卷风）'],
      ['zh-TW-YunJheNeural', '云哲 · 儒雅男声（台湾国语人文风）'],
      ['zh-TW-HsiaoYuNeural', '晓雨 · 清雅女声（台湾国语叙事风）'],
      ['zh-CN-liaoning-XiaobeiNeural', '晓北 · 亲切女声（东北自然讲书）'],
      ['zh-CN-shaanxi-XiaoniNeural', '晓妮 · 明朗女声（陕西特色评书）'],
      ['zh-HK-HiuMaanNeural', '晓曼 · 粤语女声（粤语文章朗读）'],
    ],
  },
];

export const speechVoices = speechVoiceGroups.flatMap(group => group.voices);

export const speechPitches = [
  ['+0Hz', '标准原声'],
  ['-3Hz', '温和舒缓（夜读/散文）'],
  ['-6Hz', '沉稳低醇（历史/长篇）'],
  ['+4Hz', '清亮明快（科普/快读）'],
];

export const speechStopModes = [
  ['continuous', '全文连读'],
  ['chapter', '读完本章停'],
  ['15', '15分钟后停'],
  ['30', '30分钟后停'],
  ['60', '60分钟后停'],
];

export const defaultSpeechVoice = 'zh-CN-YunxiNeural';
export const defaultSpeechRate = 1;
export const defaultSpeechPitch = '+0Hz';

export function renderSpeechVoiceOptions() {
  return speechVoiceGroups.map(group => `<optgroup label="${group.label}">${group.voices.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</optgroup>`).join('');
}

export function normalizeSpeechVoice(voice) {
  return speechVoices.some(([id]) => id === voice) ? voice : defaultSpeechVoice;
}

export function normalizeSpeechRate(rate) {
  const numeric = Number(rate);
  if (!Number.isFinite(numeric)) return defaultSpeechRate;
  return Math.round(Math.max(0.75, Math.min(2, numeric)) * 20) / 20;
}

export function normalizeSpeechPitch(pitch) {
  return speechPitches.some(([id]) => id === pitch) ? pitch : defaultSpeechPitch;
}

export function cleanSpeechText(raw, options = {}) {
  if (!raw) return '';
  let text = String(raw)
    .replace(/https?:\/\/[^\s)]+/gi, ' ')
    .replace(/[（(]\s*[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü\s'-]+\s*[）)]/gu, '')
    .replace(/([（(])\s*[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü\s'-]+[，,、;；]\s*/gu, '$1')
    .replace(/[（(][^）)\n]{1,14}[）)](?=[”"』」]?[族氏字国军部河山原城殿器的])/gu, '')
    .replace(/(?<=[\p{Script=Han}\d])[（(]([^）)\n]{1,120})[）)]/gu, '，$1，')
    .replace(/[「」『』]/gu, '')
    .replace(/【([^】\n]{1,40})】/gu, '$1，')
    .replace(/(?<![：:])“([^”\n。！？；：]{1,18})”(?=[\p{Script=Han}])/gu, '$1')
    .replace(/(?<=[\p{Script=Han}])(?<![：:])“([^”\n。！？；：]{1,18})”/gu, '$1')
    .replace(/(?<![：:])‘([^’\n。！？；：]{1,18})’/gu, '$1')
    .replace(/第0+([1-9]\d*)\s*([卷编章节回篇部集季条项款代])/gu, '第$1$2')
    .replace(/(?<=[\p{Script=Han}\d])\s*·\s*(?=[\p{Script=Han}\d])/gu, '，')
    .replace(/§\s*(\d+(?:\.\d+)*)/gu, '第 $1 节')
    .replace(/——+|--+/gu, '，')
    .replace(/…+|\.{3,}/gu, '，')
    .replace(/([\p{Script=Han}])\s*\/\s*([\p{Script=Han}])/gu, '$1或$2')
    .replace(/([\p{Script=Han}])\s*\+\s*([\p{Script=Han}])/gu, '$1加$2')
    .replace(/->|-->|=>|==>|[→⇒⟶]/gu, '至')
    .replace(/(?<=\d),(?=\d{3}\b)/gu, '');

  if (options?.skipCode) {
    text = text.replace(/\b[a-zA-Z]+(?:_[a-zA-Z0-9]+)+\b/g, ' ');
  } else {
    text = text.replace(/\b([a-zA-Z0-9]+)_([tTvV])\b/g, '$1').replace(/(?<=[a-zA-Z0-9])_(?=[a-zA-Z0-9])/g, ' ');
  }

  text = text
    .replace(/[`*~]+/g, '')
    .replace(/[#|>]+/g, ' ')
    .replace(/[-=]{3,}/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*([，。！？；：、])\s*/gu, '$1')
    .replace(/([\p{Script=Han}]) +([\p{Script=Han}])/gu, (match, left, right, offset, full) => {
      const before = full.slice(Math.max(0, offset - 8), offset + 1);
      if (/第[一二三四五六七八九十百千万零\d]+[卷编章节回篇部]$/u.test(before)) return `${left} ${right}`;
      return `${left}${right}`;
    })
    .replace(/\s*，\s*([，。！？；：、])/gu, '$1')
    .replace(/([：；。！？])\s*，\s*/gu, '$1')
    .replace(/，{2,}/gu, '，')
    .replace(/^，+|，+$/gu, '')
    .trim();
  return text;
}

export function splitSpeechSentences(text, maxChars = 220, options = {}) {
  const cleaned = cleanSpeechText(text, options);
  if (!cleaned) return [];
  if (cleaned.length <= maxChars) return [cleaned];

  const sentenceParts = cleaned.split(/(?<=[。！？；!?]|(?<!\d)\.(?!\d))\s*/u).filter(Boolean);
  const expandLongPart = part => {
    if (part.length <= maxChars) return [part];
    const clauseParts = part.split(/(?<=[，：,:])\s*/u).filter(Boolean);
    const out = [];
    let acc = '';
    for (const clause of clauseParts) {
      if (clause.length > maxChars) {
        if (acc) { out.push(acc.trim()); acc = ''; }
        const subParts = clause.split(/(?<=[、])\s*/u).filter(Boolean);
        let subAcc = '';
        for (const sub of subParts) {
          if (sub.length > maxChars) {
            if (subAcc) { out.push(subAcc.trim()); subAcc = ''; }
            for (let i = 0; i < sub.length; i += maxChars) {
              const slice = sub.slice(i, i + maxChars).trim();
              if (slice) out.push(slice);
            }
          } else if (subAcc && subAcc.length + sub.length > maxChars) {
            out.push(subAcc.trim());
            subAcc = sub;
          } else {
            subAcc += sub;
          }
        }
        if (subAcc.trim()) out.push(subAcc.trim());
      } else if (acc && acc.length + clause.length > maxChars) {
        out.push(acc.trim());
        acc = clause;
      } else {
        acc += clause;
      }
    }
    if (acc.trim()) out.push(acc.trim());
    return out;
  };

  const chunks = [];
  let current = '';
  for (const rawPart of sentenceParts) {
    for (const part of expandLongPart(rawPart)) {
      if (current && current.length + part.length > maxChars) {
        chunks.push(current.trim());
        current = part;
      } else {
        current += (current && !/[。！？；，：、]$/.test(current) ? ' ' : '') + part;
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function extractTextblockSpeech(node, options = {}) {
  if (!node) return '';
  let raw = '';
  node.descendants(child => {
    if (child.type.name === 'hard_break') {
      if (raw && !/[，。！？；：、\s]$/.test(raw)) raw += '，';
      return false;
    }
    if (child.isText) {
      if (options?.skipCode && child.marks?.some(mark => mark.type.name === 'code')) {
        const token = child.text.trim();
        if (/^[a-zA-Z_][a-zA-Z0-9_./:\\-]*$/.test(token)) return false;
      }
      raw += child.text;
    }
    return true;
  });
  return cleanSpeechText(raw || node.textContent, options);
}

export function extractSpeechSegments(parsed, options = {}) {
  if (!parsed?.doc || !Array.isArray(parsed.ranges)) return [];
  const maxChars = Number.isInteger(options?.maxChars) && options.maxChars > 40 ? options.maxChars : 220;
  const skipTypes = new Set(['front_matter', 'html_comment', 'html_anchor', 'toc', 'page_break', 'mermaid', 'code_block', 'horizontal_rule']);
  const segments = [];

  const collectFromRange = (range, includeCode) => {
    const node = range.node;
    if (!node) return;
    if (!includeCode && skipTypes.has(node.type.name)) return;
    if (includeCode && node.type.name !== 'code_block') return;

    const blocks = [];
    const isHeading = node.type.name === 'heading';
    if (node.type.name === 'table') {
      node.forEach(row => {
        const cells = [];
        row.forEach(cell => {
          const text = extractTextblockSpeech(cell, options);
          if (text) cells.push(text);
        });
        if (cells.length) blocks.push(cells.join('，'));
      });
    } else if (node.isTextblock || node.type.name === 'code_block') {
      const text = node.type.name === 'code_block' ? cleanSpeechText(node.textContent, options) : extractTextblockSpeech(node, options);
      if (text) blocks.push(text);
    } else {
      node.descendants(child => {
        if (skipTypes.has(child.type.name)) return false;
        if (child.isTextblock) {
          const text = extractTextblockSpeech(child, options);
          if (text) blocks.push(text);
          return false;
        }
        return true;
      });
    }

    for (const blockText of blocks) {
      for (const sentence of splitSpeechSentences(blockText, maxChars, options)) {
        segments.push({
          index: segments.length,
          text: sentence,
          preview: sentence.length > 42 ? sentence.slice(0, 42) + '…' : sentence,
          blockPosition: range.position,
          sourceFrom: range.from,
          sourceTo: range.to,
          isHeading,
        });
      }
    }
  };

  for (const range of parsed.ranges) collectFromRange(range, false);
  if (!segments.length) {
    for (const range of parsed.ranges) collectFromRange(range, true);
  }
  return segments;
}

function trimAudioBufferSilence(ctx, buffer) {
  if (!ctx || !buffer || buffer.numberOfChannels < 1 || buffer.length < 2400) return buffer;
  try {
    const sampleRate = buffer.sampleRate;
    const data = buffer.getChannelData(0);
    const threshold = 0.0025;
    let first = 0;
    while (first < data.length && Math.abs(data[first]) < threshold) first++;
    let last = data.length - 1;
    while (last > first && Math.abs(data[last]) < threshold) last--;
    const leadPad = Math.round(sampleRate * 0.02);
    const trailPad = Math.round(sampleRate * 0.045);
    const start = Math.max(0, first - leadPad);
    const end = Math.min(data.length, last + trailPad);
    if (start <= 200 && end >= data.length - 200) return buffer;
    const length = Math.max(1, end - start);
    const trimmed = ctx.createBuffer(buffer.numberOfChannels, length, sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      trimmed.copyToChannel(buffer.getChannelData(ch).subarray(start, end), ch, 0);
    }
    return trimmed;
  } catch {
    return buffer;
  }
}

export class SpeechController {
  constructor(options) {
    this.options = options;
    this.segments = [];
    this.currentIndex = -1;
    this.startIndex = 0;
    this.playing = false;
    this.paused = false;
    this.loading = false;
    this.sessionToken = 0;
    this.audioContext = null;
    this.sourceNode = null;
    this.currentBuffer = null;
    this.currentBufferRate = 1;
    this.startedAt = 0;
    this.pausedOffset = 0;
    this.advanceTimer = null;
    this.sleepTimer = null;
    this.stopAtTime = 0;
    this.audioBuffers = new Map();
    this.inflight = new Map();
    this.usingFallback = false;
  }

  get active() {
    return this.playing || this.paused || this.loading;
  }

  ensureContext() {
    if (!this.audioContext) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (Ctor) this.audioContext = new Ctor();
    }
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  stopSourceNode() {
    clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
    if (this.sourceNode) {
      try { this.sourceNode.onended = null; this.sourceNode.stop(); } catch {}
      try { this.sourceNode.disconnect(); } catch {}
      this.sourceNode = null;
    }
  }

  clearCache() {
    this.audioBuffers.clear();
    this.inflight.clear();
  }

  configureStopTimer() {
    clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    this.stopAtTime = 0;
    const mode = this.options.getStopMode?.() || 'continuous';
    const minutes = Number(mode);
    if (Number.isFinite(minutes) && minutes > 0) {
      const ms = minutes * 60 * 1000;
      this.stopAtTime = Date.now() + ms;
      this.sleepTimer = setTimeout(() => {
        if (this.active) {
          this.stop();
          this.options.onTimerStop?.(minutes);
        }
      }, ms);
    }
  }

  highlightBlock(position) {
    const dom = this.options.highlightBlock?.(position);
    if (dom) this.options.scrollIntoView?.(dom);
  }

  start(parsed, startSourceOffset = 0) {
    this.stop(false);
    const skipCode = !!this.options.getSkipCode?.();
    this.segments = extractSpeechSegments(parsed, { maxChars: 420, skipCode });
    if (!this.segments.length) {
      this.options.onEmpty?.();
      return false;
    }
    let startIndex = 0;
    if (startSourceOffset > 0) {
      const found = this.segments.findIndex(seg => seg.sourceTo > startSourceOffset);
      if (found >= 0) startIndex = found;
    }
    this.playing = true;
    this.paused = false;
    this.startIndex = startIndex;
    this.currentIndex = startIndex;
    this.pausedOffset = 0;
    this.configureStopTimer();
    this.sessionToken++;
    this.playSegment(this.currentIndex, this.sessionToken);
    return true;
  }

  speakSelection(rawText, blockPosition = null) {
    this.stop(false);
    const skipCode = !!this.options.getSkipCode?.();
    const sentences = splitSpeechSentences(rawText, 420, { skipCode });
    if (!sentences.length) {
      this.options.onEmpty?.();
      return false;
    }
    this.segments = sentences.map((sentence, idx) => ({
      index: idx,
      text: sentence,
      preview: sentence.length > 42 ? sentence.slice(0, 42) + '…' : sentence,
      blockPosition,
      sourceFrom: 0,
      sourceTo: 0,
      isHeading: false,
    }));
    this.playing = true;
    this.paused = false;
    this.startIndex = 0;
    this.currentIndex = 0;
    this.pausedOffset = 0;
    this.configureStopTimer();
    this.sessionToken++;
    this.playSegment(0, this.sessionToken);
    return true;
  }

  previewVoice(sampleText = '轻快落笔，顺手成文。正在为您试听当前有声书朗读音色与语速。') {
    return this.speakSelection(sampleText, null);
  }

  toggle() {
    if (!this.active) return false;
    if (this.paused) {
      this.paused = false;
      this.playing = true;
      const token = ++this.sessionToken;
      if (!this.usingFallback && this.currentBuffer) {
        this.startBufferPlayback(this.currentBuffer, this.pausedOffset, token, this.currentBufferRate);
        this.notifyState();
      } else {
        this.playSegment(this.currentIndex, token);
      }
    } else {
      const rate = normalizeSpeechRate(this.options.getRate?.());
      const playbackRatio = this.currentBufferRate > 0 ? (rate / this.currentBufferRate) : 1;
      if (!this.usingFallback && this.currentBuffer) {
        const elapsed = Math.max(0, (performance.now() - this.startedAt) / 1000) * playbackRatio;
        this.pausedOffset = Math.min(this.currentBuffer.duration, this.pausedOffset + elapsed);
      }
      this.paused = true;
      this.playing = false;
      this.loading = false;
      this.sessionToken++;
      this.stopSourceNode();
      if (window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
      this.notifyState();
    }
    return true;
  }

  step(delta, manual = false) {
    if (!this.segments.length) return;
    const nextIndex = this.currentIndex + delta;
    if (nextIndex < 0 || nextIndex >= this.segments.length) {
      this.stop();
      return;
    }
    if (!manual && delta > 0) {
      const mode = this.options.getStopMode?.() || 'continuous';
      if (mode === 'chapter' && nextIndex > this.startIndex && this.segments[nextIndex]?.isHeading) {
        this.stop();
        this.options.onChapterStop?.();
        return;
      }
      if (this.stopAtTime > 0 && Date.now() >= this.stopAtTime) {
        this.stop();
        return;
      }
    }
    this.playing = true;
    this.paused = false;
    this.currentIndex = nextIndex;
    this.pausedOffset = 0;
    this.currentBuffer = null;
    this.stopSourceNode();
    if (window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
    this.playSegment(this.currentIndex, ++this.sessionToken);
  }

  stop(notify = true) {
    this.sessionToken++;
    clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    this.stopAtTime = 0;
    this.playing = false;
    this.paused = false;
    this.loading = false;
    this.usingFallback = false;
    this.currentIndex = -1;
    this.pausedOffset = 0;
    this.currentBuffer = null;
    this.stopSourceNode();
    if (window.speechSynthesis?.speaking || window.speechSynthesis?.pending) window.speechSynthesis.cancel();
    this.highlightBlock(null);
    this.clearCache();
    if (notify) this.notifyState();
  }

  updateVoiceOrRate(voiceChanged = false) {
    if (voiceChanged) {
      this.clearCache();
      this.currentBuffer = null;
      this.pausedOffset = 0;
      if (this.playing && this.currentIndex >= 0) {
        this.stopSourceNode();
        if (window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
        this.playSegment(this.currentIndex, ++this.sessionToken);
        return;
      }
    } else if (!this.usingFallback && this.playing && this.currentBuffer && this.sourceNode) {
      const rate = normalizeSpeechRate(this.options.getRate?.());
      const ratio = Math.max(0.5, Math.min(2, rate / (this.currentBufferRate || 1)));
      this.sourceNode.playbackRate.value = ratio;
      clearTimeout(this.advanceTimer);
      const token = this.sessionToken;
      const remainingMs = Math.max(80, Math.round(((this.currentBuffer.duration - this.pausedOffset) / ratio) * 1000));
      this.advanceTimer = setTimeout(() => {
        if (token === this.sessionToken && this.playing && !this.paused) this.step(1);
      }, remainingMs + 250);
    }
    if (this.active) this.notifyState();
  }

  synthesisParams(segment) {
    const voice = normalizeSpeechVoice(this.options.getVoice?.());
    const rate = normalizeSpeechRate(this.options.getRate?.());
    const pitch = normalizeSpeechPitch(this.options.getPitch?.());
    const custom = this.options.getCustomConfig?.() || {};
    return {
      text: segment.text,
      voice,
      rate: String(rate),
      pitch,
      provider: custom.provider || 'edge',
      endpoint: custom.endpoint || '',
      model: custom.model || '',
      customVoice: custom.customVoice || '',
      apiKey: custom.apiKey || '',
      numericRate: rate,
    };
  }

  cacheKey(segment) {
    const p = this.synthesisParams(segment);
    return `${p.provider}:${p.voice}:${p.customVoice}:${p.rate}:${p.pitch}:${segment.index}:${segment.text}`;
  }

  async fetchSegmentBuffer(segment) {
    const key = this.cacheKey(segment);
    if (this.audioBuffers.has(key)) return this.audioBuffers.get(key);
    if (this.inflight.has(key)) return this.inflight.get(key);
    const params = this.synthesisParams(segment);
    const promise = (async () => {
      const response = await this.options.synthesize(params);
      if (!response?.data) throw new Error('未返回音频数据');
      const binary = atob(response.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const ctx = this.ensureContext();
      if (!ctx) throw new Error('当前环境不支持音频解码');
      const rawBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
      const trimmed = trimAudioBufferSilence(ctx, rawBuffer);
      const entry = { buffer: trimmed, synthesizedRate: params.numericRate };
      if (this.audioBuffers.size >= 20) {
        const oldestKey = this.audioBuffers.keys().next().value;
        this.audioBuffers.delete(oldestKey);
      }
      this.audioBuffers.set(key, entry);
      return entry;
    })();
    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }

  prefetch(index, token) {
    if (token !== this.sessionToken || index < 0 || index >= this.segments.length) return;
    if (!this.options.canUseNeural?.()) return;
    this.fetchSegmentBuffer(this.segments[index]).catch(() => {});
  }

  startBufferPlayback(buffer, offset, token, synthesizedRate = 1) {
    this.stopSourceNode();
    const ctx = this.ensureContext();
    const rate = normalizeSpeechRate(this.options.getRate?.());
    const ratio = Math.max(0.5, Math.min(2, rate / (synthesizedRate || 1)));
    const safeOffset = Math.max(0, Math.min(buffer.duration - 0.02, offset || 0));
    this.currentBuffer = buffer;
    this.currentBufferRate = synthesizedRate || rate;
    this.pausedOffset = safeOffset;
    this.startedAt = performance.now();
    let advanced = false;
    const finish = () => {
      if (advanced || token !== this.sessionToken || !this.playing || this.paused) return;
      advanced = true;
      clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
      this.step(1);
    };
    const remainingMs = Math.max(120, Math.round(((buffer.duration - safeOffset) / ratio) * 1000));
    this.advanceTimer = setTimeout(finish, remainingMs + 320);
    if (ctx) {
      try {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = ratio;
        source.connect(ctx.destination);
        source.onended = () => {
          if ((performance.now() - this.startedAt) >= remainingMs * 0.65) finish();
        };
        source.start(0, safeOffset);
        this.sourceNode = source;
      } catch {}
    }
  }

  async playSegment(index, token) {
    const segment = this.segments[index];
    if (!segment || token !== this.sessionToken) return;
    this.loading = true;
    this.highlightBlock(segment.blockPosition);
    this.notifyState();

    if (this.options.canUseNeural?.()) {
      try {
        const entry = await this.fetchSegmentBuffer(segment);
        if (token !== this.sessionToken || !this.playing || this.paused) return;
        this.usingFallback = false;
        this.loading = false;
        this.startBufferPlayback(entry.buffer, 0, token, entry.synthesizedRate);
        this.notifyState();
        this.prefetch(index + 1, token);
        this.prefetch(index + 2, token);
        this.prefetch(index + 3, token);
        return;
      } catch {
        if (token !== this.sessionToken || !this.playing || this.paused) return;
      }
    }
    this.playFallback(segment, token);
  }

  playFallback(segment, token) {
    if (!segment || token !== this.sessionToken || !this.playing || this.paused) return;
    this.usingFallback = true;
    this.loading = false;
    this.notifyState();
    const minDuration = Math.max(600, Math.min(2800, Math.round((segment.text.length * 65) / normalizeSpeechRate(this.options.getRate?.()))));
    const started = performance.now();
    let finished = false;
    const advance = () => {
      if (finished || token !== this.sessionToken || !this.playing || this.paused) return;
      finished = true;
      const elapsed = performance.now() - started;
      const waitMore = Math.max(0, minDuration - elapsed);
      this.advanceTimer = setTimeout(() => {
        if (token === this.sessionToken && this.playing && !this.paused) this.step(1);
      }, waitMore);
    };
    const synth = window.speechSynthesis;
    if (synth && typeof window.SpeechSynthesisUtterance === 'function') {
      try {
        synth.cancel();
        const utterance = new window.SpeechSynthesisUtterance(segment.text);
        utterance.lang = 'zh-CN';
        utterance.rate = normalizeSpeechRate(this.options.getRate?.());
        const voices = synth.getVoices?.() || [];
        const zhVoice = voices.find(v => /zh[-_]?CN/i.test(v.lang) && /Natural|Xiaoxiao|Yunxi|Huihui|Yaoyao|Kangkang/i.test(v.name)) || voices.find(v => /zh/i.test(v.lang));
        if (zhVoice) utterance.voice = zhVoice;
        utterance.onend = advance;
        utterance.onerror = advance;
        synth.speak(utterance);
        this.advanceTimer = setTimeout(advance, minDuration + 1500);
        return;
      } catch {}
    }
    this.advanceTimer = setTimeout(advance, minDuration);
  }

  notifyState() {
    const segment = this.segments[this.currentIndex] || null;
    this.options.onState?.({
      active: this.active,
      playing: this.playing,
      paused: this.paused,
      loading: this.loading,
      usingFallback: this.usingFallback,
      index: this.currentIndex,
      total: this.segments.length,
      segment,
    });
  }
}
