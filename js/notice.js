// お知らせ（名前を入れた人ならだれでも書けて、全員に届く）・既読・スマホへの通知・持ち主への連絡（SMS）
// お知らせと既読は、持ち主の Google ドライブの受け取り口（Apps Script、hidden-share.js の SHARE_DRIVE_URL）にためる
// 通知は Firebase Cloud Messaging。受け取った通知は sw.js が画面に出す
// 一覧は端末に1か月とっておき、毎回は読みに行かない。新しいお知らせの通知が来たとき・自分が書いたとき・
// 「新しいお知らせを確かめる」を押したとき・1か月たったときだけ読み直す

(function () {
  const NOTICE_URL = SHARE_DRIVE_URL;
  // Firebase のコンソール →「プロジェクトの設定」→「Cloud Messaging」→「ウェブプッシュ証明書」の鍵（公開してよい鍵）
  const NOTICE_VAPID_KEY = 'BJzglBPt9Ws9hSNd9o9aB6bNzsMkIiuTsxnJEEZElcGpwE0YZgEnCBJa7mlWKUrYGB4E82vFqCz8ZpaowJeiRp4';
  const CONTACT_NAME = 'タカシ';
  const CONTACT_SMS = '09049701484';
  const CONTACT_MAIL = 'trumpet926@gmail.com';
  const SEEN_KEY = 'practice-app-notice-seen';
  const TOKEN_KEY = 'practice-app-notice-token';
  const INTRO_KEY = 'practice-app-notice-intro'; // 「お知らせができました」の案内を見終わったか
  const LIST_KEY = 'practice-app-notice-list'; // とっておいた一覧 { items, at }
  const MINE_KEY = 'practice-app-notice-mine'; // 自分が書いたお知らせの id（消せるように）
  const LIST_KEEP = 30 * 86400000; // 1か月

  let items = [];
  let reads = {};
  let loadedAt = 0;
  try {
    const saved = JSON.parse(localStorage.getItem(LIST_KEY) || 'null');
    if (saved && Array.isArray(saved.items)) {
      items = saved.items;
      loadedAt = saved.at || 0;
    }
  } catch (e) {
    // とっておいた一覧がなければ、読みに行くだけ
  }

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

  function mineIds() {
    try {
      return new Set(JSON.parse(localStorage.getItem(MINE_KEY) || '[]'));
    } catch (e) {
      return new Set();
    }
  }
  function addMine(id) {
    const mine = mineIds();
    mine.add(id);
    try {
      localStorage.setItem(MINE_KEY, JSON.stringify([...mine].slice(-100)));
    } catch (e) {
      // 保存できなくても、消すボタンが出ないだけ
    }
  }

  // force でなければ、とっておいた一覧（1か月以内）をそのまま使う
  async function loadList(force = false) {
    if (!force && loadedAt && Date.now() - loadedAt < LIST_KEEP) return items;
    const res = await fetch(`${NOTICE_URL}?action=notice-list`);
    const data = await res.json();
    if (!data.ok) throw new Error('list');
    items = data.items || [];
    loadedAt = Date.now();
    try {
      localStorage.setItem(LIST_KEY, JSON.stringify({ items, at: loadedAt }));
    } catch (e) {
      // 保存できなくても、次に開いたときに読み直すだけ
    }
    return items;
  }

  // アプリを閉じているあいだに通知が届いていたら（sw.js が印を残す）、読み直す
  async function pushArrived() {
    try {
      if (!window.caches) return false;
      const cache = await caches.open('zankyo-badge');
      if (!(await cache.match('notice-stale'))) return false;
      await cache.delete('notice-stale');
      return true;
    } catch (e) {
      return false;
    }
  }

  function unreadIds() {
    const seen = seenIds();
    return items.filter((n) => !seen.has(n.id)).map((n) => n.id);
  }

  // 上の「お知らせ」ボタンの赤い印と、ホーム画面のアイコンの数字
  function renderBadge() {
    const count = unreadIds().length;
    $('noticeDot').hidden = count === 0;
    $('openNotice').classList.toggle('has-new', count > 0); // 読んでいないお知らせがあると、ベルが揺れる
    $('noticeDot').textContent = count > 9 ? '9+' : String(count || '');
    try {
      if (navigator.setAppBadge) {
        if (count) navigator.setAppBadge(count);
        else navigator.clearAppBadge();
      }
      if (window.caches) caches.open('zankyo-badge').then((c) => c.put('count', new Response(String(count)))).catch(() => {});
    } catch (e) {
      // 数字を出せない端末もある
    }
  }

  async function refreshBadge(force = false) {
    try {
      await loadList(force || (await pushArrived()));
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
    const mine = mineIds();
    items.forEach((n) => {
      const card = document.createElement('article');
      card.className = 'notice-item' + (!seen.has(n.id) ? ' fresh' : '');
      const head = document.createElement('div');
      head.className = 'notice-item-head';
      const author = document.createElement('span');
      author.className = 'notice-author';
      author.textContent = n.name || CONTACT_NAME; // 名前のない古いお知らせは、持ち主が書いたもの
      head.appendChild(author);
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
      else if (mine.has(n.id)) {
        const wrap = document.createElement('div');
        wrap.className = 'notice-mine';
        wrap.appendChild(deleteButton(n));
        card.appendChild(wrap);
      }
      box.appendChild(card);
    });
  }

  // 消すボタン（2回押すと消える）。持ち主はどれでも、ほかの人は自分が書いたものだけ
  function deleteButton(n) {
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
        const res = await post({ action: 'notice-delete', ownerKey: isOwner() ? ownerKey() : undefined, reader: readerId(), id: n.id });
        if (!res.ok) throw new Error(res.error);
        await loadList(true).catch(() => {
          items = items.filter((x) => x.id !== n.id);
        });
        renderList();
      } catch (e) {
        del.disabled = false;
        del.textContent = '消せませんでした';
      }
    });
    return del;
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
    wrap.appendChild(deleteButton(n));
    return wrap;
  }

  // 書くときの名前（持ち主は名前を入れていなければ「タカシ」）
  const writerName = () => settings.noticeName || (isOwner() ? CONTACT_NAME : '');

  function renderName() {
    const named = !!settings.noticeName;
    $('noticeNameForm').hidden = named || isOwner();
    $('noticeMe').hidden = !named;
    $('noticeMeName').textContent = settings.noticeName || '';
    // 名前が決まっていれば、だれでも「＋ 書く」が使える
    $('noticeOwnerBar').hidden = !writerName();
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
    hideIntro();
    $('noticeView').hidden = false;
    document.body.style.overflow = 'hidden';
    renderName();
    renderPush();
    $('noticeCompose').hidden = true;
    $('noticeWrite').hidden = false;
    $('noticeSendNote').textContent = '';
    $('noticeDevices').hidden = true;
    showPage('news');
    await showList(false);
  }

  // 一覧を出す。とっておいた一覧があればすぐ出し、読みに行くのは必要なときだけ
  async function showList(force) {
    force = force || (await pushArrived());
    const cached = loadedAt && Date.now() - loadedAt < LIST_KEEP;
    if (cached) renderList();
    if (!cached || force) {
      if (!cached) $('noticeList').innerHTML = '<p class="note notice-empty">読み込んでいます…</p>';
      try {
        await loadList(true);
        renderList();
      } catch (e) {
        if (!cached) {
          $('noticeList').innerHTML = '<p class="note notice-empty">お知らせを読み込めませんでした。インターネットにつながっているか確認してください。</p>';
          return;
        }
        $('noticeSendNote').textContent = 'いまは新しいお知らせを確かめられませんでした。前に読み込んだものを出しています。';
      }
    }
    // 持ち主だけ：だれが読んだか（これは開くたびに確かめる）
    if (isOwner()) {
      try {
        const r = await post({ action: 'notice-reads', ownerKey: ownerKey() });
        if (r.ok) {
          reads = r.reads || {};
          $('noticeDevices').textContent = `通知を受け取る端末：${r.devices}台`;
          $('noticeDevices').hidden = false;
          renderList();
        }
      } catch (e) {
        // 読んだ人の一覧は、次に開いたときに
      }
    }
    await markRead();
  }

  // まだ読んでいないお知らせを「読んだ」にする。名前が決まっていれば、読んだことを書いた側に知らせる
  async function markRead() {
    const ids = unreadIds();
    if (!ids.length) {
      renderBadge();
      return;
    }
    if (!settings.noticeName) {
      // 持ち主は名前がなくても読んだことにする。ほかの人は名前を入れるまで「新着」のまま
      if (isOwner()) markSeen(ids);
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

  // 新しくできた機能なので、一度お知らせを開くまで、画面の上に案内を出す
  function introDone() {
    try {
      return localStorage.getItem(INTRO_KEY) === '1';
    } catch (e) {
      return false;
    }
  }
  function hideIntro() {
    $('noticeIntro').hidden = true;
    try {
      localStorage.setItem(INTRO_KEY, '1');
    } catch (e) {
      // 保存できなくても、案内がもう一度出るだけ
    }
  }
  if (!isOwner() && !introDone()) $('noticeIntro').hidden = false;
  $('noticeIntroOpen').addEventListener('click', () => {
    usage.track('notice');
    openNotice();
  });

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

  // 新しいお知らせを確かめる（とっておいた一覧を読み直す）
  $('noticeReload').addEventListener('click', async () => {
    const button = $('noticeReload');
    button.disabled = true;
    $('noticeSendNote').textContent = '';
    await showList(true);
    button.disabled = false;
  });

  // 名前を入れた人ならだれでも：お知らせを書いて全員に送る
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
      const res = await post({ action: 'notice-post', ownerKey: isOwner() ? ownerKey() : undefined, reader: readerId(), name: writerName(), title, body });
      if (!res.ok) {
        $('noticeSendNote').textContent = res.error === 'wait'
          ? '続けて送るときは、1分ほど待ってからにしてください。'
          : res.error === 'owner'
            ? 'まだ準備中です。タカシの作業が終わると、みんな書けるようになります。'
            : '送れませんでした。';
        $('noticeSend').disabled = false;
        return;
      }
      addMine(res.id);
      markSeen([res.id]); // 自分が書いたものは「新着」にしない
      $('noticeTitleInput').value = '';
      $('noticeBodyInput').value = '';
      $('noticeCompose').hidden = true;
      $('noticeWrite').hidden = false;
      const push = res.push || {};
      $('noticeSendNote').textContent = push.ready
        ? `送りました。通知：${push.sent}台に届けました${push.failed ? `（${push.failed}台は届きませんでした）` : ''}。`
        : '送りました（通知の準備がまだなので、アプリを開いた人に表示されます）。';
      await loadList(true);
      renderList();
    } catch (e) {
      $('noticeSendNote').textContent = '送れませんでした。インターネットにつながっているか確認してください。';
    }
    $('noticeSend').disabled = false;
  });

  // お知らせ と 連絡 のページの切り替え
  function showPage(page) {
    const news = page === 'news';
    $('noticePageNews').hidden = !news;
    $('noticePageContact').hidden = news;
    $('noticeTabNews').classList.toggle('active', news);
    $('noticeTabContact').classList.toggle('active', !news);
    $('noticeTabNews').setAttribute('aria-selected', String(news));
    $('noticeTabContact').setAttribute('aria-selected', String(!news));
  }
  $('noticeTabNews').addEventListener('click', () => showPage('news'));
  $('noticeTabContact').addEventListener('click', () => showPage('contact'));

  // 「＋ 書く」で書く欄を開く
  $('noticeWrite').addEventListener('click', () => {
    $('noticeCompose').hidden = false;
    $('noticeWrite').hidden = true;
    $('noticeSendNote').textContent = '';
    $('noticeTitleInput').focus();
  });
  $('noticeCancel').addEventListener('click', () => {
    $('noticeCompose').hidden = true;
    $('noticeWrite').hidden = false;
  });

  // 持ち主への連絡（SMS。相手の端末が対応していれば RCS になる）
  $('noticeContactLabel').textContent = `${CONTACT_NAME}に連絡する`;
  $('noticeSms').href = `sms:${CONTACT_SMS}`;
  $('noticeSmsNumber').textContent = CONTACT_SMS.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3');
  // メール（スマホのメールアプリが開く。件名に「残響」と名前を入れておく）
  $('noticeMailAddress').textContent = CONTACT_MAIL;
  $('noticeMail').addEventListener('click', () => {
    const who = settings.noticeName ? `（${settings.noticeName}）` : '';
    $('noticeMail').href = `mailto:${CONTACT_MAIL}?subject=${encodeURIComponent('【残響】' + who)}`;
  });
  $('noticeMail').href = `mailto:${CONTACT_MAIL}?subject=${encodeURIComponent('【残響】')}`;

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

  setTimeout(() => refreshBadge(), 1500); // とっておいた一覧で数える（通知が届いていたときと、1か月たったときだけ読み直す）
  setTimeout(refreshPushToken, 4000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshBadge();
  });
})();
