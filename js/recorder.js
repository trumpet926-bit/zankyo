// 録音：マイクの音を録音し、録音中は音量と経過時間を onLevel に渡し続ける

class Recorder {
  constructor() {
    this.isRecording = false;
    this.onLevel = null; // (音量 0〜1, 経過秒数)
  }

  // stream：すでに開いているマイク（時計から録音するときに使う）。渡したときは、止めても閉じない
  async start(stream = null) {
    this.ownStream = !stream;
    if (stream) setAudioSessionForMic(true); // 開いたままのマイクを使うときも、マイクを使う扱いにそろえる
    this.stream = stream || (await openMicrophone());
    // ブラウザが対応している形式を選ぶ（Chrome/Android は webm、iPhone は mp4）
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']
      .find((type) => MediaRecorder.isTypeSupported(type));
    // a little more than the default bit rate; data comes in every second (nothing is lost if the device hiccups at the end)
    this.mediaRecorder = new MediaRecorder(this.stream, Object.assign({ audioBitsPerSecond: 160000 }, mimeType ? { mimeType } : {}));
    this.chunks = [];
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start(1000);
    this.startedAt = performance.now();

    // 音量メーター用
    // 外付けのレコーダー（USB）は 44.1kHz などで動くことが多い。メトロノームと同じ音の部品（48kHz など）に
    // つなぐと、Android では途中で音が途切れることがあるため、音量メーターはマイクと同じ速さの別の部品で見る
    let ctx = getAudioContext();
    const micRate = (this.stream.getAudioTracks()[0].getSettings() || {}).sampleRate;
    this.meterCtx = null;
    if (micRate && micRate !== ctx.sampleRate) {
      try { this.meterCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: micRate }); ctx = this.meterCtx; } catch (e) { this.meterCtx = null; }
    }
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
        if (this.meterCtx) { this.meterCtx.close().catch(() => {}); this.meterCtx = null; }
        if (this.ownStream) closeMicrophone(this.stream);
        resolve({ blob, duration });
      };
      this.mediaRecorder.stop();
    });
  }

  loop() {
    if (!this.isRecording) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    const level = rmsToLevel(rmsOf(this.buf));
    if (this.onLevel) this.onLevel(level, (performance.now() - this.startedAt) / 1000);
    this.frame = requestAnimationFrame(() => this.loop());
  }
}
