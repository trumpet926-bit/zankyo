// チューナー：マイクの音を読み取り、周波数を onPitch に渡し続ける

class Tuner {
  constructor() {
    this.isRunning = false;
    this.onPitch = null; // 周波数(Hz) または null（音がないとき）
  }

  async start() {
    this.ctx = getAudioContext();
    await this.ctx.resume();
    // 楽器の音をそのまま拾うため、通話用の自動補正は切る
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
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
    this.stream.getTracks().forEach((track) => track.stop()); // マイクを解放する
  }

  loop() {
    if (!this.isRunning) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    const freq = detectPitch(this.buf, this.ctx.sampleRate);
    if (this.onPitch) this.onPitch(freq);
    this.frame = requestAnimationFrame(() => this.loop());
  }
}
