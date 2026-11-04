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
    this.sound = true; // false にすると音を出さずに拍だけ刻む（光だけで見るとき）
    this.isRunning = false;
    this.onBeat = null; // 拍が鳴った瞬間に呼ばれる（画面表示用）
    this.ctx = null;
    this.timer = null;
    // みんなで合わせるとき用
    this.audioLead = 0; // スピーカーから音が出るまでの遅れ（秒）。その分だけ早めに鳴らす
    this.pending = null; // 次に切り替える時間軸
    this.muteFrom = 0; // この間（AudioContext の時刻・秒）は音を出さない（音合わせ中）
    this.muteTo = 0;
  }

  setRhythm(id) {
    this.rhythm = RHYTHMS.find((r) => r.id === id) || RHYTHMS[0];
  }

  async prepare() {
    this.ctx = getAudioContext();
    await this.ctx.resume();
    if (!this.isRunning) {
      this.output = this.ctx.createGain();
      this.output.connect(audioOutput(this.ctx));
    }
  }

  // 音の出口を切り替えたとき、鳴らしている途中でもつなぎ直す
  reroute() {
    if (!this.output) return;
    this.output.disconnect();
    this.output.connect(audioOutput(this.ctx));
  }

  async start() {
    await this.prepare();
    this.audioLead = 0;
    this.pending = null;
    this.currentBeat = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.run();
  }

  // 時間軸（anchor=1拍目の時刻［AudioContextの時刻・秒］、bpm、拍子）に合わせて鳴らし始める
  // 1拍目の時刻がすでに過ぎていれば、今の位置の次の拍から刻む
  async startSynced(timeline, audioLead) {
    await this.prepare();
    this.audioLead = audioLead;
    this.pending = null;
    this.alignTo(timeline, this.ctx.currentTime + audioLead + 0.02);
    this.run();
  }

  // 鳴らしている途中で、指定の時刻から新しい時間軸に切り替える（テンポや拍子の変更）
  changeAt(timeline) {
    this.pending = timeline;
  }

  // 時計のずれを直すため、今の時間軸の位置に合わせ直す（ずれが小さいときだけ使う）
  realign(timeline) {
    if (!this.isRunning || this.pending) return;
    this.alignTo(timeline, this.nextTime - 30 / this.bpm);
  }

  // from 以降で最初の拍を、次に鳴らす拍にする
  alignTo({ anchor, bpm, beats }, from) {
    const beatLen = 60 / bpm;
    const n = Math.max(0, Math.ceil((from - anchor) / beatLen - 1e-6));
    this.bpm = bpm;
    this.beats = beats;
    this.nextTime = anchor + n * beatLen;
    this.currentBeat = n % beats;
  }

  run() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    clearInterval(this.timer);
    if (this.output) this.output.disconnect(); // 予約済みの刻みの音も止める
    this.output = null;
    this.pending = null;
    this.isRunning = false;
  }

  schedule() {
    const lookahead = 0.1; // 0.1秒先まで予約
    while (this.nextTime - this.audioLead < this.ctx.currentTime + lookahead) {
      // 新しい時間軸の切り替え時刻に来たら、そちらに乗り換える
      if (this.pending && this.nextTime >= this.pending.anchor - 30 / this.bpm) {
        const timeline = this.pending;
        this.pending = null;
        this.alignTo(timeline, this.nextTime - 30 / this.bpm);
        continue;
      }
      const beat = this.currentBeat % this.beats;
      const beatLen = 60 / this.bpm;
      const soundTime = Math.max(this.ctx.currentTime, this.nextTime - this.audioLead);
      const muted = soundTime >= this.muteFrom && soundTime <= this.muteTo;
      if (this.sound && !muted) {
        playClick(this.ctx, this.output, soundTime, beat === 0 && this.accent && this.beats > 1);
        this.rhythm.offsets.slice(1).forEach((offset) => {
          playSubClick(this.ctx, this.output, soundTime + offset * beatLen);
        });
      }
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
