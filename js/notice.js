// お知らせ（持ち主から全員へ。一方通行）・既読・スマホへの通知・持ち主への連絡（SMS）
// お知らせと既読は、持ち主の Google ドライブの受け取り口（Apps Script、hidden-share.js の SHARE_DRIVE_URL）にためる
// 通知は Firebase Cloud Messaging。受け取った通知は sw.js が画面に出す

(function () {
  const NOTICE_URL = SHARE_DRIVE_URL;
  // Firebase のコンソール →「プロジェクトの設定」→「Cloud Messaging」→「ウェブプッシュ証明書」の鍵（公開してよい鍵）
  const NOTICE_VAPID_KEY = 'BJzglBPt9Ws9hSNd9o9aB6bNzsMkIiuTsxnJEEZElcGpwE0YZgEnCBJa7mlWKUrYGB4E82vFqCz8ZpaowJeiRp4';
  const CONTACT_NAME = 'タカシ';
  const CONTACT_SMS = '09049701484';
  const SEEN_KEY = 'practice-app-notice-seen';
  const TOKEN_KEY = 'practice-app-notice-token';

  let items = [];
  let reads = {};
  let loadedAt = 0;

  const isOwner = () => typeof ownerKey === 'function' && !!ownerKey();
  const readerId = () => settings.syncId;

  function seenIds() {
    try {
      return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
    } catch (e) {
      return new Set();
    }
  }
  function markSeen(ids) {
    const seen = seenIds();
    ids.forEach((id) => seen.add(id));
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
    } catch (e) {
      // 保存できなくても、次に開いたときにもう一度「新着」になるだけ
    }
  }

  async function post(body) {
    const res = await fetch(NOTICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // 余計な事前確認をさせないため
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function loadList() {
    const res = await fetch(`${NOTICE_URL}?action=notice-list`);
    const data = await res.json();
    if (!data.ok) throw new Error('list');
    items = data.items || [];
    loadedAt = Date.now();
    return items;
  }

  function unreadIds() {
    const seen = seenIds();
    return items.filter((n) => !seen.has(n.id)).map((n) => n.id);
  }

  // 上の「お知らせ」ボタンの赤い印と、ホーム画面のアイコンの数字
  function renderBadge() {
    const count = isOwner() ? 0 : unreadIds().length;
    $('noticeDot').hidden = count === 0;
    $('noticeDot').textContent = count > 9 ? '9+' : String(count || '');
    try {
      if (navigator.setAppBadge) {
        if (count) navigator.setAppBadge(count);
        else navigator.clearAppBadge();
      }
    } catch (e) {
      // 数字を出せない端末もある
    }
  }

  async function refreshBadge(force = false) {
    if (!force && Date.now() - loadedAt < 60000) return;
    try {
      await loadList();
      renderBadge();
    } catch (e) {
      // つながらないときは、次の機会に
    }
  }

  // ---------- 画面 ----------
  function formatDate(ms) {
    const d = new Date(ms);
    const days = '日月火水木金土';
    return `${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function renderList() {
    const box = $('noticeList');
    box.innerHTML = '';
    if (!items.length) {
      box.innerHTML = '<p class="note notice-empty">お知らせはまだありません。</p>';
      return;
    }
    const seen = seenIds();
    items.forEach((n) => {
      const card = document.createElement('article');
      card.className = 'notice-item' + (!seen.has(n.id) && !isOwner() ? ' fresh' : '');
      const head = document.createElement('div');
      head.className = 'notice-item-head';
      const date = document.createElement('span');
      date.className = 'notice-date';
      date.textContent = formatDate(n.at);
      head.appendChild(date);
      if (card.classList.contains('fresh')) {
        const tag = document.createElement('span');
        tag.className = 'notice-new';
        tag.textContent = '新着';
        head.appendChild(tag);
      }
      card.appendChild(head);
      if (n.title) {
        const h = document.createElement('h3');
        h.className = 'notice-item-title';
        h.textContent = n.title;
        card.appendChild(h);
      }
      if (n.body) {
        const p = document.createElement('p');
        p.className = 'notice-item-body';
        p.textContent = n.body;
        card.appendChild(p);
      }
      if (isOwner()) card.appendChild(ownerTools(n));
      box.appendChild(card);
    });
  }

  // 持ち主だけ：だれがいつ読んだかと、消すボタン
  function ownerTools(n) {
    const wrap = document.createElement('div');
    wrap.className = 'notice-owner';
    const list = reads[n.id] || [];
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = `既読 ${list.length}人`;
    details.appendChild(summary);
    const ul = document.createElement('ul');
    list.sort((a, b) => a.at - b.at).forEach((r) => {
      const li = document.createElement('li');
      li.textContent = `${r.name || '（名前なし）'}　${formatDate(r.at)}`;
      ul.appendChild(li);
    });
    if (!list.length) {
      const li = document.createElement('li');
      li.textContent = 'まだだれも読んでいません';
      ul.appendChild(li);
    }
    details.appendChild(ul);
    wrap.appendChild(details);
    const del = document.createElement('button');
    del.className = 'btn small notice-del';
    del.textContent = '消す';
    let armed = false;
    del.addEventListener('click', async () => {
      if (!armed) {
        armed = true;
        del.textContent = 'もう一度押すと消えます';
        setTimeout(() => {
          armed = false;
          del.textContent = '消す';
        }, 3000);
        return;
      }
      del.disabled = true;
      try {
        await post({ action: 'notice-delete', ownerKey: ownerKey(), id: n.id });
        items = items.filter((x) => x.id !== n.id);
        renderList();
      } catch (e) {
        del.disabled = false;
        del.textContent = '消せませんでした';
      }
    });
    wrap.appendChild(del);
    return wrap;
  }

  function renderName() {
    const named = !!settings.noticeName;
    $('noticeNameForm').hidden = named || isOwner();
    $('noticeMe').hidden = !named;
    $('noticeMeName').textContent = settings.noticeName || '';
  }

  // ---------- 通知 ----------
  function isIos() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }
  function pushSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  }

  function renderPush() {
    const card = $('noticePushCard');
    const text = $('noticePushText');
    const button = $('noticePushOn');
    if (!NOTICE_VAPID_KEY) {
      card.hidden = true; // 通知の準備（Firebase の設定）がまだ
      return;
    }
    card.hidden = false;
    button.hidden = true;
    if (!pushSupported()) {
      text.textContent = isIos() && !isStandalone()
        ? 'iPhone は、このアプリをホーム画面に追加して開くと、通知を受け取れるようになります。'
        : 'この端末では、通知を受け取れません。アプリを開いたときに新しいお知らせが出ます。';
      return;
    }
    if (Notification.permission === 'denied') {
      text.textContent = '通知が止められています。受け取るには、端末の設定でこのアプリの通知を許可してください。';
      return;
    }
    if (Notification.permission === 'granted' && localStorage.getItem(TOKEN_KEY)) {
      text.textContent = 'この端末は、新しいお知らせを通知で受け取ります。';
      return;
    }
    text.textContent = '新しいお知らせが届いたら、スマホに通知でお知らせします。';
    button.hidden = false;
  }

  async function fcmToken() {
    if (!window.firebase || !firebase.messaging) {
      await loadScript(`${FIREBASE_SDK}firebase-app-compat.js`);
      await loadScript(`${FIREBASE_SDK}firebase-messaging-compat.js`);
    }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    const registration = await navigator.serviceWorker.ready;
    return firebase.messaging().getToken({ vapidKey: NOTICE_VAPID_KEY, serviceWorkerRegistration: registration });
  }

  async function registerPush() {
    const token = await fcmToken();
    if (!token) throw new Error('token');
    const res = await post({ action: 'push-register', token, reader: readerId(), name: settings.noticeName || (isOwner() ? CONTACT_NAME : '') });
    if (!res.ok) throw new Error('register');
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, at: Date.now() }));
  }

  $('noticePushOn').addEventListener('click', async () => {
    const button = $('noticePushOn');
    button.disabled = true;
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') await registerPush();
    } catch (e) {
      $('noticePushText').textContent = '通知の登録ができませんでした。電波のよいところで、もう一度お試しください。';
      button.disabled = false;
      return;
    }
    button.disabled = false;
    usage.track('push');
    renderPush();
  });

  // 通知の宛先は時々変わるので、許可済みの端末は1日に1回だけ確かめ直す
  async function refreshPushToken() {
    if (!NOTICE_VAPID_KEY || !pushSupported() || Notification.permission !== 'granted') return;
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    } catch (e) {
      saved = null;
    }
    if (saved && Date.now() - saved.at < 86400000) return;
    try {
      await registerPush();
    } catch (e) {
      // 次に開いたときにもう一度
    }
  }

  // ---------- 開く・閉じる ----------
  async function openNotice() {
    $('noticeView').hidden = false;
    document.body.style.overflow = 'hidden';
    renderName();
    renderPush();
    $('noticeCompose').hidden = !isOwner();
    $('noticeList').innerHTML = '<p class="note notice-empty">読み込んでいます…</p>';
    try {
      await loadList();
      if (isOwner()) {
        const r = await post({ action: 'notice-reads', ownerKey: ownerKey() });
        if (r.ok) {
          reads = r.reads || {};
          $('noticeSendNote').textContent = `通知を受け取る端末：${r.devices}台`;
        }
      }
      renderList();
      await markRead();
    } catch (e) {
      $('noticeList').innerHTML = '<p class="note notice-empty">お知らせを読み込めませんでした。インターネットにつながっているか確認してください。</p>';
    }
  }

  // 名前が決まっていれば、まだ読んでいないお知らせを「読んだ」と知らせる
  async function markRead() {
    if (isOwner() || !settings.noticeName) return;
    const ids = unreadIds();
    if (!ids.length) {
      renderBadge();
      return;
    }
    try {
      const res = await post({ action: 'notice-read', reader: readerId(), name: settings.noticeName, ids });
      if (res.ok) markSeen(ids);
    } catch (e) {
      // 次に開いたときにもう一度
    }
    renderBadge();
  }

  function closeNotice() {
    $('noticeView').hidden = true;
    document.body.style.overflow = '';
    renderList();
  }

  $('openNotice').addEventListener('click', () => {
    usage.track('notice');
    openNotice();
  });
  $('closeNotice').addEventListener('click', closeNotice);

  $('noticeNameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('noticeNameInput').value.trim().slice(0, 20);
    if (!name) return;
    settings.noticeName = name;
    saveSettings(settings);
    renderName();
    await markRead();
    renderList();
    if (localStorage.getItem(TOKEN_KEY)) registerPush().catch(() => {}); // 通知の登録にも名前を入れ直す
  });
  $('noticeRename').addEventListener('click', () => {
    $('noticeNameInput').value = settings.noticeName || '';
    $('noticeNameForm').hidden = false;
    $('noticeNameInput').focus();
  });

  // 持ち主だけ：お知らせを書いて全員に送る
  $('noticeSend').addEventListener('click', async () => {
    const title = $('noticeTitleInput').value.trim();
    const body = $('noticeBodyInput').value.trim();
    if (!title && !body) {
      $('noticeSendNote').textContent = '見出しか本文を書いてください。';
      return;
    }
    $('noticeSend').disabled = true;
    $('noticeSendNote').textContent = '送っています…';
    try {
      const res = await post({ action: 'notice-post', ownerKey: ownerKey(), title, body });
      if (!res.ok) throw new Error(res.error);
      $('noticeTitleInput').value = '';
      $('noticeBodyInput').value = '';
      const push = res.push || {};
      $('noticeSendNote').textContent = push.ready
        ? `送りました。通知：${push.sent}台に届けました${push.failed ? `（${push.failed}台は届きませんでした）` : ''}。`
        : '送りました（通知の準備がまだなので、アプリを開いた人に表示されます）。';
      await loadList();
      renderList();
    } catch (e) {
      $('noticeSendNote').textContent = '送れませんでした。インターネットにつながっているか確認してください。';
    }
    $('noticeSend').disabled = false;
  });

  // 持ち主への連絡（SMS。相手の端末が対応していれば RCS になる）
  $('noticeContactLabel').textContent = `${CONTACT_NAME}に連絡する`;
  $('noticeSms').href = `sms:${CONTACT_SMS}`;
  $('noticeSmsNumber').textContent = CONTACT_SMS.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3');

  // 通知を押して開いたとき（?notice=1）は、すぐにお知らせを出す
  if (new URLSearchParams(location.search).get('notice')) {
    history.replaceState(null, '', location.pathname);
    openNotice();
  }
  // アプリが開いているときに通知が届いたら（sw.js から）
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'notice-open') openNotice();
      if (e.data && e.data.type === 'notice-new') refreshBadge(true);
    });
  }

  setTimeout(() => refreshBadge(true), 1500);
  setTimeout(refreshPushToken, 4000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshBadge();
  });
})();
