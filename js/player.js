// 録音の再生：大きなボタンで操作、速さの変更、区間（A〜B）のくり返し

class PracticePlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    // 速さを変えても、音の高さは変えない
    this.audio.preservesPitch = true;
    this.audio.webkitPreservesPitch = true;
    this.url = null;
    this.rate = 1;
    this.loopA = null;
    this.loopB = null;
    this.knownDuration = 0;
    this.onUpdate = null; // 表示を更新するとき
    this.onError = null; // 再生できない形式のとき

    this.audio.addEventListener('loadedmetadata', () => {
      // Chrome の録音は長さの情報がなく途中から再生できないことがあるので、一度最後まで読ませる
      if (this.audio.duration === Infinity) {
        this.fixingDuration = true;
        this.audio.currentTime = 1e101;
      }
      this.update();
    });
    this.audio.addEventListener('timeupdate', () => {
      if (this.fixingDuration) {
        this.fixingDuration = false;
        this.audio.currentTime = 0;
      }
    });
    ['play', 'pause', 'ended', 'durationchange', 'seeked'].forEach((name) => {
      this.audio.addEventListener(name, () => this.update());
    });
    this.audio.addEventListener('play', () => this.tick());
    this.audio.addEventListener('error', () => {
      if (this.onError) this.onError();
    });
  }

  load(blob, knownDuration) {
    this.audio.pause();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(blob);
    this.knownDuration = knownDuration || 0;
    this.loopA = null;
    this.loopB = null;
    this.fixingDuration = false;
    this.audio.src = this.url;
    this.audio.playbackRate = this.rate;
    this.update();
  }

  unload() {
    this.audio.pause();
    this.audio.removeAttribute('src');
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  get duration() {
    const d = this.audio.duration;
    return Number.isFinite(d) && d > 0 ? d : this.knownDuration;
  }

  get position() {
    return this.fixingDuration ? 0 : this.audio.currentTime;
  }

  get playing() {
    return !this.audio.paused;
  }

  toggle() {
    if (this.audio.paused) {
      if (this.loopB !== null && this.audio.currentTime >= this.loopB) this.audio.currentTime = this.loopA;
      this.audio.play().catch(() => {});
    } else {
      this.audio.pause();
    }
  }

  pause() {
    this.audio.pause();
  }

  seek(seconds) {
    this.audio.currentTime = Math.max(0, Math.min(this.duration || seconds, seconds));
    this.update();
  }

  skip(seconds) {
    this.seek(this.position + seconds);
  }

  setRate(rate) {
    this.rate = rate;
    this.audio.playbackRate = rate;
    this.update();
  }

  // 今の位置を、くり返しの始まり（A）にする
  setA() {
    this.loopA = this.position;
    if (this.loopB !== null && this.loopB <= this.loopA) this.loopB = null;
    this.update();
  }

  // 今の位置を、くり返しの終わり（B）にして、A に戻る
  setB() {
    if (this.loopA === null) this.loopA = 0;
    if (this.position <= this.loopA) return;
    this.loopB = this.position;
    this.seek(this.loopA);
  }

  clearLoop() {
    this.loopA = null;
    this.loopB = null;
    this.update();
  }

  // 再生中は細かく位置を見て、B に来たら A に戻す（timeupdate だけだと粗いため）
  tick() {
    if (this.audio.paused) return;
    if (this.loopB !== null && this.audio.currentTime >= this.loopB) this.audio.currentTime = this.loopA;
    this.update();
    requestAnimationFrame(() => this.tick());
  }

  update() {
    if (this.onUpdate) this.onUpdate();
  }
}
