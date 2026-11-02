// メトロノーム
// 音のタイミングがずれないよう、少し先の拍までまとめて予約して鳴らす

// リズム：1拍の中で鳴らす位置（0=拍の頭、0.5=拍の真ん中）
const RHYTHMS = [
  { id: 'quarter', name: '4分音符', offsets: [0] },
  { id: 'eighth', name: '8分音符', offsets: [0, 1 / 2] },
  { id: 'triplet', name: '3連符', offsets: [0, 1 / 3, 2 / 3] },
  { id: 'sixteenth', name: '16分音符', offsets: [0, 1 / 4, 2 / 4, 3 / 4] },
  { id: 'shuffle', name: 'シャッフル', offsets: [0, 2 / 3] },
  { id: 'dotted', name: '付点8分\n＋16分', offsets: [0, 3 / 4] },
  { id: 'eighth-two16', name: '8分\n＋16分×2', offsets: [0, 1 / 2, 3 / 4] },
  { id: 'two16-eighth', name: '16分×2\n＋8分', offsets: [0, 1 / 4, 1 / 2] },
];

class Metronome {
  constructor() {
    this.bpm = 100;
    this.beats = 4;
    this.accent = true;
    this.rhythm = RHYTHMS[0];
    this.isRunning = false;
    this.onBeat = null; // 拍が鳴った瞬間に呼ばれる（画面表示用）
    this.ctx = null;
    this.timer = null;
  }

  setRhythm(id) {
    this.rhythm = RHYTHMS.find((r) => r.id === id) || RHYTHMS[0];
  }

  async start() {
    this.ctx = getAudioContext();
    await this.ctx.resume();
    this.output = this.ctx.createGain();
    this.output.connect(this.ctx.destination);
    this.currentBeat = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.isRunning = true;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    clearInterval(this.timer);
    if (this.output) this.output.disconnect(); // 予約済みの刻みの音も止める
    this.isRunning = false;
  }

  schedule() {
    const lookahead = 0.1; // 0.1秒先まで予約
    while (this.nextTime < this.ctx.currentTime + lookahead) {
      const beat = this.currentBeat % this.beats;
      const beatLen = 60 / this.bpm;
      playClick(this.ctx, this.output, this.nextTime, beat === 0 && this.accent && this.beats > 1);
      this.rhythm.offsets.slice(1).forEach((offset) => {
        playSubClick(this.ctx, this.output, this.nextTime + offset * beatLen);
      });
      this.notifyBeat(this.nextTime, beat);
      this.nextTime += beatLen;
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
