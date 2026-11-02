// 録音：マイクの音を録音し、録音中は音量と経過時間を onLevel に渡し続ける

class Recorder {
  constructor() {
    this.isRecording = false;
    this.onLevel = null; // (音量 0〜1, 経過秒数)
  }

  async start() {
    // 楽器の音をそのまま録るため、通話用の自動補正は切る
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    // ブラウザが対応している形式を選ぶ（Chrome/Android は webm、iPhone は mp4）
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']
      .find((type) => MediaRecorder.isTypeSupported(type));
    this.mediaRecorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();
    this.startedAt = performance.now();

    // 音量メーター用
    const ctx = getAudioContext();
    await ctx.resume();
    this.source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.source.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);

    this.isRecording = true;
    this.loop();
  }

  // 録音を止めて { blob, duration } を返す
  stop() {
    return new Promise((resolve) => {
      this.isRecording = false;
      cancelAnimationFrame(this.frame);
      const duration = (performance.now() - this.startedAt) / 1000;
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType });
        this.source.disconnect();
        this.stream.getTracks().forEach((track) => track.stop()); // マイクを解放する
        resolve({ blob, duration });
      };
      this.mediaRecorder.stop();
    });
  }

  loop() {
    if (!this.isRecording) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    let rms = 0;
    for (let i = 0; i < this.buf.length; i++) rms += this.buf[i] * this.buf[i];
    rms = Math.sqrt(rms / this.buf.length);
    // -60dB〜0dB を 0〜1 にする
    const level = Math.max(0, Math.min(1, (20 * Math.log10(rms + 1e-9) + 60) / 60));
    if (this.onLevel) this.onLevel(level, (performance.now() - this.startedAt) / 1000);
    this.frame = requestAnimationFrame(() => this.loop());
  }
}
