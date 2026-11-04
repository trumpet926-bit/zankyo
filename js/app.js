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
const PANEL_ORDER = ['metronome', 'tuner', 'scale', 'recorder'];

function currentPanel() {
  return document.querySelector('.tab.active').dataset.panel;
}

// direction：右隣へ移るとき 1、左隣へ移るとき -1（画面が入ってくる向きに使う）
function showPanel(name, direction = 0) {
  if (name === currentPanel()) return;
  if (name !== 'tuner') {
    stopTuner(); // 他の画面ではマイクを使わない
    stopDrone();
  }
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.panel === name));
  document.querySelectorAll('.panel').forEach((p) => {
    const active = p.id === `panel-${name}`;
    p.classList.toggle('active', active);
    p.classList.remove('enter-right', 'enter-left');
    if (active && direction) {
      void p.offsetWidth; // 入ってくる動きを、毎回はじめから再生する
      p.classList.add(direction > 0 ? 'enter-right' : 'enter-left');
    }
  });
  window.scrollTo(0, 0);
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const from = PANEL_ORDER.indexOf(currentPanel());
    const to = PANEL_ORDER.indexOf(tab.dataset.panel);
    showPanel(tab.dataset.panel, Math.sign(to - from));
  });
});

// 横にスワイプして、隣の画面へ移る
(function () {
  let start = null;
  document.querySelector('main').addEventListener('touchstart', (e) => {
    const target = e.target;
    // スライダーや入力欄を動かしているときは、画面を切り替えない
    if (e.touches.length !== 1 || target.closest('input, select, textarea')) {
      start = null;
      return;
    }
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
  }, { passive: true });

  document.querySelector('main').addEventListener('touchend', (e) => {
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    const quick = Date.now() - start.time < 600;
    start = null;
    // はっきり横に、ある程度の長さを、すばやく動かしたときだけ
    if (!quick || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
    const index = PANEL_ORDER.indexOf(currentPanel());
    const next = index + (dx < 0 ? 1 : -1); // 左へ払うと右隣へ
    if (next < 0 || next >= PANEL_ORDER.length) return;
    showPanel(PANEL_ORDER[next], dx < 0 ? 1 : -1);
  }, { passive: true });
})();

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
// 部屋（みんなで合わせる）に入っている間は、テンポ・拍子・スタート／ストップを部屋に送る
// 中身は sync-ui.js が差し込む
const syncHooks = { active: () => false, toggle: null, bpm: null, beats: null, room: null, onLeave: null };

function showBpm(bpm) {
  $('bpmValue').textContent = bpm;
  $('bpmSlider').value = bpm;
  $('bigBpm').textContent = bpm;
  $('miniBpm').textContent = bpm;
}

// テンポの数字を押すと、その場で数字を入力できる
// （標準の入力ダイアログは iPhone で閉じたあと画面がずれることがあるため使わない）
function makeTempoEditable(button, getValue, setValue) {
  button.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.pattern = '[0-9]*';
    input.maxLength = 3;
    input.enterKeyHint = 'done';
    input.className = 'tempo-input ' + button.className.replace('tempo-edit', '');
    input.value = getValue();
    button.hidden = true;
    button.after(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (apply) => {
      if (done) return;
      done = true;
      const value = parseInt(input.value, 10);
      if (apply && Number.isFinite(value)) setValue(value); // 範囲外の数字は、使える範囲に収める
      input.remove();
      button.hidden = false;
      window.scrollTo(window.scrollX, window.scrollY);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  });
}

function setBpm(value) {
  const bpm = Math.min(240, Math.max(30, Math.round(value)));
  settings.bpm = bpm;
  saveSettings(settings);
  showBpm(bpm);
  if (syncHooks.active()) {
    syncHooks.bpm(bpm);
  } else {
    metronome.bpm = bpm;
  }
}

function renderBeatDots(count = metronome.beats) {
  [$('beatDots'), $('bigDots')].forEach((dots) => {
    dots.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('div');
      dot.className = 'beat-dot';
      dots.appendChild(dot);
    }
  });
}

metronome.onBeat = (beat) => {
  const strong = beat === 0 && metronome.accent && metronome.beats > 1;
  if (settings.metroLight) {
    document.querySelectorAll('.beat-dot').forEach((dot) => {
      const i = Array.prototype.indexOf.call(dot.parentNode.children, dot);
      dot.classList.toggle('on', i === beat);
      dot.classList.toggle('strong', i === 0 && strong);
    });
  }
  if (!$('bigView').hidden) showBigBeat(beat, strong);
  // 上の小さなボタンの点も、拍に合わせて光らせる
  if (settings.metroLight) {
    const dot = $('miniDot');
    dot.classList.remove('on', 'strong');
    void dot.offsetWidth;
    dot.classList.add('on');
    dot.classList.toggle('strong', strong);
  }
};

