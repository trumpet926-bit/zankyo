// チューナー：マイクの音を読み取り、周波数と音の大きさを onPitch に渡し続ける

// 感度（1=鈍い 〜 5=敏感）
// minRms: これより小さい音は無視する、threshold: 音程とみなす厳しさ
const TUNER_SENSITIVITY = {
  1: { minRms: 0.02, threshold: 0.12 },
  2: { minRms: 0.01, threshold: 0.15 },
  3: { minRms: 0.005, threshold: 0.17 },
  4: { minRms: 0.0025, threshold: 0.2 },
  5: { minRms: 0.0012, threshold: 0.22 },
};

class Tuner {
  constructor() {
    this.isRunning = false;
    this.onPitch = null; // (周波数(Hz) または null, 音の大きさ RMS)
    this.setSensitivity(4);
  }

  setSensitivity(level) {
    const s = TUNER_SENSITIVITY[level] || TUNER_SENSITIVITY[4];
    this.minRms = s.minRms;
    this.threshold = s.threshold;
  }

  async start() {
    this.ctx = getAudioContext();
    await this.ctx.resume();
    this.stream = await openMicrophone();
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.source.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.isRunning = true;
    this.loop();
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    cancelAnimationFrame(this.frame);
    this.source.disconnect();
    closeMicrophone(this.stream);
  }

  loop() {
    if (!this.isRunning) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    const rms = rmsOf(this.buf);
    const freq = rms >= this.minRms ? detectPitch(this.buf, this.ctx.sampleRate, this.threshold) : null;
    if (this.onPitch) this.onPitch(freq, rms);
    this.frame = requestAnimationFrame(() => this.loop());
  }
}
