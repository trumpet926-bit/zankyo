// 使われ方を名前なしで数える（1台を1日1回として、開いたことと、どの機能を使ったか）
// 端末ごとにランダムな番号を付けるだけで、名前・録音・場所などは送らない

const USAGE_URL = 'https://zankyo-855d9-default-rtdb.asia-southeast1.firebasedatabase.app/usage';
const USAGE_KEY = 'practice-app-usage';

const usage = (() => {
  let state = {};
  try {
    state = JSON.parse(localStorage.getItem(USAGE_KEY)) || {};
  } catch (e) {
    state = {};
  }
  if (!state.id) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    state.id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => chars[b % chars.length]).join('');
  }
  const enabled = location.protocol === 'https:'; // 手元で開いて確かめているときは数えない

  function save() {
    try {
      localStorage.setItem(USAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // 保存できなくても、アプリの動きには関係ない
    }
  }

  function today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // 日付が変わったら、送った記録を最初から数え直す
  function startDay() {
    const day = today();
    if (state.day !== day) {
      state.day = day;
      state.sent = {};
      state.rooms = {};
      save();
    }
    return day;
  }

  function send(path, body) {
    if (!enabled) return Promise.resolve(false);
    return fetch(`${USAGE_URL}/${path}.json`, { method: 'PATCH', body: JSON.stringify(body), keepalive: true })
      .then((res) => res.ok)
      .catch(() => false);
  }

  function platform() {
    const ua = navigator.userAgent;
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ipad';
    if (/iPhone|iPod/.test(ua)) return 'iphone';
    if (/Android/.test(ua)) return 'android';
    return 'pc';
  }

  // 送れなかったときは、次の機会にもう一度送る
  function sendOnce(key, path, body) {
    const day = startDay();
    if (state.sent[key]) return;
    state.sent[key] = true;
    save();
    send(`days/${day}/${state.id}${path}`, body).then((ok) => {
      if (ok || state.day !== day) return;
      state.sent[key] = false;
      save();
    });
  }

  function open() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    sendOnce('open', '', { p: platform(), s: standalone, v: APP_VERSION });
  }

  // feature：metronome, tuner, drone, scale, guide, recorder, sync, calib
  function track(feature) {
    open();
    sendOnce(feature, '/f', { [feature]: true });
  }

  // みんなで合わせる部屋に何人いたか（いちばん多かったときの人数）
  function room(code, count) {
    const day = startDay();
    if ((state.rooms[code] || 0) >= count) return;
    state.rooms[code] = count;
    save();
    send(`rooms/${day}/${code}`, { [state.id]: count });
  }

  open();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') open();
  });

  return { track, room };
})();