// ---------- 大きな表示 ----------
function showBigBeat(beat, strong) {
  $('bigBeat').textContent = beat + 1;
  $('bigBeat').classList.toggle('strong', strong);
  if (!settings.metroLight) return;
  // 光らせるアニメーションを、毎拍はじめから再生し直す
  const flash = $('bigFlash');
  flash.className = 'big-flash';
  void flash.offsetWidth;
  flash.style.animationDuration = `${Math.min(0.35, (60 / metronome.bpm) * 0.8)}s`;
  flash.className = 'big-flash ' + (strong ? 'flash-strong' : 'flash');
}

function clearBeatDisplay() {
  document.querySelectorAll('.beat-dot').forEach((d) => d.classList.remove('on'));
  $('bigBeat').textContent = '–';
  $('bigBeat').classList.remove('strong');
  $('bigFlash').className = 'big-flash';
}

$('openBigView').addEventListener('click', () => {
  $('bigView').hidden = false;
  keepScreenOn(true);
});
$('closeBigView').addEventListener('click', () => {
  $('bigView').hidden = true;
  if (!metronome.isRunning) keepScreenOn(false);
});
$('bigBpmDown').addEventListener('click', () => setBpm(settings.bpm - 1));
$('bigBpmUp').addEventListener('click', () => setBpm(settings.bpm + 1));
$('bigStartStop').addEventListener('click', () => toggleMetronomeByUser());

// 音と光のオン・オフ（通常の画面と大きな表示の両方にある）
function renderToggles() {
  document.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.setAttribute('aria-pressed', settings[btn.dataset.toggle] ? 'true' : 'false');
  });
}
document.querySelectorAll('[data-toggle]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.toggle;
    settings[key] = !settings[key];
    metronome.sound = settings.metroSound;
    if (!settings.metroLight) clearBeatDisplay();
    saveSettings(settings);
    renderToggles();
  });
});

$('bpmDown').addEventListener('click', () => setBpm(settings.bpm - 1));
$('bpmUp').addEventListener('click', () => setBpm(settings.bpm + 1));
$('bpmSlider').addEventListener('input', (e) => setBpm(Number(e.target.value)));

$('beatsSelect').addEventListener('change', (e) => {
  settings.beats = Number(e.target.value);
  saveSettings(settings);
  if (syncHooks.active()) {
    syncHooks.beats(settings.beats);
    return;
  }
  metronome.beats = settings.beats;
  renderBeatDots();
});

$('accentCheck').addEventListener('change', (e) => {
  settings.accent = e.target.checked;
  metronome.accent = settings.accent;
  saveSettings(settings);
});

// リズムのボタン（1拍分を音符で示す）
function renderRhythms() {
  const grid = $('rhythmGrid');
  grid.innerHTML = '';
  RHYTHMS.forEach((r) => {
    const btn = document.createElement('button');
    btn.className = 'rhythm-btn' + (r.id === settings.rhythm ? ' selected' : '');
    btn.setAttribute('aria-label', r.name.replace('\n', ''));
    btn.innerHTML = `${rhythmIcon(r.id)}<span class="rhythm-name">${r.name}</span>`;
    btn.addEventListener('click', () => {
      settings.rhythm = r.id;
      metronome.setRhythm(r.id);
      saveSettings(settings);
      renderRhythms();
    });
    grid.appendChild(btn);
  });
}

const MINI_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
const MINI_STOP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>';

function showMetronomeRunning(running) {
  $('startStop').textContent = running ? 'ストップ' : 'スタート';
  $('bigStartStop').textContent = running ? 'ストップ' : 'スタート';
  $('miniIcon').innerHTML = running ? MINI_STOP : MINI_PLAY;
  $('miniMetro').classList.toggle('running', running);
  if (!running) $('miniDot').classList.remove('on', 'strong');
  if (running) {
    keepScreenOn(true);
  } else {
    clearBeatDisplay();
    if ($('bigView').hidden) keepScreenOn(false);
  }
}

// この端末のメトロノームだけを止める（部屋の全員は止めない）
function stopMetronome() {
  if (!metronome.isRunning) return;
  metronome.stop();
  showMetronomeRunning(false);
}

