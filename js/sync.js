// みんなで合わせる：部屋の作成・参加、時計合わせ、共有する状態のやりとり（Firebase）

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCtLXO6ase0BTqOtOhHMxXCHRx03S3eTjo',
  authDomain: 'zankyo-855d9.firebaseapp.com',
  databaseURL: 'https://zankyo-855d9-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'zankyo-855d9',
  storageBucket: 'zankyo-855d9.firebasestorage.app',
  messagingSenderId: '136166044843',
  appId: '1:136166044843:web:f7f3244b079dca7f2cb3ee',
};
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';

// 部屋に入ったときに付ける、江戸時代の人のような名前
const EDO_NAMES = [
  '八兵衛', '与作', '弥七', '佐吉', '喜助', '源内', '清次郎', '吉兵衛', '半七', '又兵衛',
  '甚六', '伊之助', '長吉', '権兵衛', '徳右衛門', '新三郎', '平助', '庄助', '太郎吉', '文七',
  '金次', '茂兵衛', '辰五郎', '利助', '仙蔵', '亀吉', '久蔵', '与兵衛', '彦六', '善八',
  'お菊', 'お松', 'おりん', 'お千代', 'おはな', 'おせん', 'お糸', 'おとき', 'お鶴', 'お駒',
  'お梅', 'おみつ', 'お照', 'おしの', 'お蝶', 'おふく', 'お吉', 'お夏', 'おまさ', 'お竹',
];

// この端末の時計（ミリ秒）
function wallNow() {
  return performance.timeOrigin + performance.now();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`読み込めません: ${src}`));
    document.head.appendChild(script);
  });
}

class SyncRoom {
  constructor(memberId, baseName) {
    this.memberId = memberId;
    this.baseName = baseName;
    this.code = null;
    this.name = null;
    this.state = null;
    this.members = {};
    this.offset = 0; // サーバーの時計 − この端末の時計（ミリ秒）
    this.onState = null; // (state, previousState)
    this.onMembers = null; // (members)
    this.calib = null; // 音合わせ中の人と時刻
    this.onCalib = null; // (calib)
    this.joinedAt = null; // この端末が部屋に入った時刻（つなぎ直しても変えない）
  }

  // Firebase のプログラムは、部屋の機能を使うときにだけ読み込む
  static async database() {
    if (!window.firebase || !firebase.database) {
      await loadScript(`${FIREBASE_SDK}firebase-app-compat.js`);
      await loadScript(`${FIREBASE_SDK}firebase-database-compat.js`);
    }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    return firebase.database();
  }

  serverNow() {
    return wallNow() + this.offset;
  }

  // サーバーの時計とのずれを測る
  // 書き込みの前後の時刻の真ん中にサーバーが時刻を記録したとみなし、往復がいちばん速かった回を使う
  async measureClock() {
    const url = `${FIREBASE_CONFIG.databaseURL}/clock/${this.memberId}.json`;
    let best = null;
    for (let i = 0; i < 6; i++) {
      const t0 = wallNow();
      const res = await fetch(url, { method: 'PUT', body: JSON.stringify({ '.sv': 'timestamp' }) });
      const t1 = wallNow();
      let serverTime = await res.json();
      if (typeof serverTime !== 'number') serverTime = await (await fetch(url)).json();
      if (i === 0) continue; // 1回目は接続の準備で遅くなるので使わない
      const rtt = t1 - t0;
      if (!best || rtt < best.rtt) best = { rtt, offset: serverTime - (t0 + t1) / 2 };
    }
    fetch(url, { method: 'DELETE' }).catch(() => {});
    this.offset = best.offset;
    return best;
  }

  async create(initialState) {
    const db = await SyncRoom.database();
    for (let i = 0; i < 10; i++) {
      const code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
      const members = await db.ref(`rooms/${code}/members`).get();
      if (members.exists()) continue; // 誰かが使っている番号は避ける
      await this.enter(db, code);
      await db.ref(`rooms/${code}/state`).set({
        ...initialState,
        anchorAt: this.serverNow(),
        at: this.serverNow(),
        by: this.name,
        action: 'create',
      });
      return code;
    }
    throw new Error('部屋の番号を決められませんでした');
  }

  // 戻り値：部屋が見つかれば true
  async join(code) {
    const db = await SyncRoom.database();
    const state = await db.ref(`rooms/${code}/state`).get();
    if (!state.exists()) return false;
    await this.enter(db, code);
    return true;
  }

