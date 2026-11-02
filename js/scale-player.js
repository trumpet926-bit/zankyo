// 音階の再生
// メトロノームと同じく、少し先の音までまとめて予約して鳴らす（4拍子で数える）

class ScalePlayer {
  constructor() {
    this.isRunning = false;
    this.onNote = null; // 音が鳴った瞬間に呼ばれる（何番目の音か）
    this.onEnd = null;
    this.session = 0;
  }

  // segments: 小節の頭から始める音のまとまり（上行・下行）。例：[[60, 62, ...], [72, 71, ...]]
  async start({ segments, bpm, notesPerBeat, click, countIn, repeat }) {
    this.ctx = getAudioContext();
    await this.ctx.resume();
    this.output = this.ctx.createGain();
    this.output.connect(this.ctx.destination);
    this.session++;

    const beatLen = 60 / bpm;
    const noteLen = beatLen / notesPerBeat;
    this.events = [];
    let beatPos = 0;
    let index = 0;
    segments.forEach((midis) => {
      // まとまりの最後の音は、小節（4拍）の終わりまで伸ばす
      const segBeats = Math.ceil(midis.length / notesPerBeat / 4) * 4;
      const segEnd = (beatPos + segBeats) * beatLen;
      midis.forEach((midi, i) => {
        const t = beatPos * beatLen + i * noteLen;
        const dur = i === midis.length - 1 ? segEnd - t : noteLen;
        this.events.push({ t, midi, index: index++, dur });
      });
      beatPos += segBeats;
    });
    const cycleBeats = beatPos;
    this.cycleLen = cycleBeats * beatLen;
    if (click) {
      for (let b = 0; b < cycleBeats; b++) {
        this.events.push({ t: b * beatLen, click: true, strong: b % 4 === 0 });
      }
    }
    this.events.sort((a, b) => a.t - b.t);

    let startTime = this.ctx.currentTime + 0.1;
    if (countIn) {
      for (let b = 0; b < 4; b++) playClick(this.ctx, this.output, startTime + b * beatLen, b === 0);
      startTime += 4 * beatLen;
    }

    this.repeat = repeat;
    this.cycleStart = startTime;
    this.pos = 0;
    this.isRunning = true;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop() {
    if (!this.isRunning) return;
    clearInterval(this.timer);
    clearTimeout(this.endTimer);
    this.output.disconnect(); // 予約済みの音も止める
    this.isRunning = false;
    if (this.onEnd) this.onEnd();
  }

  schedule() {
    const horizon = this.ctx.currentTime + 0.1;
    while (true) {
      if (this.pos >= this.events.length) {
        if (!this.repeat) {
          clearInterval(this.timer);
          const remaining = (this.cycleStart + this.cycleLen - this.ctx.currentTime) * 1000;
          this.endTimer = setTimeout(() => this.stop(), Math.max(0, remaining));
          return;
        }
        this.cycleStart += this.cycleLen;
        this.pos = 0;
      }
      const ev = this.events[this.pos];
      const time = this.cycleStart + ev.t;
      if (time >= horizon) return;
      if (ev.click) {
        playClick(this.ctx, this.output, time, ev.strong);
      } else {
        playTone(this.ctx, this.output, ev.midi, time, ev.dur);
        this.notifyNote(time, ev.index);
      }
      this.pos++;
    }
  }

  notifyNote(time, index) {
    const session = this.session;
    const delay = (time - this.ctx.currentTime) * 1000;
    setTimeout(() => {
      if (this.isRunning && session === this.session && this.onNote) this.onNote(index);
    }, Math.max(0, delay));
  }
}
