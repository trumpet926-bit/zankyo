// 画面の操作

const settings = loadSettings();
const metronome = new Metronome();
const scalePlayer = new ScalePlayer();
const tuner = new Tuner();
const $ = (id) => document.getElementById(id);

// iPhone で消音スイッチがオンでも音を鳴らす
setAudioSessionForMic(false);

// マイクを使えなかったときの理由を、わかりやすい文にする
function micErrorMessage(e) {
  switch (e && e.name) {
    case 'NotAllowedError':
      return 'マイクの使用が許可されていません。iPhoneは「設定」→「アプリ」→「Safari」→「マイク」を「確認」か「許可」にして、アプリを開き直してください。';
    case 'NotFoundError':
      return 'マイクが見つかりませんでした。';
    case 'NotReadableError':
      return 'マイクを使えませんでした。通話中や、ほかのアプリがマイクを使っていないか確認してください。';
    default:
      return `マイクを使えませんでした。（${e && e.name ? e.name : '原因不明'}）`;
  }
}

// ---------- タブ ----------
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    if (tab.dataset.panel !== 'tuner') stopTuner(); // 他の画面ではマイクを使わない
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.panel').forEach((p) => {
      p.classList.toggle('active', p.id === `panel-${tab.dataset.panel}`);
    });
  });
});

// 再生中は画面が消えないようにする（対応している端末のみ）
let wakeLock = null;
async function keepScreenOn(on) {
  try {
    if (on && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
    } else if (!on && wakeLock) {
      const lock = wakeLock;
      wakeLock = null;
      await lock.release();
    }
  } catch (e) {
    // 対応していなくても問題なし
  }
}

// ---------- メトロノーム ----------
function setBpm(value) {
  const bpm = Math.min(240, Math.max(30, Math.round(value)));
  settings.bpm = bpm;
  metronome.bpm = bpm;
  $('bpmValue').textContent = bpm;
  $('bpmSlider').value = bpm;
  saveSettings(settings);
}

function renderBeatDots() {
  const dots = $('beatDots');
  dots.innerHTML = '';
  for (let i = 0; i < metronome.beats; i++) {
    const dot = document.createElement('div');
    dot.className = 'beat-dot';
    dots.appendChild(dot);
  }
}

metronome.onBeat = (beat) => {
  document.querySelectorAll('.beat-dot').forEach((dot, i) => {
    dot.classList.toggle('on', i === beat);
    dot.classList.toggle('strong', i === 0 && metronome.accent && metronome.beats > 1);
  });
};

$('bpmDown').addEventListener('click', () => setBpm(settings.bpm - 1));
$('bpmUp').addEventListener('click', () => setBpm(settings.bpm + 1));
$('bpmSlider').addEventListener('input', (e) => setBpm(Number(e.target.value)));

$('beatsSelect').addEventListener('change', (e) => {
  settings.beats = Number(e.target.value);
  metronome.beats = settings.beats;
  saveSettings(settings);
  renderBeatDots();
});

$('accentCheck').addEventListener('change', (e) => {
  settings.accent = e.target.checked;
  metronome.accent = settings.accent;
  saveSettings(settings);
});

function stopMetronome() {
  if (!metronome.isRunning) return;
  metronome.stop();
  $('startStop').textContent = 'スタート';
  document.querySelectorAll('.beat-dot').forEach((d) => d.classList.remove('on'));
  keepScreenOn(false);
}

async function startMetronome() {
  if (metronome.isRunning) return;
  scalePlayer.stop();
  await metronome.start();
  $('startStop').textContent = 'ストップ';
  keepScreenOn(true);
}

$('startStop').addEventListener('click', () => {
  if (metronome.isRunning) {
    stopMetronome();
  } else {
    startMetronome();
  }
});

// タップした間隔からテンポを決める
let tapTimes = [];
$('tapTempo').addEventListener('click', () => {
  const now = performance.now();
  if (tapTimes.length && now - tapTimes[tapTimes.length - 1] > 2000) tapTimes = [];
  tapTimes.push(now);
  tapTimes = tapTimes.slice(-5);
  if (tapTimes.length >= 2) {
    const avg = (tapTimes[tapTimes.length - 1] - tapTimes[0]) / (tapTimes.length - 1);
    setBpm(60000 / avg);
  }
});

