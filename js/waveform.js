// 録音の波形。どこから演奏が始まっているか目で分かるようにし、押した場所から再生できるようにする

class Waveform {
  constructor(canvas) {
    this.canvas = canvas;
    this.peaks = null; // 0〜1 の大きさを、時間順に並べたもの
    this.duration = 0;
    this.state = { pos: 0, dur: 0, loopA: null, loopB: null };
    this.loading = false;
    this.cache = new Map(); // 録音ごとに一度だけ計算する
    this.loadId = 0;
    this.onSeek = null; // (秒)
    this.trim = null; // 切り取りの範囲 { start, end }（秒）。切り取りをしていないときは null
    this.onTrimChange = null;
    new ResizeObserver(() => this.draw()).observe(canvas);

    const timeAt = (e) => {
      const rect = canvas.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * (this.state.dur || this.duration);
    };
    // 押した・なぞった場所へ移動する。切り取り中は、近いほうの端（開始・終了）を動かす
    const move = (e) => {
      const dur = this.state.dur || this.duration;
      if (!this.peaks || !dur) return;
      const t = timeAt(e);
      if (this.trim) {
        if (this.dragging === 'start') this.trim.start = Math.min(t, this.trim.end - 0.1);
        else this.trim.end = Math.max(t, this.trim.start + 0.1);
        this.trim.start = Math.max(0, this.trim.start);
        this.trim.end = Math.min(dur, this.trim.end);
        this.draw();
        if (this.onTrimChange) this.onTrimChange(this.trim);
      } else if (this.onSeek) {
        this.onSeek(t);
      }
    };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      const t = timeAt(e);
      this.dragging = this.trim && Math.abs(t - this.trim.start) < Math.abs(t - this.trim.end) ? 'start' : 'end';
      move(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.dragging) move(e);
    });
    canvas.addEventListener('pointerup', () => {
      this.dragging = false;
    });
    canvas.addEventListener('pointercancel', () => {
      this.dragging = false;
    });
  }

  async load(blob, key) {
    const id = ++this.loadId;
    this.peaks = null;
    this.canvas.hidden = false;
    if (this.cache.has(key)) {
      ({ peaks: this.peaks, duration: this.duration } = this.cache.get(key));
      this.draw();
      return;
    }
    this.loading = true;
    this.draw();
    try {
      const buffer = await getAudioContext().decodeAudioData(await blob.arrayBuffer());
      if (id !== this.loadId) return; // 読み込み中に別の録音を開いた
      const result = { peaks: Waveform.computePeaks(buffer, 600), duration: buffer.duration };
      this.cache.set(key, result);
      ({ peaks: this.peaks, duration: this.duration } = result);
    } catch (e) {
      if (id === this.loadId) this.canvas.hidden = true; // 波形を作れない形式のときは出さない
    }
    if (id === this.loadId) {
      this.loading = false;
      this.draw();
    }
  }

  // count 個の区切りごとに、いちばん大きい振れ幅を求める（全部のチャンネルをまとめる）
  static computePeaks(buffer, count) {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    const size = Math.max(1, Math.floor(buffer.length / count));
    const peaks = new Float32Array(count);
    let max = 0;
    for (let i = 0; i < count; i++) {
      let peak = 0;
      const end = Math.min(buffer.length, (i + 1) * size);
      for (const data of channels) {
        for (let j = i * size; j < end; j += 4) peak = Math.max(peak, Math.abs(data[j]));
      }
      peaks[i] = peak;
      max = Math.max(max, peak);
    }
    // 小さい録音でも見えるよう、いちばん大きいところを 1 にそろえ、小さい音は少し大きめに描く
    for (let i = 0; i < count; i++) peaks[i] = max > 0 ? Math.sqrt(peaks[i] / max) : 0;
    return peaks;
  }

  update(state) {
    this.state = state;
    this.draw();
  }

  draw() {
    const canvas = this.canvas;
    if (canvas.hidden) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const css = getComputedStyle(canvas);
    const accent = css.getPropertyValue('--accent').trim();
    const muted = css.getPropertyValue('--muted').trim();

    if (!this.peaks) {
      ctx.fillStyle = muted;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.loading ? '波形を読み込んでいます…' : '', w / 2, h / 2 + 4);
      return;
    }

    const dur = this.state.dur || this.duration;
    const playedX = dur ? (this.state.pos / dur) * w : 0;

    // くり返しの区間（切り取り中は出さない）
    if (!this.trim && this.state.loopA !== null && dur) {
      const a = (this.state.loopA / dur) * w;
      const b = this.state.loopB !== null ? (this.state.loopB / dur) * w : playedX;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(a, 0, Math.max(0, b - a), h);
      ctx.globalAlpha = 1;
    }

    // 波形（2px ごとに1本の棒）
    const bar = 2;
    const mid = h / 2;
    for (let x = 0; x < w; x += bar + 1) {
      const peak = this.peaks[Math.min(this.peaks.length - 1, Math.floor((x / w) * this.peaks.length))];
      const half = Math.max(1, peak * (mid - 2));
      ctx.fillStyle = x < playedX ? accent : muted;
      ctx.globalAlpha = x < playedX ? 1 : 0.55;
      ctx.fillRect(x, mid - half, bar, half * 2);
    }
    ctx.globalAlpha = 1;

    // 切り取り：残さない部分を暗くし、開始・終了に持ち手を描く
    if (this.trim && dur) {
      const a = (this.trim.start / dur) * w;
      const b = (this.trim.end / dur) * w;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, 0, a, h);
      ctx.fillRect(b, 0, w - b, h);
      ctx.fillStyle = accent;
      [a, b].forEach((x) => {
        const cx = Math.min(w - 2, Math.max(2, x));
        ctx.fillRect(cx - 1.5, 0, 3, h);
        ctx.beginPath();
        ctx.arc(cx, h / 2, 7, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 今の位置
    ctx.fillStyle = accent;
    ctx.globalAlpha = this.trim ? 0.6 : 1;
    ctx.fillRect(Math.min(w - 2, Math.max(0, playedX - 1)), 0, 2, h);
    ctx.globalAlpha = 1;
  }

  startTrim() {
    const dur = this.state.dur || this.duration;
    this.trim = { start: 0, end: dur };
    this.draw();
    return this.trim;
  }

  stopTrim() {
    this.trim = null;
    this.draw();
  }
}

// 録音の start〜end 秒を、16bit の WAV ファイルにする（ステレオはステレオのまま）
function encodeWavRange(buffer, start, end) {
  const channels = Math.min(2, buffer.numberOfChannels);
  const from = Math.max(0, Math.floor(start * buffer.sampleRate));
  const to = Math.min(buffer.length, Math.ceil(end * buffer.sampleRate));
  const frames = Math.max(0, to - from);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  const out = new DataView(new ArrayBuffer(44 + frames * channels * 2));
  const text = (pos, s) => [...s].forEach((ch, i) => out.setUint8(pos + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  out.setUint32(4, 36 + frames * channels * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, channels, true);
  out.setUint32(24, buffer.sampleRate, true);
  out.setUint32(28, buffer.sampleRate * channels * 2, true);
  out.setUint16(32, channels * 2, true);
  out.setUint16(34, 16, true);
  text(36, 'data');
  out.setUint32(40, frames * channels * 2, true);
  let pos = 44;
  for (let i = from; i < to; i++) {
    for (let c = 0; c < channels; c++) {
      out.setInt16(pos, Math.max(-1, Math.min(1, data[c][i])) * 0x7fff, true);
      pos += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}
