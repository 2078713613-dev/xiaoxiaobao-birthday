(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const album = window.ALBUM;
  if (!album || !Array.isArray(album.items) || !album.items.length) {
    $('message').textContent = '相册暂未载入，请刷新再试。';
    $('message').hidden = false;
    $('start').disabled = true;
    return;
  }
  const rows = album.items, photo = $('photo'), clip = $('clip'), music = $('music');
  const bookmarkKey = 'birthday-memoir.reader.' + rows[0].id;
  let current = -1, bookmark = -1, openPanel = null, previousFocus = null;
  let clipItem = null, requestedMusic = true, playAttempt = 0, leaving = false, touch = null, skipClick = false;
  let needsGesture = false, startedMusic = false;
  let imageFailed = false, noticeTimer = 0;
  try { bookmark = rows.findIndex(item => item.id === localStorage.getItem(bookmarkKey)); } catch (_) {}

  function notify(text) {
    clearTimeout(noticeTimer);
    $('message').textContent = text;
    $('message').hidden = false;
    noticeTimer = setTimeout(() => { $('message').hidden = true; }, 3500);
  }
  function readableDate(date) {
    if (!date) return '';
    const parts = date.split('-');
    return parts.length === 3 ? parts[0] + ' 年 ' + Number(parts[1]) + ' 月 ' + Number(parts[2]) + ' 日' : date;
  }
  function top() { window.scrollTo(0, 0); }
  function safeFocus(element) {
    if (!element || !element.isConnected) return;
    try { element.focus({preventScroll:true}); } catch (_) { element.focus(); }
  }
  function updateCover() {
    const resume = bookmark >= 0 && bookmark < rows.length - 1;
    $('start-label').textContent = resume ? '继续读第 ' + (bookmark + 1) + ' 页' : '翻开相册';
    $('restart').hidden = !resume || bookmark === 0;
  }

  function updateMusicButton() {
    $('music-toggle').setAttribute('aria-pressed', String(requestedMusic && !needsGesture));
    $('music-label').textContent = needsGesture ? '点播配乐' : (requestedMusic ? '关闭配乐' : '开启配乐');
  }
  function musicFailure() {
    if (!requestedMusic) return;
    requestedMusic = false; needsGesture = false;
    playAttempt++;
    music.pause();
    updateMusicButton();
    notify('配乐暂未能播放，请再点一次。');
  }
  function syncMusic() {
    const videoPlaying = clipItem && !clip.paused && !clip.ended && !clip.error;
    if (!requestedMusic || document.hidden || leaving || videoPlaying) {
      playAttempt++;
      if (!music.paused) music.pause();
      return;
    }
    if (!music.paused) return;
    const attempt = ++playAttempt;
    function rejected(error) {
      if (attempt !== playAttempt || error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        needsGesture = true; startedMusic = false; updateMusicButton();
      } else musicFailure();
    }
    try {
      const started = music.play();
      if (started) started.catch(rejected);
    } catch (error) { rejected(error); }
  }
  music.volume = 0.6;
  music.src = album.bgm;
  $('music-toggle').title = album.bgmTitle || '背景音乐';
  $('music-toggle').onclick = () => {
    requestedMusic = needsGesture || !requestedMusic;
    needsGesture = false;
    if (requestedMusic && music.error) music.load();
    updateMusicButton();
    syncMusic();
  };
  music.addEventListener('playing', () => {
    if (!requestedMusic || leaving || document.hidden || (clipItem && !clip.paused && !clip.ended && !clip.error)) {
      music.pause(); return;
    }
    startedMusic = true; needsGesture = false; updateMusicButton();
  });
  function unlockFromTouch(event) {
    if (!event.isTrusted || !requestedMusic || (startedMusic && !needsGesture)) return;
    if (event.target.closest && event.target.closest('#music-toggle,#film')) return;
    syncMusic();
  }
  document.addEventListener('touchend', unlockFromTouch, {capture:true, passive:true});
  document.addEventListener('click', unlockFromTouch, true);
  function unlockInWeChat() {
    if (!requestedMusic) return;
    const bridge = window.WeixinJSBridge;
    if (!bridge || typeof bridge.invoke !== 'function') return;
    try { bridge.invoke('getNetworkType', {}, syncMusic); } catch (_) { syncMusic(); }
  }
  document.addEventListener('WeixinJSBridgeReady', unlockInWeChat);
  music.addEventListener('error', musicFailure);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !clip.paused) clip.pause();
    syncMusic();
  });
  window.addEventListener('pagehide', () => { leaving = true; clip.pause(); syncMusic(); });
  window.addEventListener('pageshow', () => { leaving = false; syncMusic(); });

  function finishClip() {
    if (!clipItem) return;
    clipItem = null;
    clip.pause();
    clip.replaceChildren();
    clip.removeAttribute('poster');
    clip.load();
    syncMusic();
  }
  function showClipError() {
    if (!clipItem) return;
    $('play-clip').hidden = true; $('clip-link').hidden = false;
    syncMusic();
  }
  function setClip(item) {
    clipItem = item;
    clip.poster = item.photo;
    $('clip-link').hidden = true; $('clip-link').href = item.clip;
    $('play-clip').hidden = false; $('play-label').textContent = '播放视频';
    for (const [url,mime] of [[item.clip,'video/mp4'],[item.webClip,'video/webm']]) {
      if (!url) continue;
      const source = document.createElement('source'); source.src = url; source.type = mime; clip.append(source);
    }
    const last = clip.lastElementChild;
    if (last) last.onerror = () => { if (last.parentNode === clip && clipItem === item) showClipError(); };
    clip.load();
  }
  $('play-clip').onclick = () => {
    const item = clipItem, started = clip.play();
    if (started) started.catch(err => { if (clipItem === item && err.name !== 'AbortError') showClipError(); });
  };
  clip.addEventListener('error', showClipError);
  for (const event of ['play','playing','pause','ended','emptied']) {
    clip.addEventListener(event, () => {
      if (clipItem && !clip.error && $('clip-link').hidden) {
        $('play-clip').hidden = !clip.paused && !clip.ended;
        $('play-label').textContent = clip.ended ? '重新播放' : (clip.currentTime ? '继续播放' : '播放视频');
      }
      syncMusic();
    });
  }

  function closePanel(restoreFocus = true) {
    if (!openPanel) return;
    openPanel.hidden = true;
    if (openPanel === $('lightbox')) $('large-photo').removeAttribute('src');
    openPanel = null;
    document.body.classList.remove('modal-open');
    if (restoreFocus) safeFocus(previousFocus);
    previousFocus = null;
  }
  function showPanel(panel,focus) {
    closePanel(false);
    previousFocus = document.activeElement;
    openPanel = panel; panel.hidden = false;
    document.body.classList.add('modal-open');
    safeFocus(focus);
  }
  function updateChapters() {
    const seen = new Map();
    rows.forEach((row,index) => { if (!seen.has(row.chapter)) seen.set(row.chapter,index); });
    const nav = $('chapter-list');
    for (const chapter of album.chapters) {
      if (!seen.has(chapter.id)) continue;
      const first = seen.get(chapter.id);
      const button = document.createElement('button'), title = document.createElement('span'), page = document.createElement('span');
      button.type = 'button'; button.className = 'chapter-entry'; button.dataset.page = String(first + 1); button.dataset.chapter = chapter.id;
      title.textContent = chapter.title; page.textContent = '第 ' + (first + 1) + ' 页';
      button.append(title,page);
      button.onclick = () => navigate(first);
      nav.append(button);
    }
    $('contents-count').textContent = '共 ' + rows.length + ' 页';
  }
  $('contents-open').onclick = () => {
    if (clipItem && !clip.paused) clip.pause();
    for (const button of $('chapter-list').children) {
      button.setAttribute('aria-current',String(current >= 0 && button.dataset.chapter === rows[current].chapter));
    }
    showPanel($('contents'),$('contents-close'));
  };
  $('contents-close').onclick = () => closePanel();
  $('photo-close').onclick = () => closePanel();
  $('contents').addEventListener('click', e => { if (e.target === $('contents')) closePanel(); });
  $('lightbox').addEventListener('click', e => { if (e.target !== $('photo-close')) closePanel(); });

  function render(index) {
    closePanel(false);
    finishClip();
    current = index;
    const reading = index >= 0;
    $('cover').hidden = reading; $('reader').hidden = !reading;
    if (!reading) { updateCover(); top(); return; }
    const item = rows[index], number = index + 1, video = item.type === 'video';
    bookmark = index;
    try { localStorage.setItem(bookmarkKey,item.id); } catch (_) {}
    $('page-count').textContent = number + ' / ' + rows.length;
    $('progress').style.width = (100 * number / rows.length) + '%';
    $('chapter-title').textContent = item.chapterTitle;
    $('date').textContent = (item.uncertain && item.date ? '约 ' : '') + readableDate(item.date);
    $('caption').textContent = item.caption || '';
    $('caption').hidden = !item.caption || item.caption === item.artCaption;
    $('previous').disabled = index === 0;
    $('next-label').textContent = number === rows.length ? '回到封面' : '下一页';
    $('photo-open').hidden = video;
    $('film').hidden = !video;
    imageFailed = false; touch = null;
    if (video) {
      setClip(item);
    } else {
      photo.width = item.width; photo.height = item.height;
      photo.alt = item.artCaption || '相册第 ' + number + ' 页照片';
      photo.src = item.photo;
      $('photo-open').setAttribute('aria-label', item.artCaption ? '放大生日卡，' + item.artCaption : '放大查看这张照片');
    }
    top();
  }
  photo.addEventListener('error', () => {
    if (current < 0 || !photo.getAttribute('src') || rows[current].type === 'video') return;
    imageFailed = true; $('caption').hidden = !rows[current].caption;
    notify('照片暂未加载，请点照片重试。');
  });
  $('photo-open').onclick = () => {
    if (skipClick) { skipClick = false; return; }
    if (imageFailed) { imageFailed = false; photo.src = rows[current].photo; return; }
    $('large-photo').alt = photo.alt; $('large-photo').src = rows[current].photo;
    showPanel($('lightbox'),$('photo-close'));
  };
  function parseHash() {
    const match = /^#p=(\d{1,4})$/.exec(location.hash);
    const page = match ? Number(match[1]) : 0;
    return page >= 1 && page <= rows.length ? page - 1 : -1;
  }
  function navigate(index) {
    if (index < -1 || index >= rows.length) return;
    const entering = current === -1 && index >= 0;
    const route = location.pathname + location.search + (index < 0 ? '' : '#p=' + (index + 1));
    if (entering) history.pushState({album:true},'',route);
    else history.replaceState({album:index >= 0},'',route);
    render(index);
  }
  function restoreRoute() {
    const index = parseHash();
    if (openPanel || index !== current) render(index);
  }
  window.addEventListener('popstate', restoreRoute);
  window.addEventListener('hashchange', restoreRoute);
  $('home').onclick = () => navigate(-1);
  $('start').onclick = () => navigate(bookmark >= 0 && bookmark < rows.length - 1 ? bookmark : 0);
  $('restart').onclick = () => navigate(0);
  $('previous').onclick = () => { if (current > 0) navigate(current - 1); };
  $('next').onclick = () => navigate(current + 1 < rows.length ? current + 1 : -1);
  $('photo-open').addEventListener('touchstart', e => {
    touch = e.touches.length === 1 ? [e.touches[0].clientX,e.touches[0].clientY] : null;
  }, {passive:true});
  $('photo-open').addEventListener('touchcancel', () => { touch = null; }, {passive:true});
  $('photo-open').addEventListener('touchend', e => {
    if (!touch || !e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - touch[0], dy = e.changedTouches[0].clientY - touch[1];
    touch = null;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    const index = current + (dx < 0 ? 1 : -1);
    if (index < 0 || index >= rows.length) return;
    e.preventDefault(); skipClick = true;
    navigate(index);
    setTimeout(() => { skipClick = false; }, 260);
  }, {passive:false});
  document.addEventListener('keydown', e => {
    if (openPanel) {
      if (e.key === 'Escape') { e.preventDefault(); closePanel(); }
      if (e.key === 'Tab') {
        const controls = Array.from(openPanel.querySelectorAll('button:not(:disabled),a[href]'));
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); safeFocus(last); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); safeFocus(first); }
      }
      return;
    }
    if (current < 0 || e.altKey || e.ctrlKey || e.metaKey || e.target === clip) return;
    if (e.key === 'ArrowRight' && current < rows.length - 1) { e.preventDefault(); navigate(current + 1); }
    if (e.key === 'ArrowLeft' && current > 0) { e.preventDefault(); navigate(current - 1); }
  });

  const first = rows[0], ending = rows[rows.length - 1];
  $('cover-photo').src = album.cover;
  $('cover-photo-date').textContent = (first.date || '').split('-').join('.');
  $('birthday-date').textContent = (ending.date || '').split('-').join(' · ');
  updateChapters(); updateMusicButton();
  render(parseHash());
  syncMusic(); unlockInWeChat();
})();