// ---------- 音階 ----------
function currentScale() {
  const names = keyNamesFor(settings.scaleType);
  const tonicMidi = 60 + settings.scaleKey + settings.scaleOctave * 12;
  return buildScale(settings.scaleType, names[settings.scaleKey], tonicMidi);
}

function renderScale() {
  const names = keyNamesFor(settings.scaleType);
  const type = SCALE_TYPES.find((t) => t.id === settings.scaleType);

  const grid = $('keyGrid');
  grid.innerHTML = '';
  names.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.className = 'key-btn' + (i === settings.scaleKey ? ' selected' : '');
    btn.textContent = name;
    btn.addEventListener('click', () => setScaleOption('scaleKey', i));
    grid.appendChild(btn);
  });
  $('scaleOctave').value = settings.scaleOctave;

  const scale = currentScale();
  const first = scale.up[0];
  $('scaleTitle').textContent = `${first.name} ${type.name}`;
  $('scaleStart').textContent = `始めの音：${nameWithOctave(first.name, first.midi)}`;
  const chips = $('noteChips');
  chips.innerHTML = '';
  [scale.up, scale.down].forEach((notes) => {
    const row = document.createElement('div');
    row.className = 'chip-row';
    notes.forEach((note) => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = note.name;
      chip.addEventListener('click', () => playSingleNote(note.midi, chip));
      row.appendChild(chip);
    });
    chips.appendChild(row);
  });
}

// 音名ボタンを押したときに、その音を1つだけ鳴らす
async function playSingleNote(midi, chip) {
  const ctx = getAudioContext();
  await ctx.resume();
  playTone(ctx, ctx.destination, midi, ctx.currentTime + 0.01, 0.8);
  chip.classList.add('playing');
  setTimeout(() => chip.classList.remove('playing'), 800);
}

function setScaleOption(key, value) {
  settings[key] = value;
  saveSettings(settings);
  scalePlayer.stop(); // 再生中に設定を変えたら止める
  renderScale();
}

SCALE_TYPES.forEach((t) => {
  const option = document.createElement('option');
  option.value = t.id;
  option.textContent = t.name;
  $('scaleTypeSelect').appendChild(option);
});

$('scaleTypeSelect').addEventListener('change', (e) => setScaleOption('scaleType', e.target.value));
$('scaleOctave').addEventListener('change', (e) => setScaleOption('scaleOctave', Number(e.target.value)));

function setScaleBpm(value) {
  const bpm = Math.min(200, Math.max(30, Math.round(value)));
  settings.scaleBpm = bpm;
  $('scaleBpmValue').textContent = bpm;
  $('scaleBpmSlider').value = bpm;
  saveSettings(settings);
}
$('scaleBpmDown').addEventListener('click', () => setScaleBpm(settings.scaleBpm - 1));
$('scaleBpmUp').addEventListener('click', () => setScaleBpm(settings.scaleBpm + 1));
$('scaleBpmSlider').addEventListener('input', (e) => setScaleBpm(Number(e.target.value)));

[['notesPerBeat', 'value'], ['scaleClick', 'checked'], ['countIn', 'checked'], ['scaleRepeat', 'checked']]
  .forEach(([id, prop]) => {
    $(id)[prop] = settings[id];
    $(id).addEventListener('change', (e) => {
      settings[id] = prop === 'value' ? Number(e.target.value) : e.target.checked;
      saveSettings(settings);
    });
  });

scalePlayer.onNote = (index) => {
  document.querySelectorAll('#noteChips .chip').forEach((chip, i) => {
    chip.classList.toggle('playing', i === index);
  });
};

scalePlayer.onEnd = () => {
  $('scaleStartStop').textContent = '再生';
  document.querySelectorAll('#noteChips .chip').forEach((chip) => chip.classList.remove('playing'));
  keepScreenOn(false);
};

