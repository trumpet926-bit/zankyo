// 基準音（音叉の代わり）：止めるまで同じ高さの音を鳴らし続ける

const DRONE_TIMBRES = [
  { id: 'fork', name: '音叉' },
  { id: 'soft', name: 'やわらか' },
  { id: 'brass', name: '金管' },
  { id: 'organ', name: 'オルガン' },
];

class Drone {
  constructor() {
    this.playing = false;
    this.midi = 70;
    this.timbre = 'fork';
    this.volume = 0.6;
    this.voice = null; // 今鳴っている音（発振器と音色のフィルター）
  }

  get frequency() {
    return referencePitch * Math.pow(2, (this.midi - 69) / 12);
  }

  async start() {
    this.ctx = getAudioContext();
    await this.ctx.resume();
    if (this.playing) return;
    this.output = this.ctx.createGain();
    this.output.gain.value = 0;
    this.output.connect(this.ctx.destination);
    this.voice = this.createVoice();
    this.playing = true;
    this.applyVolume(0.08); // 「プツッ」と鳴らないよう、少しずつ大きくする
  }

  stop() {
    if (!this.playing) return;
    const output = this.output;
    const voice = this.voice;
    const now = this.ctx.currentTime;
    output.gain.cancelScheduledValues(now);
    output.gain.setValueAtTime(output.gain.value, now);
    output.gain.linearRampToValueAtTime(0, now + 0.08);
    setTimeout(() => {
      voice.osc.stop();
      output.disconnect();
    }, 150);
    this.playing = false;
    this.voice = null;
  }

  setNote(midi) {
    this.midi = midi;
    if (this.playing) this.voice.osc.frequency.setTargetAtTime(this.frequency, this.ctx.currentTime, 0.01);
  }

  // 指定の時刻（AudioContext の秒）に高さを変える（音階の途中で調が変わるとき）
  setNoteAt(midi, time) {
    this.midi = midi;
    if (this.playing) this.voice.osc.frequency.setTargetAtTime(this.frequency, time, 0.01);
  }

  // 基準のA（ラ）が変わったときに、高さを合わせ直す
  retune() {
    this.setNote(this.midi);
  }

  setTimbre(timbre) {
    this.timbre = timbre;
    if (!this.playing) return;
    // 新しい音色に、短く重ねて切り替える
    const old = this.voice;
    const now = this.ctx.currentTime;
    old.gain.gain.setTargetAtTime(0, now, 0.02);
    setTimeout(() => old.osc.stop(), 200);
    this.voice = this.createVoice();
  }

  setVolume(volume) {
    this.volume = volume;
    if (this.playing) this.applyVolume(0.03);
  }

  applyVolume(time) {
    const now = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setValueAtTime(this.output.gain.value, now);
    this.output.gain.linearRampToValueAtTime(this.volume * this.volume * 0.6, now + time);
  }

  // 音色ごとに、倍音（音に含まれる高い成分）の混ぜ方を変える
  createVoice() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const freq = this.frequency;
    filter.type = 'lowpass';
    filter.frequency.value = 18000;
    if (this.timbre === 'fork') {
      osc.type = 'sine';
    } else if (this.timbre === 'soft') {
      osc.setPeriodicWave(this.wave([1, 0.3, 0.12, 0.04]));
    } else if (this.timbre === 'brass') {
      osc.type = 'sawtooth';
      filter.frequency.value = Math.min(freq * 5, 8000);
      gain.gain.value = 0.7;
    } else {
      osc.setPeriodicWave(this.wave([1, 0.7, 0.5, 0.35, 0.25, 0.15, 0.1, 0.08]));
      gain.gain.value = 0.7;
    }
    osc.frequency.value = freq;
    osc.connect(filter).connect(gain).connect(this.output);
    osc.start();
    return { osc, gain };
  }

  wave(harmonics) {
    const real = new Float32Array(harmonics.length + 1);
    const imag = new Float32Array(harmonics.length + 1);
    harmonics.forEach((amp, i) => { imag[i + 1] = amp; });
    return this.ctx.createPeriodicWave(real, imag);
  }
}
