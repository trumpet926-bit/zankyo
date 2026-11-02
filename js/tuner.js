// チューナー：マイクの音を読み取り、周波数を onPitch に渡し続ける

class Tuner {
  constructor() {
    this.isRunning = false;
    this.onPitch = null; // 周波数(Hz) または null（音がないとき）
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
    const freq = detectPitch(this.buf, this.ctx.sampleRate);
    if (this.onPitch) this.onPitch(freq);
    this.frame = requestAnimationFrame(() => this.loop());
  }
}
