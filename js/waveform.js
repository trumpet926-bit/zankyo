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
    new ResizeObserver(() => this.draw()).observe(canvas);

    // 押した・なぞった場所へ移動する
    const seekTo = (e) => {
      const dur = this.state.dur || this.duration;
      if (!this.peaks || !dur || !this.onSeek) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.onSeek(ratio * dur);
    };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.dragging = true;
      seekTo(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.dragging) seekTo(e);
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

    // くり返しの区間
    if (this.state.loopA !== null && dur) {
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

    // 今の位置
    ctx.fillStyle = accent;
    ctx.fillRect(Math.min(w - 2, Math.max(0, playedX - 1)), 0, 2, h);
  }
}
