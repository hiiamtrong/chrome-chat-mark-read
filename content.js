(() => {
  const BUTTON_ATTR = 'data-gchat-markread';
  const STEP_DELAY = 700;
  const ROW_TIMEOUT = 3000;
  const MAX_ITER = 500;
  const STALL_LIMIT = 5;
  const SCROLL_STEP_RATIO = 0.8;
  const REBUILD_DELAY = 500;
  const SCOPE_DEPTH = 5;
  const API_DELAY = 150;
  const API_BATCH = 4;
  const RELOAD_DELAY = 1500;
  const PAGE_WAIT = 3000;
  const hooks = { reload: () => location.reload() };
  // Header client Chat tu gui o cuoi body ([99]); list_topics duoc thu voi dung gia tri nay. shortcut: co dinh "en".
  const CLIENT_HEADER = [0, 3, 1, 'en', [null, null, null, null, 2, 2, null, 2, 2, 2, 2, null, null, null, null, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, null, null, 2, 2, null, null, 2, 2, 2, null, null, null, null, 2, 2, 2, 2, null, 2, null, null, 2, null, 2, 2, 2, 2, null, 2, null, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, null, 2, 2, null, 2, 2, null, 2]];
  let apiSeq = 1000;
  // Material Symbols 24px. Icon dang doc la cung ban (ve bang stroke trong CSS) va xoay.
  const ICONS = {
    idle: 'M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z',
    running: 'M12 4a8 8 0 1 0 8 8',
    done: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
    fail: 'M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
  };
  ICONS.empty = ICONS.idle;

  // [en, vi]: nhan theo ngon ngu cua Chat (html lang), la nhan cua chinh san pham.
  const TEXT = {
    idle: ['Mark all read', 'Đọc hết'],
    running: ['Reading…', 'Đang đọc…'],
    done: ['Read', 'Đã đọc'],
    empty: ['Nothing to read', 'Không còn gì'],
    fail: ["Couldn't read", 'Không đọc được'],
  };
  const HINT = {
    idle: ['Mark every unread conversation in this list as read', 'Đánh dấu đã đọc mọi hội thoại chưa đọc trong danh sách này'],
    running: ['Click to stop', 'Bấm để dừng'],
    done: ['Marked as read', 'Đã đánh dấu đã đọc'],
    empty: ['No unread conversations in this list', 'Danh sách này không còn hội thoại chưa đọc'],
    fail: ['Reload the page and try again', 'Tải lại trang rồi thử lại'],
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Row group-level khong co topic id nen khoa la group id.
  const rowKey = (row) => row.getAttribute('data-topic-id') || row.getAttribute('data-group-id');

  function isVisible(el) {
    return !!el && el.offsetParent !== null;
  }

  // Nhan phu dinh ("Mark as unread") khong duoc tinh la chua doc, nhung ten nhu
  // "SotaTek Market" van phai tinh.
  function isUnreadLabel(label) {
    const text = label || '';
    return /unread|chưa đọc/i.test(text) && !/mark (as )?unread|đánh dấu (là )?chưa đọc/i.test(text);
  }

  // Google Chat khong set class on dinh cho read-state. Row that mang co data-is-unread
  // (da kiem tra tren DOM app that); cac cue ben duoi chi la du phong.
  // shortcut: du phong chi con aria-label va badge so, Google doi DOM thi sua o day.
  function isUnreadRow(row) {
    if (!row) return false;
    const flag = row.getAttribute('data-is-unread');
    if (flag) return flag === 'true';
    if (isUnreadLabel(row.getAttribute('aria-label'))) return true;
    for (const el of row.querySelectorAll('[aria-label]')) {
      if (isUnreadLabel(el.getAttribute('aria-label'))) return true;
    }
    for (const el of row.querySelectorAll('span, div')) {
      if (el.children.length) continue;
      if (!/^\d{1,3}\+?$/.test((el.textContent || '').trim())) continue;
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.width <= 32 && box.height > 0 && box.height <= 32) return true;
    }
    return false;
  }

  // Du phong khi Chat khong dat role cho row: row = con co avatar / aria-label / jsaction.
  function isRowLike(el) {
    if (!isVisible(el)) return false;
    if (el.getAttribute('aria-label') || el.querySelector('img')) return true;
    return el.hasAttribute('jsaction') || !!el.querySelector('[jsaction]');
  }

  function rowsIn(panel) {
    // Row group/DM khong co data-topic-id nhung van la row cua list, nen lay ca data-group-id (con ngoai cung)
    // thay vi chi data-topic-id, neu khong run dung ngay khi het row topic.
    const byData = [...panel.querySelectorAll('[data-topic-id], [data-group-id]')].filter(
      (el) => isVisible(el) && !el.parentElement.closest('[data-topic-id], [data-group-id]'),
    );
    if (byData.length) return byData;
    const byRole = [...panel.querySelectorAll('[role="listitem"], [role="row"]')].filter(isVisible);
    if (byRole.length) return byRole;
    return [...panel.children].filter(isRowLike);
  }

  // Uu tien panel co nhieu row chua doc, de khong chon nham list message.
  function scoreRows(rows) {
    return rows.filter(isUnreadRow).length * 1000 + rows.length;
  }

  function rolePanelIn(root, accept = () => true) {
    const tagged = [...root.querySelectorAll('[data-topic-id], [role="listitem"], [role="row"]')].filter(
      (el) => isVisible(el) && accept(el),
    );
    const groups = new Map();
    for (const row of tagged) {
      const parent = row.parentElement;
      if (!parent) continue;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(row);
    }
    let best = { panel: null, rows: [] };
    let bestScore = 0;
    for (const [panel, rows] of groups) {
      const score = scoreRows(rows);
      if (score > bestScore) {
        bestScore = score;
        best = { panel, rows };
      }
    }
    return best;
  }

  function structuralPanelIn(root, accept = () => true) {
    let best = { panel: null, rows: [] };
    let bestScore = 0;
    for (const el of root.querySelectorAll('div')) {
      if (el.children.length < 2) continue;
      if (el.scrollHeight <= el.clientHeight + 20) continue;
      const rows = [...el.children].filter((child) => isRowLike(child) && accept(child));
      if (rows.length < 2) continue;
      const score = scoreRows(rows);
      if (score > bestScore) {
        bestScore = score;
        best = { panel: el, rows };
      }
    }
    return best;
  }

  // List cua view nam duoi pill va cung cot voi no. Neu khong loc, view rong (het backlog) se leo len
  // tan sidebar va bam nham vao muc co badge so (vd Drafts); pill bi go khoi trang thi khong co row nao
  // thoa nen run dung lai.
  function belowPill(btn) {
    const pill = btn.getBoundingClientRect();
    return (el) => {
      const box = el.getBoundingClientRect();
      return box.top >= pill.bottom - 2 && box.left <= pill.right && box.right >= pill.left;
    };
  }

  // Dem theo rowsIn (cung thuoc voi `rows` trong run), khong dung rows da loc cua scopePanel.
  function countRows(btn) {
    const { panel } = scopePanel(btn);
    return panel ? rowsIn(panel).length : 0;
  }

  function scopePanel(btn) {
    const accept = belowPill(btn);
    for (let node = btn.parentElement, depth = 0; node && depth < SCOPE_DEPTH; depth++, node = node.parentElement) {
      const found = rolePanelIn(node, accept);
      if (found.panel) return found;
    }
    return structuralPanelIn(document.body, accept);
  }

  // Hang header cua Chat la flex: [toggle Unread] [vien thuoc Thread] [menu]. Pill phai la anh em cua
  // ca cum chip (di len toi cap ma cha co >= 2 con), neu khong se nam trong nen xam cua chip Thread.
  function chipRows() {
    const rows = new Map();
    for (const el of document.querySelectorAll('[role="button"], button')) {
      if (!/^(unread|thread|chưa đọc)$/i.test((el.textContent || '').trim())) continue;
      if (!isVisible(el)) continue;
      let anchor = el;
      while (anchor.parentElement && anchor.parentElement.children.length < 2) anchor = anchor.parentElement;
      const row = anchor.parentElement;
      if (row && isVisible(row)) rows.set(row, anchor);
    }
    return [...rows].map(([row, anchor]) => ({ row, anchor }));
  }

  function scrollerOf(el) {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight + 4) return node;
    }
    return el;
  }

  function atBottom(el) {
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
  }

  // Day list la dieu kien dung, de khong cuon vo han khi list ao hoa render lai.
  function scrollStep(el) {
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 4) return false;
    const before = el.scrollTop;
    if (before >= max - 4) {
      el.scrollTop = 0;
      return false;
    }
    el.scrollTop = Math.min(max, before + el.clientHeight * SCROLL_STEP_RATIO);
    return el.scrollTop > before;
  }

  // Chat mo hoi thoai o mousedown chu khong phai click (da kiem tra tren app that),
  // nen phai dispatch du chuoi pointer/mouse; element.click() bi bo qua.
  function clickRow(row) {
    const box = row.getBoundingClientRect();
    const opts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: 1,
      view: window,
      clientX: Math.round(box.left + box.width / 2),
      clientY: Math.round(box.top + box.height / 2),
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
    };
    row.dispatchEvent(new PointerEvent('pointerdown', opts));
    row.dispatchEvent(new MouseEvent('mousedown', opts));
    row.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }));
    row.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
    row.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }));
  }

  function apiRoot() {
    const account = location.pathname.match(/^\/u\/(\d+)\//);
    return `/u/${account ? account[1] : 0}/api`;
  }

  async function fetchXsrf() {
    const res = await fetch(`${apiRoot()}/xsrf_token?c=${apiSeq++}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '[]',
    });
    if (!res.ok) throw new Error(`xsrf_token ${res.status}`);
    return (await res.text()).trim();
  }

  async function apiPost(endpoint, space, body, xsrf) {
    try {
      const res = await fetch(`${apiRoot()}/${endpoint}?c=${apiSeq++}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-framework-xsrf-token': xsrf,
          'x-goog-chat-space-id': space,
        },
        body: JSON.stringify(body),
      });
      return { ok: res.ok, status: res.status, text: await res.text() };
    } catch (err) {
      console.warn('[gchat-markread] api lỗi, dùng click DOM:', err.message);
      return { ok: false, status: 0, text: '' };
    }
  }

  async function postRead(endpoint, space, body, xsrf, marker) {
    const { ok, status, text } = await apiPost(endpoint, space, body, xsrf);
    if (!marker) console.log(`[gchat-markread] ${endpoint} ${space} -> ${status} ${text.slice(0, 120)}`);
    return ok && (!marker || text.includes(marker));
  }

  // Co "chua doc" cua mot thread: day la cai "Mark as read" tren row thread that goi (payload bat tu app that).
  function clearThreadMark(space, topic, xsrf) {
    const body = new Array(100).fill(null);
    body[0] = [null, topic, [[space]]];
    body[1] = 0;
    return apiPost('set_topic_unread_timestamp', space, body, xsrf);
  }

  // Space co thread chua doc: Chat xoa co chua doc cua tung thread bang set_topic_unread_timestamp (id thread
  // khong co trong DOM cua row), nen lay id tu list_topics. Payload bat tu app that; doi [8]/[9] cho ra cung 32 thread
  // nen dung gio may. shortcut: xoa co cua moi thread tra ve (khong co co chua doc de loc), ton ~30 request moi space.
  async function clearThreadMarks(space, xsrf) {
    const now = Date.now() * 1000;
    const list = new Array(100).fill(null);
    list[1] = 32;
    list[3] = [null, null, null, null, [1795596034859439]];
    list[4] = [3, 1, 4];
    list[5] = 1000;
    list[6] = 20;
    list[7] = [[space]];
    list[8] = [now];
    list[9] = [now];
    list[10] = 2;
    list[99] = CLIENT_HEADER;
    const res = await apiPost('list_topics', space, list, xsrf);
    if (!res.ok) return false;
    const refs = res.text.matchAll(new RegExp(`\\[null,"([\\w-]{11})",\\[\\["${space}"\\]\\]\\]`, 'g'));
    const ids = [...new Set([...refs].map((m) => m[1]))];
    let cleared = 0;
    for (let i = 0; i < ids.length; i += API_BATCH) {
      const done = await Promise.all(
        ids.slice(i, i + API_BATCH).map((id) => clearThreadMark(space, id, xsrf)),
      );
      cleared += done.filter((r) => r.ok).length;
    }
    console.log(`[gchat-markread] threads ${space}: ${ids.length} thread, xoá cờ ${cleared}`);
    return cleared > 0;
  }

  // Co "chua doc" cua row (cham xanh), doc lap voi moc doc cua space: "Mark as read" tren row chi goi cai nay
  // voi timestamp 0 (payload bat tu app that). target la body[0]: [[space]] cho space, [null, null, [id]] cho DM.
  function clearUnreadMark(id, target, xsrf) {
    const body = new Array(100).fill(null);
    body[0] = target;
    body[1] = 0;
    return postRead('set_mark_as_unread_timestamp', id, body, xsrf);
  }

  // Endpoint noi bo cua web app, khong co tai lieu, da replay thanh cong tren app that.
  // Timestamp phai >= micro-timestamp tin moi nhat; row chi co mili giay nen cong 999us
  // (gui ms*1000 tron thi server tra 200 nhung topic van chua doc). Body 100 phan tu la do dai
  // Chat tu gui, field 99 (header client) bo trong van duoc.
  // Row khong co topic (group/space-level) hoac topic that bai thi danh dau ca space bang
  // mark_group_readstate (payload bat tu app that): body[0]=[[space]], body[1]=micro-timestamp.
  // Click DOM chi la du phong cuoi vi no mo hoi thoai (redirect).
  async function markViaApi(row, xsrf) {
    const topic = row.getAttribute('data-topic-id');
    const group = row.getAttribute('data-group-id') || '';
    const ts = Number(row.getAttribute('data-display-timestamp'));
    if (!xsrf) return false;
    if (group.startsWith('dm/')) {
      const dm = group.slice('dm/'.length);
      return clearUnreadMark(dm, [null, null, [dm]], xsrf);
    }
    if (!group.startsWith('space/')) return false;
    const space = group.slice('space/'.length);
    if (topic && ts) {
      const body = new Array(100).fill(null);
      body[0] = [null, topic, [[space]]];
      body[1] = ts * 1000 + 999;
      if (await postRead('mark_topic_readstate', space, body, xsrf, 'dfe.rs.mtrs')) {
        // Moc doc khong xoa co chua doc cua thread (cham xanh van con), nen xoa them.
        const cleared = await clearThreadMark(space, topic, xsrf);
        console.log(`[gchat-markread] set_topic_unread_timestamp ${topic} -> ${cleared.status} ${cleared.text.slice(0, 80)}`);
        return true;
      }
    }
    const body = new Array(100).fill(null);
    body[0] = [[space]];
    // Giong app that: timestamp cua tin moi nhat (row chi co ms nen +999us). Gio may bi bo vi khong doc duoc nhu mong doi.
    // shortcut: row khong co timestamp thi dung gio may, chua kiem chung.
    body[1] = ts ? ts * 1000 + 999 : Date.now() * 1000;
    const read = await postRead('mark_group_readstate', space, body, xsrf);
    // Chi ghi moc doc thi cham xanh cua row van con (da gap voi SotaTek Market), nen xoa them co chua doc.
    const unreadCleared = await clearUnreadMark(space, [[space]], xsrf);
    const threadsCleared = await clearThreadMarks(space, xsrf);
    return unreadCleared || threadsCleared || read;
  }

  async function waitUntil(predicate, timeout) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await sleep(100);
    }
    return predicate();
  }

  function createButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute(BUTTON_ATTR, '');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
    const label = document.createElement('span');
    label.setAttribute('data-label', '');
    btn.append(svg, label);
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      onClick(btn);
    });
    setState(btn, 'idle');
    return btn;
  }

  // Lay nen va mau chu cua chip lien ke de pill khop theme cua Chat (sang/toi).
  function matchHost(btn, anchor) {
    const style = getComputedStyle(anchor);
    if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') btn.style.setProperty('--mr-bg', style.backgroundColor);
    btn.style.setProperty('--mr-fg', style.color);
  }

  function setState(btn, state, count) {
    const lang = document.documentElement.lang.startsWith('vi') ? 1 : 0;
    btn.dataset.state = state;
    btn.title = HINT[state][lang];
    btn.setAttribute('aria-busy', String(state === 'running'));
    btn.querySelector('path').setAttribute('d', ICONS[state]);
    const showCount = (state === 'running' || state === 'done') && count > 0;
    btn.querySelector('[data-label]').textContent = TEXT[state][lang] + (showCount ? ` ${count}` : '');
  }

  // Chi view co chip Unread/Thread (Home) moi nhan nut. Mentions/Starred dung row div[role=link]
  // khong co data-topic-id lan co chua doc, va chon list theo role/badge tung chen nut vao sidebar.
  function ensureButtons() {
    for (const { row, anchor } of chipRows()) {
      if (row.querySelector(`[${BUTTON_ATTR}]`)) continue;
      const btn = createButton();
      anchor.after(btn);
      matchHost(btn, anchor);
    }
  }

  function debugDump(panel) {
    console.log('[gchat-markread] debug panel:', panel ? panel.outerHTML.slice(0, 300) : 'khong tim thay panel');
    const first = panel ? rowsIn(panel)[0] : null;
    console.log('[gchat-markread] debug row:', first ? first.outerHTML.slice(0, 400) : 'khong co row');
  }

  async function run(btn) {
    btn.__abort = false;
    clearTimeout(btn.__resetTimer);
    setState(btn, 'running');

    const scope = scopePanel(btn);
    let panel = scope.panel;
    const skip = new Set();
    const done = new Set();
    const xsrf = await fetchXsrf().catch((err) => {
      console.warn('[gchat-markread] không lấy được xsrf, dùng click DOM:', err.message);
      return null;
    });
    let viaApi = 0;
    let read = 0;
    let fails = 0;
    let iter = 0;
    let total = scope.rows.length;
    let unreadLeft = 0;
    let reason = panel ? 'hết danh sách' : 'không tìm thấy list';

    while (!btn.__abort && iter < MAX_ITER) {
      if (!btn.isConnected) {
        reason = 'pill bị gỡ khỏi trang';
        break;
      }
      iter++;
      // Chat render lại list sau mỗi lần mở hội thoại, nên scope lại mỗi vòng.
      const fresh = scopePanel(btn);
      if (fresh.panel) panel = fresh.panel;
      if (!panel) {
        reason = 'không tìm thấy list';
        break;
      }
      const rows = rowsIn(panel);
      total = rows.length;
      const unread = rows.filter(
        (row) => !skip.has(row) && !done.has(rowKey(row)) && isUnreadRow(row),
      );
      unreadLeft = unread.length;
      if (!unread.length) {
        const scroller = scrollerOf(panel);
        // scrollStep false = khong cuon them duoc (vd overflow: clip), coi nhu da toi day.
        if (!atBottom(scroller) && scrollStep(scroller)) {
          await sleep(400);
          continue;
        }
        // Chat tai trang ke tiep (50 topic) sau khi cuon toi day, nen cho truoc khi ket luan het.
        if (!(await waitUntil(() => countRows(btn) > rows.length, PAGE_WAIT))) break;
        continue;
      }
      const batch = unread.slice(0, API_BATCH);
      const marked = await Promise.all(batch.map((item) => markViaApi(item, xsrf)));
      batch.forEach((item, i) => {
        if (!marked[i]) return;
        done.add(rowKey(item));
        read++;
        viaApi++;
      });
      // DM chua co payload API: click se mo hoi thoai, Chat doi view, pill bi go va run dung giua chung
      // (cac row con lai khong bao gio duoc doc). Bo qua de run doc het phan con lai.
      batch.forEach((item, i) => {
        if (!marked[i] && (item.getAttribute('data-group-id') || '').startsWith('dm/')) skip.add(item);
      });
      if (marked.some(Boolean)) {
        fails = 0;
        setState(btn, 'running', read);
        await sleep(API_DELAY);
        continue;
      }
      const row = batch.find((item) => !skip.has(item));
      if (!row) continue;
      clickRow(row);
      if (await waitUntil(() => !row.isConnected || !isUnreadRow(row), ROW_TIMEOUT)) {
        read++;
        fails = 0;
      } else {
        skip.add(row);
        fails++;
      }
      if (fails >= STALL_LIMIT) {
        reason = 'stall (tab mất focus?)';
        break;
      }
      await sleep(STEP_DELAY);
    }
    if (btn.__abort) reason = 'dừng bởi người dùng';
    else if (iter >= MAX_ITER) reason = 'chạm MAX_ITER';

    const role = panel && panel.getAttribute('role');
    const hint = panel ? panel.tagName.toLowerCase() + (role ? `[role=${role}]` : '') : '-';
    console.log(
      `[gchat-markread] panel=${hint} rows=${total} unread=${unreadLeft} đã đọc=${read} (api=${viaApi}) bỏ qua=${skip.size} dừng vì ${reason}`,
    );
    // Khong co row nao duoi pill nghia la view rong (bo loc hinh hoc da loai sidebar), khong phai loi.
    const outcome = !read && skip.size ? 'fail' : read ? 'done' : 'empty';
    if (outcome === 'fail') debugDump(panel);
    setState(btn, outcome, read);
    // Chat khong tu cap nhat UI sau khi doc bang API (da do 60s), nen tai lai de thay ket qua that.
    if (viaApi && !btn.__abort) setTimeout(() => hooks.reload(), RELOAD_DELAY);
    btn.__resetTimer = setTimeout(() => {
      if (btn.dataset.state !== 'running') setState(btn, 'idle');
    }, 3000);
  }

  function onClick(btn) {
    if (btn.dataset.state === 'running') {
      btn.__abort = true;
      return;
    }
    run(btn);
  }

  function boot() {
    if (!/(^|\.)chat\.google\.com$/.test(location.hostname)) return;
    let timer = 0;
    const kick = () => {
      clearTimeout(timer);
      timer = setTimeout(ensureButtons, REBUILD_DELAY);
    };
    new MutationObserver(kick).observe(document.body, { childList: true, subtree: true });
    kick();
  }

  window.__chatMarkRead = {
    isUnreadLabel,
    isUnreadRow,
    isRowLike,
    rowsIn,
    rolePanelIn,
    structuralPanelIn,
    scopePanel,
    chipRows,
    ensureButtons,
    setState,
    scrollStep,
    clickRow,
    hooks,
  };

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
