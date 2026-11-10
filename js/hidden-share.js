// 聞いてほしい録音：持ち主が選んだ録音だけを、残響のページ（ロゴを5回たたくと開く）に置いて、誰でも聞けるようにする
// 録音は持ち主の Google Drive（受け取り口）に置く。置く・外すは、時計の登録の番号を持っている端末（持ち主）だけ

const SHARE_DRIVE_URL = 'https://script.google.com/macros/s/AKfycbyBRsbow4IEWd_5cUlqTn5QV6GqzOmiVE6MX3zUJQ7sWn3z1AoUiGW4zNcYd01yuFTznA/exec';

function ownerKey() {
  try {
    return localStorage.getItem('practice-app-watch');
  } catch (e) {
    return null;
  }
}

function blobToBase64Data(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// 録音の一覧の「残響に置く」：ひとことを書いて置く
function startHiddenShare(item, rec) {
  item.querySelector('.rec-main').hidden = true;
  item.querySelector('.rec-actions').hidden = true;
  const form = document.createElement('form');
  form.className = 'rename-form hidden-share-form';
  form.innerHTML = `
    <p class="note">残響のページ（ロゴを5回たたくと開くページ）に置きます。ページを開いた人なら誰でも聞けます。</p>
    <textarea maxlength="300" rows="3" class="rename-input" placeholder="ひとこと（例：新しい曲の練習です。感想ください）"></textarea>
    <p class="note hidden-share-status" hidden></p>
    <div class="rec-actions">
      <button type="button" class="btn small" data-act="cancel">やめる</button>
      <button type="submit" class="btn small primary">置く</button>
    </div>`;
  const status = form.querySelector('.hidden-share-status');
  const submit = form.querySelector('[type="submit"]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    status.hidden = false;
    status.textContent = '置いています…';
    try {
      const res = await fetch(SHARE_DRIVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // 余計な事前確認をさせないため
        body: JSON.stringify({
          action: 'share-upload',
          ownerKey: ownerKey(),
          title: displayName(rec),
          comment: form.querySelector('textarea').value.trim(),
          duration: rec.duration,
          fileName: fileNameFor(rec),
          mime: rec.blob.type || 'audio/mp4',
          data: await blobToBase64Data(rec.blob),
        }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.error);
      status.textContent = '置きました。残響のページで聞けます。';
      setTimeout(finishRename, 1500);
    } catch (err) {
      status.textContent = '置けませんでした。インターネットにつながっているか確認して、もう一度お試しください。';
      submit.disabled = false;
    }
  });
  form.querySelector('[data-act="cancel"]').addEventListener('click', finishRename);
  item.appendChild(form);
  form.querySelector('textarea').focus();
}

// 残響のページの「聞いてほしい録音」
async function renderSharedRecordings() {
  const section = $('zkSharedSection');
  const box = $('zkShared');
  box.innerHTML = '<p class="zk-shared-note">読み込んでいます…</p>';
  section.hidden = false;
  let items;
  try {
    const res = await fetch(`${SHARE_DRIVE_URL}?action=share-list`);
    const result = await res.json();
    if (!result.ok) throw new Error(result.error);
    items = result.items;
  } catch (e) {
    box.innerHTML = '';
    section.hidden = true;
    return;
  }
  box.innerHTML = '';
  if (!items.length) {
    section.hidden = !ownerKey(); // 持ち主には「まだありません」と見せる
    box.innerHTML = '<p class="zk-shared-note">まだありません。録音の一覧の「残響に置く」から置けます。</p>';
    return;
  }
  items.forEach((it) => {
    const card = document.createElement('article');
    card.className = 'zk-shared-item';
    const title = document.createElement('h3');
    title.textContent = it.meta.title || '録音';
    const meta = document.createElement('p');
    meta.className = 'zk-shared-meta';
    const d = new Date(it.at);
    meta.textContent = `${d.getMonth() + 1}月${d.getDate()}日${it.meta.duration ? ` ・ ${formatTime(it.meta.duration)}` : ''}`;
    card.append(title, meta);
    if (it.meta.comment) {
      const comment = document.createElement('p');
      comment.className = 'zk-shared-comment';
      comment.textContent = it.meta.comment;
      card.appendChild(comment);
    }
    const row = document.createElement('div');
    row.className = 'zk-shared-row';
    const play = document.createElement('button');
    play.className = 'zk-shared-play';
    play.textContent = '▶ 聞く';
    play.addEventListener('click', () => loadSharedAudio(it, card, play));
    row.appendChild(play);
    if (ownerKey()) {
      const remove = document.createElement('button');
      remove.className = 'zk-shared-remove';
      remove.textContent = 'ページから外す';
      remove.addEventListener('click', () => removeShared(it, card, remove));
      row.appendChild(remove);
    }
    card.appendChild(row);
    box.appendChild(card);
  });
}

// 聞くときに初めて録音を取り寄せる（開いただけでは読み込まない）
async function loadSharedAudio(it, card, button) {
  button.disabled = true;
  button.textContent = '読み込んでいます…';
  try {
    const res = await fetch(`${SHARE_DRIVE_URL}?action=share-get&id=${encodeURIComponent(it.id)}`);
    const result = await res.json();
    if (!result.ok) throw new Error(result.error);
    const bin = atob(result.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = URL.createObjectURL(new Blob([bytes], { type: result.mime }));
    button.replaceWith(audio);
    audio.play().catch(() => {});
  } catch (e) {
    button.disabled = false;
    button.textContent = '読み込めませんでした。もう一度押す';
  }
}

async function removeShared(it, card, button) {
  if (!confirm(`「${it.meta.title || '録音'}」を残響のページから外しますか？`)) return;
  button.disabled = true;
  try {
    const res = await fetch(SHARE_DRIVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'share-delete', ownerKey: ownerKey(), id: it.id }),
    });
    const result = await res.json();
    if (!result.ok) throw new Error(result.error);
    card.remove();
  } catch (e) {
    button.disabled = false;
    button.textContent = '外せませんでした';
  }
}

// 残響のページを閉じたら、再生中の録音も止める
function clearSharedRecordings() {
  $('zkShared').innerHTML = '';
}
