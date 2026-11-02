// メトロノーム
// 音のタイミングがずれないよう、少し先の拍までまとめて予約して鳴らす

class Metronome {
  constructor() {
    this.bpm = 100;
    this.beats = 4;
    this.accent = true;
    this.isRunning = false;
    this.onBeat = null; // 拍が鳴った瞬間に呼ばれる（画面表示用）
    this.ctx = null;
    this.timer = null;
  }

  async start() {
    this.ctx = getAudioContext();
    await this.ctx.resume();
    this.currentBeat = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.isRunning = true;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    clearInterval(this.timer);
    this.isRunning = false;
  }

  schedule() {
    const lookahead = 0.1; // 0.1秒先まで予約
    while (this.nextTime < this.ctx.currentTime + lookahead) {
      const beat = this.currentBeat % this.beats;
      playClick(this.ctx, this.ctx.destination, this.nextTime, beat === 0 && this.accent && this.beats > 1);
      this.notifyBeat(this.nextTime, beat);
      this.nextTime += 60 / this.bpm;
      this.currentBeat = beat + 1;
    }
  }

  notifyBeat(time, beat) {
    const delay = (time - this.ctx.currentTime) * 1000;
    setTimeout(() => {
      if (this.isRunning && this.onBeat) this.onBeat(beat);
    }, Math.max(0, delay));
  }
}