$('scaleStartStop').addEventListener('click', async () => {
  if (scalePlayer.isRunning) {
    scalePlayer.stop();
    return;
  }
  stopMetronome();
  const scale = currentScale();
  await scalePlayer.start({
    segments: [scale.up, scale.down].map((notes) => notes.map((n) => n.midi)),
    bpm: settings.scaleBpm,
    notesPerBeat: settings.notesPerBeat,
    click: settings.scaleClick,
    countIn: settings.countIn,
    repeat: settings.scaleRepeat,
  });
  $('scaleStartStop').textContent = '停止';
  keepScreenOn(true);
});

// ---------- チューナー ----------
let recentFreqs = [];
let lastHeard = 0;

// 細かいゆれを抑えるため、直近の値の真ん中（中央値）を使う
function smoothedFreq(freq) {
  recentFreqs.push(freq);
  recentFreqs = recentFreqs.slice(-7);
  const sorted = [...recentFreqs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function clearTunerDisplay() {
  recentFreqs = [];
  $('tunerNote').textContent = '–';
  $('tunerOctave').textContent = '';
  $('tunerFreq').innerHTML = '&nbsp;';
  $('tunerCents').innerHTML = '&nbsp;';
  $('meterNeedle').style.left = '50%';
  $('tunerDisplay').className = 'tuner-display';
}

tuner.onPitch = (freq) => {
  const now = performance.now();
  if (freq === null) {
    if (now - lastHeard > 300) recentFreqs = []; // 音が途切れたら、ためた値を捨てる
    if (now - lastHeard > 1500) clearTunerDisplay();
    return;
  }
  lastHeard = now;
  const f = smoothedFreq(freq);
  const note = frequencyToNote(f, settings.a4);
  const cents = Math.round(note.cents);
  const abs = Math.abs(cents);
  $('tunerNote').textContent = note.name;
  $('tunerOctave').textContent = note.octave;
  $('tunerFreq').textContent = `${f.toFixed(1)} Hz`;
  $('tunerCents').textContent = cents === 0 ? '±0' : (cents > 0 ? `+${cents}` : `${cents}`);
  $('meterNeedle').style.left = `${50 + cents}%`;
  $('tunerDisplay').className = 'tuner-display ' + (abs <= 5 ? 'good' : abs <= 15 ? 'warn' : 'bad');
};

function stopTuner() {
  if (!tuner.isRunning) return;
  tuner.stop();
  $('tunerStartStop').textContent = 'マイクをオン';
  clearTunerDisplay();
}

$('tunerStartStop').addEventListener('click', async () => {
  if (tuner.isRunning) {
    stopTuner();
    return;
  }
  $('tunerError').hidden = true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    $('tunerError').textContent = 'このブラウザ（またはこの開き方）ではマイクを使えません。';
    $('tunerError').hidden = false;
    return;
  }
  try {
    await tuner.start();
    $('tunerStartStop').textContent = 'マイクをオフ';
  } catch (e) {
    $('tunerError').textContent = micErrorMessage(e);
    $('tunerError').hidden = false;
  }
});

function setA4(value) {
  settings.a4 = Math.min(446, Math.max(435, value));
  setReferencePitch(settings.a4);
  $('a4Value').textContent = settings.a4;
  saveSettings(settings);
}
$('a4Down').addEventListener('click', () => setA4(settings.a4 - 1));
$('a4Up').addEventListener('click', () => setA4(settings.a4 + 1));

// ---------- 録音 ----------
const recorder = new Recorder();
let recordings = []; // 新しい順
let objectUrls = [];
let canSaveRecordings = true;
let metronomeStartedByRecorder = false;

function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatDate(time) {
  const d = new Date(time);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fileNameFor(rec) {
  const d = new Date(rec.createdAt);
  const pad = (n) => String(n).padStart(2, '0');
  const ext = rec.blob.type.includes('mp4') ? 'm4a' : 'webm';
  return `練習_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
}

function renderRecordings() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
  const list = $('recList');
  list.innerHTML = '';
  if (!canSaveRecordings) {
    list.innerHTML = '<p class="note">この開き方では録音を保存できないため、ページを閉じると消えます。</p>';
  }
  if (recordings.length === 0) {
    list.insertAdjacentHTML('beforeend', '<p class="note">まだ録音はありません。</p>');
    return;
  }
  recordings.forEach((rec) => {
    const url = URL.createObjectURL(rec.blob);
    objectUrls.push(url);
    const item = document.createElement('div');
    item.className = 'rec-item';
    item.innerHTML = `
      <div class="rec-head">
        <span class="rec-title">${formatDate(rec.createdAt)}</span>
        <span class="rec-dur">${formatTime(rec.duration)}</span>
      </div>
      <audio controls preload="metadata" src="${url}"></audio>
      <div class="rec-actions">
        <a class="btn small" href="${url}" download="${fileNameFor(rec)}">端末に保存</a>
        <button class="btn small danger">削除</button>
      </div>`;
    // Chrome の録音は長さの情報がなく、途中から再生できないことがあるので、一度最後まで読ませる
    const audio = item.querySelector('audio');
    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration === Infinity) {
        audio.currentTime = 1e101;
        audio.addEventListener('timeupdate', () => { audio.currentTime = 0; }, { once: true });
      }
    });
    item.querySelector('.danger').addEventListener('click', () => deleteRecording(rec));
    list.appendChild(item);
  });
}

async function loadRecordings() {
  try {
    const all = await recordingsDb.all();
    recordings = all.sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {
    canSaveRecordings = false;
  }
  renderRecordings();
}

async function deleteRecording(rec) {
  if (!confirm(`${formatDate(rec.createdAt)} の録音を削除しますか？`)) return;
  recordings = recordings.filter((r) => r.id !== rec.id);
  if (canSaveRecordings) {
    try { await recordingsDb.remove(rec.id); } catch (e) { /* 画面からは消す */ }
  }
  renderRecordings();
}

recorder.onLevel = (level, seconds) => {
  $('levelBar').style.width = `${level * 100}%`;
  $('recTime').textContent = formatTime(seconds);
};

function showRecError(message) {
  $('recError').textContent = message;
  $('recError').hidden = false;
}

async function startRecording() {
  $('recError').hidden = true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    showRecError('このブラウザ（またはこの開き方）では録音できません。');
    return;
  }
  stopTuner();
  try {
    await recorder.start();
  } catch (e) {
    showRecError(micErrorMessage(e));
    return;
  }
  if (settings.recWithMetronome && !metronome.isRunning) {
    await startMetronome();
    metronomeStartedByRecorder = true;
  }
  $('recButton').classList.add('recording');
  $('recStatus').textContent = '録音中…もう一度押すと止まります';
  document.querySelector('.tab[data-panel="recorder"]').classList.add('recording');
  keepScreenOn(true);
}

async function stopRecording() {
  const { blob, duration } = await recorder.stop();
  if (metronomeStartedByRecorder) {
    stopMetronome();
    metronomeStartedByRecorder = false;
  }
  $('recButton').classList.remove('recording');
  $('recStatus').textContent = '押すと録音を始めます';
  $('levelBar').style.width = '0%';
  $('recTime').textContent = '0:00';
  document.querySelector('.tab[data-panel="recorder"]').classList.remove('recording');
  keepScreenOn(false);

  const rec = { id: `rec-${Date.now()}`, createdAt: Date.now(), duration, blob };
  recordings.unshift(rec);
  if (canSaveRecordings) {
    try {
      await recordingsDb.add(rec);
    } catch (e) {
      canSaveRecordings = false;
    }
  }
  renderRecordings();
}

$('recButton').addEventListener('click', () => {
  if (recorder.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

$('recWithMetronome').checked = settings.recWithMetronome;
$('recWithMetronome').addEventListener('change', (e) => {
  settings.recWithMetronome = e.target.checked;
  saveSettings(settings);
});

// ---------- 初期表示 ----------
setA4(settings.a4);
loadRecordings();

metronome.beats = settings.beats;
metronome.accent = settings.accent;
$('beatsSelect').value = settings.beats;
$('accentCheck').checked = settings.accent;
setBpm(settings.bpm);
renderBeatDots();

$('scaleTypeSelect').value = settings.scaleType;
setScaleBpm(settings.scaleBpm);
renderScale();