async function startMetronome() {
  if (metronome.isRunning) return;
  scalePlayer.stop();
  await metronome.start();
  showMetronomeRunning(true);
  usage.track('metronome');
}

// スタート／ストップのボタン（部屋に入っていれば全員のメトロノームを動かす）
function toggleMetronomeByUser() {
  if (syncHooks.active()) {
    syncHooks.toggle();
  } else if (metronome.isRunning) {
    stopMetronome();
  } else {
    startMetronome();
  }
}

$('startStop').addEventListener('click', () => toggleMetronomeByUser());
$('miniMetro').addEventListener('click', () => toggleMetronomeByUser());
makeTempoEditable($('bpmValue'), () => settings.bpm, setBpm);

// タップした間隔からテンポを決める（指が触れた瞬間に反応させて、間隔を正確にとる）
let tapTimes = [];
$('tapTempo').addEventListener('pointerdown', (e) => {
  e.preventDefault();
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
  document.querySelectorAll('#scaleTypes button').forEach((b) => {
    b.classList.toggle('selected', b.dataset.type === settings.scaleType);
  });
  document.querySelectorAll('#scaleOctaves button').forEach((b) => {
    b.classList.toggle('selected', Number(b.dataset.octave) === settings.scaleOctave);
  });

  const scale = currentScale();
  const first = scale.up[0];
  $('scaleTitle').textContent = `${first.name} ${type.name}`;
  $('scaleStart').textContent = `始めの音：${nameWithOctave(first.name, first.midi)}`;
  $('openGuideLabel').textContent = `「${type.name}」の特徴と吹き方`;
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

// 音階の種類と始める高さは、押して選ぶボタンにする
SCALE_TYPES.forEach((t) => {
  const btn = document.createElement('button');
  btn.className = 'chip-btn';
  btn.dataset.type = t.id;
  btn.textContent = t.name.replace('（', '\n（'); // 「3度音階（長調）」は（の前で改行する
  btn.addEventListener('click', () => setScaleOption('scaleType', t.id));
  $('scaleTypes').appendChild(btn);
});
document.querySelectorAll('#scaleOctaves button').forEach((b) => {
  b.addEventListener('click', () => setScaleOption('scaleOctave', Number(b.dataset.octave)));
});

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
makeTempoEditable($('scaleBpmValue'), () => settings.scaleBpm, setScaleBpm);

[['scaleClick', 'checked'], ['countIn', 'checked'], ['scaleRepeat', 'checked']]
  .forEach(([id, prop]) => {
    $(id)[prop] = settings[id];
    $(id).addEventListener('change', (e) => {
      settings[id] = e.target.checked;
      saveSettings(settings);
    });
  });

// 音の長さ（1拍あたりの音の数）：2分音符＝0.5、4分音符＝1、8分音符＝2
const NOTE_LENGTHS = [
  { value: 0.5, icon: 'half', name: '2分音符', sub: '1音を2拍' },
  { value: 1, icon: 'quarter', name: '4分音符', sub: '1音を1拍' },
  { value: 2, icon: 'eighth', name: '8分音符', sub: '1拍に2音' },
];

function renderNoteLengths() {
  const box = $('noteLengths');
  box.innerHTML = '';
  NOTE_LENGTHS.forEach((n) => {
    const btn = document.createElement('button');
    btn.className = 'rhythm-btn' + (n.value === settings.notesPerBeat ? ' selected' : '');
    btn.setAttribute('aria-label', `${n.name}（${n.sub}）`);
    btn.innerHTML = `${rhythmIcon(n.icon)}<span class="rhythm-name">${n.name}\n${n.sub}</span>`;
    btn.addEventListener('click', () => {
      setScaleOption('notesPerBeat', n.value);
      renderNoteLengths();
    });
    box.appendChild(btn);
  });
}
renderNoteLengths();

// ---------- 音階の解説 ----------
const GUIDE_ORDER = ['basics', ...SCALE_TYPES.map((t) => t.id)];

function renderGuide(id) {
  const guide = SCALE_GUIDE[id];
  const tabs = $('guideTabs');
  tabs.innerHTML = '';
  GUIDE_ORDER.forEach((key) => {
    const btn = document.createElement('button');
    btn.className = 'chip-btn' + (key === id ? ' selected' : '');
    btn.textContent = SCALE_GUIDE[key].title.replace('（長調）', '');
    btn.addEventListener('click', () => renderGuide(key));
    tabs.appendChild(btn);
  });

  const list = (items) => `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
  let html = `<h3>${guide.title}</h3><p class="guide-lead">${guide.summary}</p>`;
  if (guide.facts) {
    html += `<dl class="guide-facts">${guide.facts.map((f) => `<dt>${f.label}</dt><dd>${f.text}</dd>`).join('')}</dl>`;
  }
  guide.sections.forEach((s) => {
    // 「世界の音楽院・名教師」の話は、地球のマーク付きの囲みにする
    html += s.style === 'world'
      ? `<section class="guide-world"><h4><span aria-hidden="true">🌍</span>${s.heading}</h4>${list(s.items)}</section>`
      : `<h4>${s.heading}</h4>${list(s.items)}`;
  });
  if (guide.practice) html += `<h4>このアプリでの練習</h4><p>${guide.practice}</p>`;
  if (guide.terms) {
    html += `<div class="guide-terms"><div class="guide-terms-head">用語メモ</div><dl>${
      guide.terms.map((t) => `<dt>${t.term}</dt><dd>${t.desc}</dd>`).join('')}</dl></div>`;
  }
  if (id !== 'basics') html += '<button class="btn primary full-width" id="guidePractice">この音階を練習する</button>';
  html += '<p class="note small-note guide-foot">指導の方法は先生や流派によって違うこともあります。迷ったときは、ふだん習っている先生の方針を優先してください。</p>';
  $('guideBody').innerHTML = html;
  $('guideView').scrollTop = 0;
  const practice = $('guidePractice');
  if (practice) {
    practice.addEventListener('click', () => {
      setScaleOption('scaleType', id);
      closeGuide();
    });
  }
}

function openGuide() {
  renderGuide(settings.scaleType);
  $('guideView').hidden = false;
  usage.track('guide');
  document.body.style.overflow = 'hidden'; // 後ろの画面がスクロールしないようにする
}

function closeGuide() {
  $('guideView').hidden = true;
  document.body.style.overflow = '';
}

$('openGuide').addEventListener('click', openGuide);
$('closeGuide').addEventListener('click', closeGuide);

scalePlayer.onNote = (index) => {
  document.querySelectorAll('#noteChips .chip').forEach((chip, i) => {
    chip.classList.toggle('playing', i === index);
  });
};

scalePlayer.onEnd = () => {
  $('scaleStartStop').textContent = '再生';
  document.querySelectorAll('#noteChips .chip').forEach((chip) => chip.classList.remove('playing'));
  keepScreenOn(false);
  if (recordingMode === 'scale') finishRecordingSoon(); // 音階を録音していたら、録音も止める
};

$('scaleStartStop').addEventListener('click', () => {
  if (scalePlayer.isRunning) {
    scalePlayer.stop();
    return;
  }
  startScale();
});

async function startScale() {
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
  usage.track('scale');
}

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
  if (!tuner.isRunning) $('tunerLevel').style.width = '0%';
}

function setTunerSensitivity(level) {
  settings.tunerSensitivity = level;
  tuner.setSensitivity(level);
  $('tunerSensitivity').value = level;
  $('tunerLevelMark').style.left = `${rmsToLevel(tuner.minRms) * 100}%`;
  saveSettings(settings);
}
$('tunerSensitivity').addEventListener('input', (e) => setTunerSensitivity(Number(e.target.value)));

tuner.onPitch = (freq, rms) => {
  $('tunerLevel').style.width = `${rmsToLevel(rms) * 100}%`;
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
  stopDrone(); // 基準音をマイクが拾わないように止める
  try {
    await tuner.start();
    $('tunerStartStop').textContent = 'マイクをオフ';
    usage.track('tuner');
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
  drone.retune();
  renderDrone();
}
$('a4Down').addEventListener('click', () => setA4(settings.a4 - 1));
$('a4Up').addEventListener('click', () => setA4(settings.a4 + 1));

// ---------- 基準音（音叉の代わり） ----------
const drone = new Drone();
const DRONE_LOWEST = 36; // C2
const DRONE_HIGHEST = 84; // C6

function renderDrone() {
  $('droneName').textContent = nameWithOctave(KEY_NAMES[drone.midi % 12], drone.midi);
  $('droneFreq').textContent = `${drone.frequency.toFixed(1)} Hz`;
  $('droneToggle').textContent = drone.playing ? '止める' : '鳴らす';
  $('droneToggle').classList.toggle('playing', drone.playing);
  $('dronePrev').disabled = drone.midi <= DRONE_LOWEST;
  $('droneNext').disabled = drone.midi >= DRONE_HIGHEST;
  $('droneOctDown').disabled = drone.midi - 12 < DRONE_LOWEST;
  $('droneOctUp').disabled = drone.midi + 12 > DRONE_HIGHEST;
  document.querySelectorAll('#droneTimbres button').forEach((b) => {
    b.classList.toggle('selected', b.dataset.timbre === drone.timbre);
  });
}

function setDroneNote(midi) {
  if (midi < DRONE_LOWEST || midi > DRONE_HIGHEST) return;
  drone.setNote(midi);
  settings.droneMidi = midi;
  saveSettings(settings);
  renderDrone();
}

// 今のオクターブの中で、指定の音（0=C 〜 11=B）を選ぶ
function setDronePitchClass(pc) {
  const octaveBase = drone.midi - (drone.midi % 12);
  setDroneNote(octaveBase + pc);
}

function stopDrone() {
  if (!drone.playing) return;
  drone.stop();
  renderDrone();
}

$('droneToggle').addEventListener('click', async () => {
  if (drone.playing) {
    stopDrone();
    return;
  }
  stopTuner(); // マイクが基準音を拾わないようにする
  await drone.start();
  renderDrone();
  usage.track('drone');
});
$('dronePrev').addEventListener('click', () => setDroneNote(drone.midi - 1));
$('droneNext').addEventListener('click', () => setDroneNote(drone.midi + 1));
$('droneOctDown').addEventListener('click', () => setDroneNote(drone.midi - 12));
$('droneOctUp').addEventListener('click', () => setDroneNote(drone.midi + 12));
$('droneBb').addEventListener('click', () => setDronePitchClass(10));
$('droneA').addEventListener('click', () => setDronePitchClass(9));

DRONE_TIMBRES.forEach((t) => {
  const btn = document.createElement('button');
  btn.dataset.timbre = t.id;
  btn.textContent = t.name;
  btn.addEventListener('click', () => {
    drone.setTimbre(t.id);
    settings.droneTimbre = t.id;
    saveSettings(settings);
    renderDrone();
  });
  $('droneTimbres').appendChild(btn);
});

$('droneVolume').addEventListener('input', (e) => {
  drone.setVolume(Number(e.target.value));
  settings.droneVolume = drone.volume;
  saveSettings(settings);
});

drone.midi = settings.droneMidi;
drone.timbre = settings.droneTimbre;
drone.volume = settings.droneVolume;
$('droneVolume').value = drone.volume;

// ---------- 録音 ----------
const recorder = new Recorder();
const player = new PracticePlayer();
let recordings = []; // 新しい順
let selectedId = null; // プレーヤーで開いている録音
let canSaveRecordings = true;
let metronomeStartedByRecorder = false;

function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// 0.1秒まで表示する（例：1:05.3）
function formatTimeFine(seconds) {
  const tenths = Math.floor(seconds * 10);
  return `${formatTime(tenths / 10)}.${tenths % 10}`;
}

function formatDate(time) {
  const d = new Date(time);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 録音1件：{ id, createdAt, duration, blob, name?（付けた名前）, fileName?（取り込んだファイル名）, imported? }
function displayName(rec) {
  return rec.name || formatDate(rec.createdAt);
}

const EXTENSIONS = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/aac': 'aac', 'audio/webm': 'webm' };
const MIME_TYPES = { m4a: 'audio/mp4', mp4: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac', webm: 'audio/webm' };

function fileNameFor(rec) {
  if (rec.fileName) return rec.fileName;
  const d = new Date(rec.createdAt);
  const pad = (n) => String(n).padStart(2, '0');
  const ext = EXTENSIONS[rec.blob.type.split(';')[0]] || 'webm';
  const base = rec.name
    ? rec.name.replace(/[\\/:*?"<>|]/g, '_')
    : `練習_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${base}.${ext}`;
}

function renderRecordings() {
  const list = $('recList');
  list.innerHTML = '';
  if (!canSaveRecordings) {
    list.innerHTML = '<p class="note">この開き方では録音を保存できないため、ページを閉じると消えます。</p>';
  }
  if (recordings.length === 0) {
    list.insertAdjacentHTML('beforeend', '<p class="note">まだ録音はありません。「ファイルを開く」で、スマホに保存した音声も取り込めます。</p>');
    return;
  }
  recordings.forEach((rec) => {
    const item = document.createElement('div');
    item.className = 'rec-item' + (rec.id === selectedId ? ' selected' : '');
    item.innerHTML = `
      <button class="rec-main">
        <span class="rec-title"></span>
        <span class="rec-meta">${formatDate(rec.createdAt)} ・ ${formatTime(rec.duration)}${rec.imported ? ' ・ 取り込み' : ''}</span>
      </button>
      <div class="rec-actions">
        <button class="btn small" data-act="rename">名前</button>
        <button class="btn small" data-act="share">共有・保存</button>
        <button class="btn small danger" data-act="delete">削除</button>
      </div>`;
    item.querySelector('.rec-title').textContent = displayName(rec); // 名前は文字としてそのまま表示する
    item.querySelector('.rec-main').addEventListener('click', () => openInPlayer(rec, true));
    item.querySelector('[data-act="rename"]').addEventListener('click', () => startRename(item, rec));
    item.querySelector('[data-act="share"]').addEventListener('click', () => shareRecording(rec));
    item.querySelector('[data-act="delete"]').addEventListener('click', () => deleteRecording(rec));
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

// ほかの機能で作った録音（合奏録音など）を一覧に加えて、録音の画面で開く
async function addRecordingFromBlob(blob, name) {
  const rec = {
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    duration: await audioDuration(blob),
    blob,
    name,
  };
  recordings.unshift(rec);
  await storeRecording(rec);
  renderRecordings();
  showPanel('recorder');
  openInPlayer(rec, false);
  return rec;
}

async function storeRecording(rec) {
  if (!canSaveRecordings) return;
  try {
    await recordingsDb.add(rec);
  } catch (e) {
    canSaveRecordings = false;
  }
}

// 名前は一覧の中で直接書き換える
// （ブラウザ標準の入力ダイアログは、iPhone のホーム画面アプリで閉じたあとにボタンが押せなくなることがあるため使わない）
function startRename(item, rec) {
  item.querySelector('.rec-main').hidden = true;
  item.querySelector('.rec-actions').hidden = true;
  const form = document.createElement('form');
  form.className = 'rename-form';
  form.innerHTML = `
    <input type="text" maxlength="40" class="rename-input" placeholder="例：〇〇の曲 Bメロ" enterkeyhint="done">
    <div class="rec-actions">
      <button type="button" class="btn small" data-act="cancel">やめる</button>
      <button type="submit" class="btn small primary">保存</button>
    </div>`;
  const input = form.querySelector('input');
  input.value = rec.name || '';
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    rec.name = input.value.trim().slice(0, 40) || undefined;
    storeRecording(rec);
    finishRename();
    if (rec.id === selectedId) $('playerTitle').textContent = displayName(rec);
  });
  form.querySelector('[data-act="cancel"]').addEventListener('click', finishRename);
  item.appendChild(form);
  input.focus();
}

function finishRename() {
  // キーボードを閉じ、iPhone で画面の位置がずれたままにならないよう、位置を合わせ直す
  if (document.activeElement) document.activeElement.blur();
  window.scrollTo(window.scrollX, window.scrollY);
  renderRecordings();
}

// 共有メニュー（ファイルに保存・LINE・AirDrop など）で渡す。共有できない端末（PC など）ではダウンロード
async function shareRecording(rec) {
  const file = new File([rec.blob], fileNameFor(rec), { type: rec.blob.type || 'audio/mp4' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: displayName(rec) });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // 共有を取りやめたとき
      alert('共有メニューを開けなかったため、ダウンロードで保存します。');
    }
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

async function deleteRecording(rec) {
  if (!confirm(`「${displayName(rec)}」を削除しますか？`)) return;
  recordings = recordings.filter((r) => r.id !== rec.id);
  if (rec.id === selectedId) {
    player.unload();
    selectedId = null;
    $('player').hidden = true;
  }
  if (canSaveRecordings) {
    try { await recordingsDb.remove(rec.id); } catch (e) { /* 画面からは消す */ }
  }
  renderRecordings();
}

// ---------- 再生プレーヤー ----------
function openInPlayer(rec, autoplay) {
  if (rec.id !== selectedId) {
    selectedId = rec.id;
    player.load(rec.blob, rec.duration);
    $('playerTitle').textContent = displayName(rec);
    $('playerError').hidden = true;
    $('player').hidden = false;
    renderRecordings();
  }
  $('player').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (autoplay && !player.playing) player.toggle();
}

const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/></svg>';
let seeking = false; // 位置のバーを指で動かしている最中

player.onUpdate = () => {
  const dur = player.duration;
  const pos = player.position;
  $('playerPos').textContent = formatTime(pos);
  $('playerDur').textContent = formatTime(dur);
  if (!seeking && dur > 0) $('playerSeek').value = Math.round((pos / dur) * 1000);
  $('playerPlay').innerHTML = player.playing ? PAUSE_ICON : PLAY_ICON;
  $('playerPlay').setAttribute('aria-label', player.playing ? '一時停止' : '再生');
  document.querySelectorAll('#playerRates button').forEach((b) => {
    b.classList.toggle('selected', Number(b.dataset.rate) === player.rate);
  });

  // くり返しの区間を、位置のバーの上に色で示す
  const region = $('loopRegion');
  if (player.loopA !== null && dur > 0) {
    const end = player.loopB !== null ? player.loopB : pos;
    region.style.left = `${(player.loopA / dur) * 100}%`;
    region.style.width = `${(Math.max(0, end - player.loopA) / dur) * 100}%`;
    region.classList.toggle('pending', player.loopB === null);
    region.hidden = false;
  } else {
    region.hidden = true;
  }
  $('loopA').classList.toggle('selected', player.loopA !== null);
  $('loopB').classList.toggle('selected', player.loopB !== null);
  $('loopInfo').textContent = player.loopB !== null
    ? `${formatTimeFine(player.loopA)} 〜 ${formatTimeFine(player.loopB)} をくり返しています`
    : player.loopA !== null
      ? `${formatTimeFine(player.loopA)} から。終わりたい位置で「B」を押してください`
      : '始めたい位置で「A」、終わりたい位置で「B」を押すと、その間をくり返します。';
};

player.onError = () => {
  $('playerError').textContent = 'このファイルは、この端末では再生できない形式です。';
  $('playerError').hidden = false;
};

$('playerPlay').addEventListener('click', () => player.toggle());
$('playerBack').addEventListener('click', () => player.skip(-5));
$('playerFwd').addEventListener('click', () => player.skip(5));
$('playerSeek').addEventListener('input', (e) => {
  seeking = true;
  $('playerPos').textContent = formatTime((Number(e.target.value) / 1000) * player.duration);
});
$('playerSeek').addEventListener('change', (e) => {
  seeking = false;
  player.seek((Number(e.target.value) / 1000) * player.duration);
});
document.querySelectorAll('#playerRates button').forEach((b) => {
  b.addEventListener('click', () => player.setRate(Number(b.dataset.rate)));
});
$('loopA').addEventListener('click', () => player.setA());
$('loopB').addEventListener('click', () => player.setB());
$('loopClear').addEventListener('click', () => player.clearLoop());

// ---------- ファイルの取り込み ----------
// 長さを調べる（読めないときは 0）
function audioDuration(blob) {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(blob);
    const done = (value) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(value) ? value : 0);
    };
    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration !== Infinity) return done(audio.duration);
      audio.currentTime = 1e101;
      audio.addEventListener('timeupdate', () => done(audio.duration), { once: true });
    });
    audio.addEventListener('error', () => done(0));
    setTimeout(() => done(0), 8000);
    audio.preload = 'metadata';
    audio.src = url;
  });
}

$('importButton').addEventListener('click', () => $('importInput').click());
$('importInput').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  e.target.value = ''; // 同じファイルをもう一度選べるようにする
  let first = null;
  for (const file of files) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const type = file.type || MIME_TYPES[ext] || '';
    if (!type.startsWith('audio/') && !MIME_TYPES[ext]) continue;
    const blob = new Blob([file], { type: type || 'audio/mp4' });
    const rec = {
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      duration: await audioDuration(blob),
      blob,
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 40),
      fileName: file.name,
      imported: true,
    };
    recordings.unshift(rec);
    await storeRecording(rec);
    if (!first) first = rec;
  }
  renderRecordings();
  if (first) {
    openInPlayer(first, false);
  } else if (files.length) {
    alert('音声ファイルを選んでください。');
  }
});

recorder.onLevel = (level, seconds) => {
  $('levelBar').style.width = `${level * 100}%`;
  $('recTime').textContent = formatTime(seconds);
};

function showRecError(message) {
  $('recError').textContent = message;
  $('recError').hidden = false;
}

// 録音しながら何かを鳴らしているとき：'scale'（音階）、'overdub'（録音に合わせて）
let recordingMode = null;
let recordingName = null; // 録り終えたときに付ける名前

// 戻り値：録音を始められたら true
async function startRecording({ withMetronome = settings.recWithMetronome, onError = showRecError } = {}) {
  $('recError').hidden = true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    onError('このブラウザ（またはこの開き方）では録音できません。');
    return false;
  }
  stopTuner();
  stopDrone();
  player.pause(); // 再生中の音が録音に入らないようにする
  try {
    await recorder.start();
  } catch (e) {
    onError(micErrorMessage(e));
    return false;
  }
  usage.track('recorder');
  // 部屋に入っているときは、部屋のメトロノームに合わせて録音する（勝手に鳴らし始めない）
  if (withMetronome && !metronome.isRunning && !syncHooks.active()) {
    await startMetronome();
    metronomeStartedByRecorder = true;
  }
  $('recButton').classList.add('recording');
  $('recStatus').textContent = '録音中…もう一度押すと止まります';
  document.querySelector('.tab[data-panel="recorder"]').classList.add('recording');
  keepScreenOn(true);
  return true;
}

async function stopRecording() {
  if (!recorder.isRecording) return;
  // 一緒に鳴らしていた音階や録音も止める
  const mode = recordingMode;
  const name = recordingName;
  recordingMode = null;
  recordingName = null;
  if (mode === 'scale') scalePlayer.stop();
  if (mode === 'overdub') player.pause();
  renderRecordingModes();

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
  if (name) rec.name = name.slice(0, 40);
  recordings.unshift(rec);
  await storeRecording(rec);
  renderRecordings();
  openInPlayer(rec, false); // 録り終えたらすぐ聞き返せるように、プレーヤーで開いておく
}

// 鳴らし終わったあと、スピーカーの音の余韻まで録ってから止める
function finishRecordingSoon() {
  const mode = recordingMode;
  if (!mode || mode === 'finishing') return;
  recordingMode = 'finishing';
  // 途中で止めたときは、鳴らしていた音階や録音をすぐ止める
  if (mode === 'scale') scalePlayer.stop();
  if (mode === 'overdub') player.pause();
  renderRecordingModes();
  setTimeout(() => stopRecording(), 600);
}

function renderRecordingModes() {
  const scaleRec = recordingMode === 'scale';
  const overdub = recordingMode === 'overdub';
  $('scaleRecord').innerHTML = `<span class="rec-dot"></span>${scaleRec ? '録音を止める' : '録音しながら再生'}`;
  $('scaleRecord').classList.toggle('recording', scaleRec);
  $('playerOverdub').innerHTML = `<span class="rec-dot"></span>${overdub ? '録音を止める' : '合わせて録音'}`;
  $('playerOverdub').classList.toggle('recording', overdub);
}

// ① 音階を鳴らしながら録音する（スピーカーの音階と自分の演奏を、マイクでまとめて録る）
$('scaleRecord').addEventListener('click', async () => {
  if (recordingMode === 'scale') {
    finishRecordingSoon();
    return;
  }
  if (recorder.isRecording) return; // ほかの録音の最中
  $('scaleRecError').hidden = true;
  scalePlayer.stop();
  const started = await startRecording({
    withMetronome: false,
    onError: (message) => {
      $('scaleRecError').textContent = message;
      $('scaleRecError').hidden = false;
    },
  });
  if (!started) return;
  const scale = currentScale();
  const type = SCALE_TYPES.find((t) => t.id === settings.scaleType);
  recordingMode = 'scale';
  recordingName = `${scale.up[0].name} ${type.name}（録音）`;
  renderRecordingModes();
  await startScale();
});

// ② 録音に合わせて録音する（スピーカーで元の録音を鳴らし、自分の演奏とまとめて録る）
$('playerOverdub').addEventListener('click', async () => {
  if (recordingMode === 'overdub') {
    finishRecordingSoon();
    return;
  }
  if (recorder.isRecording) return;
  const base = recordings.find((r) => r.id === selectedId);
  if (!base) return;
  $('playerError').hidden = true;
  const started = await startRecording({
    withMetronome: false,
    onError: (message) => {
      $('playerError').textContent = message;
      $('playerError').hidden = false;
    },
  });
  if (!started) return;
  recordingMode = 'overdub';
  recordingName = `${displayName(base)} に合わせて`;
  renderRecordingModes();
  player.clearLoop();
  player.seek(0);
  player.toggle();
});

// 元の録音が最後まで鳴ったら、録音も止める
player.audio.addEventListener('ended', () => {
  if (recordingMode === 'overdub') finishRecordingSoon();
});

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
renderRecordingModes();
setA4(settings.a4);
setTunerSensitivity(settings.tunerSensitivity);
loadRecordings();

metronome.beats = settings.beats;
metronome.accent = settings.accent;
metronome.setRhythm(settings.rhythm);
metronome.sound = settings.metroSound;
renderRhythms();
renderToggles();
$('miniIcon').innerHTML = MINI_PLAY;
$('beatsSelect').value = settings.beats;
$('accentCheck').checked = settings.accent;
setBpm(settings.bpm);
renderBeatDots();

setScaleBpm(settings.scaleBpm);
renderScale();