  async enter(db, code) {
    await this.measureClock();
    this.joinedAt = null;
    this.db = db;
    this.code = code;
    this.roomRef = db.ref(`rooms/${code}`);

    // 部屋の中で名前がかぶったら、空いている名前を使う
    const members = (await this.roomRef.child('members').get()).val() || {};
    const used = Object.entries(members).filter(([id]) => id !== this.memberId).map(([, m]) => m.name);
    const free = EDO_NAMES.filter((n) => !used.includes(n));
    this.name = !used.includes(this.baseName) ? this.baseName : free[Math.floor(Math.random() * free.length)] || this.baseName;

    // つながっている間だけ、部屋の参加者として載せる（切れたら自動で消える）
    this.memberRef = this.roomRef.child(`members/${this.memberId}`);
    this.connectedRef = db.ref('.info/connected');
    this.connectedRef.on('value', (snap) => {
      if (snap.val() !== true) return;
      this.memberRef.onDisconnect().remove();
      this.memberRef.set({ name: this.name, joinedAt: this.joinedAt || firebase.database.ServerValue.TIMESTAMP });
    });

    this.roomRef.child('members').on('value', (snap) => {
      this.members = snap.val() || {};
      const me = this.members[this.memberId];
      if (me && typeof me.joinedAt === 'number' && !this.joinedAt) this.joinedAt = me.joinedAt;
      if (this.onMembers) this.onMembers(this.members);
    });
    this.roomRef.child('state').on('value', (snap) => {
      const previous = this.state;
      this.state = snap.val();
      if (this.state && this.onState) this.onState(this.state, previous);
    });
    this.roomRef.child('calib').on('value', (snap) => {
      this.calib = snap.val();
      if (this.onCalib) this.onCalib(this.calib);
    });
  }

  leave() {
    if (!this.code) return;
    this.connectedRef.off();
    this.roomRef.child('members').off();
    this.roomRef.child('state').off();
    this.roomRef.child('calib').off();
    this.memberRef.onDisconnect().cancel();
    this.memberRef.remove();
    this.code = null;
    this.state = null;
    this.calib = null;
    this.members = {};
  }

  // 基準の台：いちばん前から部屋にいる人（ふつうは部屋を作った人）
  referenceId() {
    const list = Object.entries(this.members).filter(([, m]) => typeof m.joinedAt === 'number');
    list.sort(([idA, a], [idB, b]) => a.joinedAt - b.joinedAt || (idA < idB ? -1 : 1));
    return list.length ? list[0][0] : null;
  }

  // 音合わせを始める。ほかの人が音合わせ中なら null
  async startCalib() {
    const startAt = this.serverNow() + 1500; // 基準の台に届く余裕を見て、少し先から鳴らす
    const calib = { id: this.memberId, name: this.name, startAt, endAt: startAt + CALIB_BEATS * CALIB_INTERVAL_MS };
    const result = await this.roomRef.child('calib').transaction((current) => {
      if (current && current.endAt + 1000 > this.serverNow()) return undefined;
      return calib;
    });
    return result.committed ? calib : null;
  }

  endCalib() {
    this.roomRef.child('calib')
      .transaction((current) => (current && current.id === this.memberId ? null : undefined))
      .catch(() => {});
  }

  // 共有している状態を書き換える（誰かと同時に変えても壊れないよう、最新の状態をもとに計算する）
  change(action, mutate) {
    return this.roomRef.child('state').transaction((current) => {
      const base = current || this.state;
      if (!base) return current;
      return { ...base, ...mutate(base), at: this.serverNow(), by: this.name, action };
    });
  }

  toggleRunning() {
    return this.change(this.state && this.state.running ? 'stop' : 'start', (s) =>
      s.running ? { running: false } : { running: true, anchorAt: this.serverNow() + 800 });
  }

  setBpm(bpm) {
    return this.change('tempo', (s) => ({ bpm, anchorAt: this.nextBarAt(s) }));
  }

  setBeats(beats) {
    return this.change('beats', (s) => ({ beats, anchorAt: this.nextBarAt(s) }));
  }

  // 鳴っているときは、全員に届く余裕を見て、次の小節の頭から切り替える
  nextBarAt(s) {
    if (!s.running) return s.anchorAt;
    const barMs = (60000 / s.bpm) * s.beats;
    const after = this.serverNow() + 500;
    const bars = Math.max(0, Math.ceil((after - s.anchorAt) / barMs));
    return s.anchorAt + bars * barMs;
  }
}
