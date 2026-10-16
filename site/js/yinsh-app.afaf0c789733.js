(function () {
  'use strict';
  const Motion = window.BoardMotion || { watch: () => null, aiDelay: () => 400, cancel() {} };
  const Room = window.BoardRoom || { active: false, wrap: e => e };
  const root = document.getElementById('yinsh'), overlay = document.getElementById('yinsh-overlay');
  const KEY = 'boardgame-box-yinsh-v1';
  let E = window.YinshEngine, game = null, saved = null, screen = 'setup', mode = 'ai', human = 1, target = 3;
  let selected = null, selectedRow = 0, timer = null, rulesOpen = false, error = '', aiFailed = false, hints = true, hover = null;
  try { hints = localStorage.getItem('boardgame-box-yinsh-hints') !== 'off'; } catch {}
  E = Motion.watch({ game: 'yinsh', engine: E, state: () => game, methods: ['play', 'undo'] }) || E;
  E = Room.wrap(E, 'yinsh');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const label = i => E.POINTS[i].label;
  const color = player => player === 1 ? 'white' : 'black';
  const side = player => player === 1 ? '白方' : '黑方';
  const piece = (value, extra = '') => '<span class="yn-piece ' + (value >= 3 ? 'ring ' : 'marker ') + color(value >= 3 ? value - 2 : value) + extra + '" aria-hidden="true"></span>';
  function name(player) {
    if (Room.active) return esc(Room.snapshot?.seats[player - 1]?.name || side(player));
    return game.mode === 'local' ? side(player) : game.human === player ? '你' : '电脑（简单）';
  }
  function isAI() { return !Room.active && game?.mode === 'ai' && game.turn !== game.human && !game.winner; }
  function canAct() { return game && !game.winner && (!Room.active ? !isAI() : Room.canAct); }
  function save() {
    if (Room.active) return;
    try {
      if (!E.validSave(game)) throw Error('棋局状态未通过校验');
      localStorage.setItem(KEY, JSON.stringify(game)); localStorage.setItem('boardgame-box-last-played', 'yinsh');
      saved = structuredClone(game);
    } catch (e) { error = '保存失败：' + e.message; }
  }
  function header(inGame = false) {
    return '<header class="yn-header"><a href="index.html" class="yn-brand"><span class="yn-brand-mark">◎</span><span>桌游盒子<small>BOARD GAME LOUNGE</small></span></a>' +
      '<a href="index.html" class="yn-back">← 桌游中心</a>' + (inGame ? '<nav aria-label="对局操作"><button data-action="rules">规则</button><button data-action="undo"' +
      (!game.history.length || Room.active && !Room.connected ? ' disabled' : '') + '>悔棋</button><button data-action="new">新对局</button></nav>' : '<button data-action="rules">玩法说明 ↗</button>') + '</header>';
  }
  function gridSVG() {
    const lines = E.POINTS.flatMap((p, i) => [[1, 0], [0, 1], [1, -1]].flatMap(([q, r]) => {
      const j = E.at(p.q + q, p.r + r); if (j === undefined) return [];
      const to = E.POINTS[j]; return ['<line x1="' + p.x + '" y1="' + p.y + '" x2="' + to.x + '" y2="' + to.y + '"/>'];
    })).join('');
    const labels = E.POINTS.filter(p => E.at(p.q, p.r - 1) === undefined).map(p => '<text x="' + p.x + '" y="' + (p.y - 24) + '">' + p.label[0] + '</text>').join('');
    return '<svg class="yn-grid" viewBox="0 0 660 660" aria-hidden="true"><circle class="yn-board-rim" cx="330" cy="330" r="291"/><circle class="yn-board-rim inner" cx="330" cy="330" r="281"/>' +
      '<g class="yn-grid-lines">' + lines + '</g><g class="yn-grid-dots">' + E.POINTS.map(p => '<circle cx="' + p.x + '" cy="' + p.y + '" r="2.15"/>').join('') +
      '</g><g class="yn-coordinates">' + labels + '</g><g class="yn-path" data-yn-path></g><text class="yn-board-wordmark" x="330" y="636">Y I N S H</text></svg>';
  }
  function board(preview = false) {
    const mock = Array(85).fill(0);
    if (preview) {
      [[-2, 0, 3], [1, 1, 4], [2, -3, 3], [-2, 3, 4], [3, -1, 3], [0, -1, 1], [0, 0, 2], [0, 1, 1], [-1, 1, 2], [1, 0, 1]].forEach(([q, r, v]) => { mock[E.at(q, r)] = v; });
    }
    const values = preview ? mock : game.board;
    const destinations = !preview && selected !== null ? new Set(E.ringMoves(game, selected).map(a => a.to)) : new Set();
    const row = !preview && game.phase === 'row' ? E.rows(game)[selectedRow] || [] : [];
    const last = !preview ? game.last : null;
    return '<div class="yn-board' + (preview ? ' preview' : '') + '"' + (preview ? ' aria-hidden="true"' : ' role="group" aria-label="圈套棋85个交点的棋盘"') + '>' + gridSVG() + values.map((v, i) => {
      const p = E.POINTS[i], legal = destinations.has(i) && hints;
      const own = !preview && v === game.turn + 2 && ['move', 'ring'].includes(game.phase);
      const classes = 'yn-point' + (selected === i && !preview ? ' selected' : '') + (legal ? ' legal' : '') + (row.includes(i) ? ' row-selected' : '') +
        (own && canAct() ? ' selectable' : '') + (last && (last.to === i || last.from === i) ? ' last' : '');
      const description = v ? side(v >= 3 ? v - 2 : v) + (v >= 3 ? '环' : '棋子') : '空位';
      const tip = preview ? '' : game.winner ? '本局已经结束，可查看棋盘或新开一局' : !canAct() ? Room.active ? Room.reason : '电脑正在行动，请稍候' :
        game.phase === 'place' ? v ? '已有棋子，请选空交点放环' : '在 ' + p.label + ' 放置' + side(game.turn) + '的环' :
        game.phase === 'row' ? '在右侧选择连续五枚同色棋子，再确认收回' : game.phase === 'ring' ? own ? '收回这个环，得 1 分' : '请选择自己的环收回' :
        own ? '选择这个环，再点击高亮的空交点' : destinations.has(i) ? '移到 ' + p.label + '，跳过的全部棋子会翻色' :
        v >= 3 ? '只能选择自己的环，环不能跳过其他环' : v ? '环不能停在棋子上' : '选择自己的环后，点击高亮交点；跳子后必须在第一个空位停下';
      const attrs = ' class="' + classes + '" style="left:' + p.x / 6.6 + '%;top:' + p.y / 6.6 + '%"';
      return preview ? '<span' + attrs + '>' + (v ? piece(v) : '') + '</span>' : '<button' + attrs + ' type="button" data-yn-point="' + i + '" data-cell="' + i +
        '" title="' + esc(tip) + '" aria-label="' + esc(p.label + '，' + description + '。' + tip) + '">' + (v ? piece(v) : '<i class="yn-landing" aria-hidden="true"></i>') + '</button>';
    }).join('') + '</div>';
  }
  function renderSetup() {
    root.innerHTML = '<div class="yn-app">' + header() + '<main class="yn-setup"><div class="yn-setup-art">' + board(true) + '<span class="yn-art-tag">一场黑白之间的反转</span></div>' +
      '<section class="yn-setup-copy"><div class="yn-eyebrow">GIPF PROJECT · ABSTRACT STRATEGY</div><h1>圈套棋<span>YINSH</span></h1>' +
      '<p class="yn-lead">移动一个环，翻转一片局面。<br>五子成行，收环取胜。</p><div class="yn-facts"><span>2 人对弈</span><span>约 30 分钟</span><span>简单电脑</span></div>' +
      '<h2>选择对局方式</h2><div class="yn-options"><button data-mode="ai" aria-pressed="' + (mode === 'ai') + '"><strong>挑战电脑</strong><small>一档简单难度</small></button><button data-mode="local" aria-pressed="' +
      (mode === 'local') + '"><strong>双人同屏</strong><small>和朋友轮流操作</small></button></div>' +
      (mode === 'ai' ? '<div class="yn-color-options" role="group" aria-label="选择执子颜色"><button data-human="1" aria-pressed="' + (human === 1) + '"><i class="yn-small-ring white"></i> 我执白 · 先手</button><button data-human="2" aria-pressed="' + (human === 2) + '"><i class="yn-small-ring black"></i> 我执黑 · 后手</button></div>' : '') +
      '<div class="yn-length-options" role="group" aria-label="选择胜利目标"><button data-target="3" aria-pressed="' + (target === 3) + '">标准 · 收回 3 环</button><button data-target="1" aria-pressed="' + (target === 1) + '">快速 · 收回 1 环</button></div>' +
      '<div class="yn-setup-actions"><button class="yn-primary" data-action="start">开始对局 <span>→</span></button>' + (saved ? '<button class="yn-secondary" data-action="continue">继续上次对局</button>' : '') + '</div>' +
      '<p class="yn-setup-note">白方先行 · 51 枚公共棋子 · 自动保存到当前浏览器</p>' +
      (window.BoardSite?.multiplayer !== false && window.BoardRoom ? '<a class="yn-online" href="online.html?game=yinsh">各自设备游玩 · 创建好友房间 ↗</a>' : '') + '</section></main></div>';
  }
  function status() {
    if (game.winner) return game.winner === 3 ? '双方和棋' : side(game.winner) + ' · ' + name(game.winner) + '获胜';
    const suffix = { place: '放置一个环', move: selected === null ? '选择一个环' : '选择环的落点', row: '选择收回的五子排', ring: '收回自己的一个环' }[game.phase];
    return side(game.turn) + ' · ' + (isAI() ? '电脑正在思考' : suffix);
  }
  function player(player) {
    const count = game.board.filter(v => v === player + 2).length;
    return '<article class="yn-player ' + color(player) + (!game.winner && game.turn === player ? ' active' : '') + '" data-motion-player="' + (player - 1) + '"><div class="yn-player-head"><i class="yn-small-ring ' + color(player) + '"></i><div><strong>' +
      name(player) + '</strong><small>' + side(player) + (player === 1 ? ' · 先手' : ' · 后手') + '</small></div><b>' + game.scores[player - 1] + '<small>/' + game.target + '</small></b></div>' +
      '<div class="yn-score-tray" aria-label="' + side(player) + '已收回' + game.scores[player - 1] + '环">' + Array.from({ length: game.target }, (_, i) => '<span class="yn-score-slot' +
      (i < game.scores[player - 1] ? ' scored' : '') + '" data-yinsh-score="' + player + ':' + (i + 1) + '" title="第 ' + (i + 1) + ' 个得分环' + (i < game.scores[player - 1] ? '：已收回' : '：尚未收回') + '">' +
      (i < game.scores[player - 1] ? '<i class="yn-small-ring ' + color(player) + '"></i>' : '<small>' + (i + 1) + '</small>') + '</span>').join('') +
      '<span class="yn-ring-count">' + (game.phase === 'place' ? '待放 ' + (5 - game.placed[player - 1]) : '场上 ' + count) + ' 环</span></div></article>';
  }
  function actionPanel() {
    const instructions = {
      place: ['先安放你的环', '点击棋盘上的空交点。双方交替，各放五个环；放完后白方先移动。'],
      move: [selected === null ? '选择一个自己的环' : '从 ' + label(selected) + ' 移向高亮位置', '环沿直线移动，原位留下同色棋子。跳过连续棋子后，只能停在紧接的第一个空位；跳过的双方棋子全部翻色。'],
      row: ['五子成行，选择收排', '必须收回连续五枚同色棋子；多排可选时，先选一排。交叉排与剩余长排会在收环后重新判断。'],
      ring: ['现在收回一个自己的环', '点击场上任意一个自己的环。收回环即得 1 分，这个环会进入你的计分栏。'],
      gameover: ['对局完成', game.reason === 'pool' ? '公共棋子用尽，且本轮成排已处理完毕，按收回环数比较胜负。' : game.reason === 'blocked' ? '双方均无合法移动，本网页约定以和棋结束。' : '先收回 ' + game.target + ' 个环的一方获胜。']
    }[game.phase];
    const choices = game.phase === 'row' ? E.rows(game) : [];
    if (selectedRow >= choices.length) selectedRow = 0;
    return '<section class="yn-action-panel"><span class="yn-eyebrow">' + (game.phase === 'place' ? '01 · 放环' : game.phase === 'move' ? '02 · 移环与翻面' : game.phase === 'row' ? '03 · 收回五子' : game.phase === 'ring' ? '04 · 收回一个环' : 'GAME COMPLETE') +
      '</span><h2>' + instructions[0] + '</h2><p>' + instructions[1] + '</p>' + (isAI() ? '<div class="yn-thinking"><i></i>电脑正在' + ({ place: '选择放环位置', move: '寻找成排机会', row: '选择收回的排', ring: '选择收回的环' }[game.phase]) + '…</div>' : '') +
      (choices.length ? '<div class="yn-row-choices" role="group" aria-label="选择要收回的连续五子">' + choices.map((cells, i) => '<button data-row-index="' + i + '" aria-pressed="' + (i === selectedRow) + '"><b>排 ' + (i + 1) +
      '</b><span>' + label(cells[0]) + ' → ' + label(cells.at(-1)) + '</span><small>连续 5 枚</small></button>').join('') + '</div><button class="yn-primary yn-confirm-row" data-action="take-row"' +
      (!canAct() ? ' disabled' : '') + '>收回这 5 枚棋子 →</button><small class="yn-resolve-order">' + side(game.mover) + '移环产生的局面：先结算移环方，再结算对手。</small>' : '') +
      (game.phase === 'move' && !E.movesFor(game).length ? '<button class="yn-secondary" data-action="pass"' + (!canAct() ? ' disabled' : '') + '>无合法移动 · 停一步</button>' : '') +
      (selected !== null && game.phase === 'move' ? '<button class="yn-text-button" data-action="cancel">取消选择</button>' : '') + '</section>';
  }
  function renderGame() {
    const title = status();
    root.innerHTML = '<div class="yn-app">' + header(true) + '<main class="yn-game"><aside class="yn-side"><div class="yn-title"><span class="yn-eyebrow">YINSH · GIPF PROJECT</span><h1>圈套棋</h1></div>' +
      '<div class="yn-status' + (game.winner ? ' ended' : '') + '" role="status"><small>' + (game.target === 1 ? '快速对局 · 收回 1 环获胜' : '标准对局 · 收回 3 环获胜') + '</small><strong>' + title +
      '</strong><span>' + (Room.active ? '房间联机' : game.mode === 'ai' ? '挑战电脑 · 简单' : '双人同屏') + (game.phase === 'place' ? ' · 已放 ' + game.placed.reduce((a, b) => a + b, 0) + '/10 环' : ' · 第 ' + game.moveNumber + ' 手') +
      '</span></div><div class="yn-players">' + player(1) + player(2) + '</div><div class="yn-reserve" title="每次移环使用 1 枚；收回一排会归还 5 枚。不是个人棋子数量。"><span class="yn-reserve-art">' + piece(1) + piece(2) +
      '</span><div><small>公共棋子</small><strong>' + game.pool + '<span> / 51</span></strong></div></div></aside>' +
      '<section class="yn-table"><div class="yn-table-top"><span>' + (game.phase === 'row' ? '<button class="yn-phase-jump" data-action="show-rows">已成排 · 选择收回的五子 ↓</button>' : game.phase === 'ring' ? '点击自己的一个空心环收回' : '白方先行 · 环与棋子是两种棋具') + '</span><button data-action="hints" aria-pressed="' + hints + '">' + (hints ? '●' : '○') + ' 落点提示</button></div>' + board() +
      '<div class="yn-board-legend"><span><i class="yn-small-ring white"></i> 空心是环</span><span><i class="yn-small-marker"></i> 实心是棋子</span><span class="yn-preview-text">' + (selected !== null ? '已选 ' + label(selected) + ' · 高亮为空的合法落点' : '点击交点操作 · 悬停查看说明') +
      '</span></div>' + (error ? '<p class="yn-error" role="alert">' + esc(error) + '</p>' : '') + '</section><aside class="yn-details">' + actionPanel() +
      (aiFailed ? '<button class="yn-secondary" data-action="retry-ai">重试电脑行动</button>' : '') + '<section class="yn-journal"><div><span class="yn-eyebrow">TABLE JOURNAL</span><h2>对局记录</h2></div><ol>' + game.log.slice(-9).reverse().map(text => '<li>' + esc(text) + '</li>').join('') +
      '</ol></section><button class="yn-rule-link" data-action="rules">第一次玩？查看图解与规则 ↗</button></aside></main></div>';
    if (hover !== null) previewMove(hover);
  }
  function render() { if (screen === 'game' && game) renderGame(); else renderSetup(); }
  function previewMove(to) {
    if (!game || selected === null || game.phase !== 'move') return;
    const move = E.ringMoves(game, selected).find(a => a.to === to), path = root.querySelector('[data-yn-path]');
    root.querySelectorAll('.will-flip').forEach(n => n.classList.remove('will-flip'));
    if (!path) return;
    if (!move || !hints) { path.innerHTML = ''; return; }
    const from = E.POINTS[selected], p = E.POINTS[to];
    path.innerHTML = '<line x1="' + from.x + '" y1="' + from.y + '" x2="' + p.x + '" y2="' + p.y + '"/>';
    move.flipped.forEach(i => root.querySelector('[data-yn-point="' + i + '"]')?.classList.add('will-flip'));
    root.querySelector('.yn-preview-text').textContent = '移向 ' + label(to) + ' · 将翻转 ' + move.flipped.length + ' 枚棋子';
  }
  function scheduleAI() {
    clearTimeout(timer);
    if (Room.active || screen !== 'game' || !isAI() || rulesOpen || aiFailed) return;
    timer = setTimeout(() => {
      try { const action = E.chooseAI(game); if (!action) throw Error('没有可执行的行动'); commit(action); }
      catch (e) { aiFailed = true; error = '电脑行动中断：' + e.message; render(); }
    }, Math.max(Motion.aiDelay(), 450));
  }
  function commit(action) {
    if (Room.active) { selected = null; selectedRow = 0; hover = null; E.play(game, action); return; }
    E.play(game, action); selected = null; selectedRow = 0; hover = null; error = ''; save(); render(); scheduleAI();
  }
  function resume() {
    if (!saved) return;
    game = structuredClone(saved); mode = game.mode; human = game.human; target = game.target;
    screen = 'game'; selected = null; selectedRow = 0; hover = null; error = ''; aiFailed = false; render(); scheduleAI();
  }
  function showRules() {
    clearTimeout(timer); rulesOpen = true;
    overlay.innerHTML = '<div class="yn-modal-backdrop"><section class="yn-modal" role="dialog" aria-modal="true" aria-labelledby="yn-rule-title"><header><div><span class="yn-eyebrow">HOW TO PLAY</span><h2 id="yn-rule-title">圈套棋玩法</h2></div><button data-action="close-rules" aria-label="关闭玩法说明">关闭 ×</button></header>' +
      '<p>白方先行，每人五个环，共用 51 枚双面棋子。标准对局先收回三个环获胜；快速对局只需收回一个环。</p><div class="yn-rule-step"><b>01</b><div><h3>交替放置五个环</h3><p>空心的是环，实心的是棋子。开局在任意空交点放环，双方各放五个后，白方先开始移动。</p></div></div>' +
      '<div class="yn-rule-step"><b>02</b><div><h3>移环，留下棋子</h3><p>选择自己的环，再选同一直线上的空交点。原位留下自己颜色的棋子。环可以穿过空位，不能越过任何环。</p><div class="yn-rule-diagram"><i class="yn-small-marker"></i><span>─</span><i class="yn-small-marker black"></i><i class="yn-small-marker"></i><span>→</span><i class="yn-small-ring white"></i></div></div></div>' +
      '<div class="yn-rule-step"><b>03</b><div><h3>跳过一串棋子，全部翻面</h3><p>可先经过空位，再跳过一串连续棋子；跳过后必须落在紧接的第一个空位。途中双方棋子全部翻色，原位新留下的棋子不翻。</p></div></div>' +
      '<div class="yn-rule-step"><b>04</b><div><h3>五子成行，收排再收环</h3><p>五枚同色实心棋子连续成直线后，选择并收回这五枚，放回公共供应，再任意收回自己的一个环。六连或七连可选其中连续五枚；交叉排与剩余排每次重新判断。环不算成排棋子。</p></div></div>' +
      '<p>若双方同时成排，先处理刚刚移环的一方。收回第三个环立即获胜；公共棋子用尽时，先完成翻面和全部收排，再按收回环数比较，多者胜、相同和棋。</p>' +
      '<details><summary>提示、悔棋与少见情况</summary><p>落点提示只帮助选点，不影响规则。电脑对局悔棋会撤回最近一次自己的操作及随后的电脑回应；同屏模式撤回一次操作。联机悔棋需对方同意。</p><p>无合法移动时只能停一步。实体规则书未说明双方同时无法移动的结局，本网页对此采用和棋约定。</p></details>' +
      '<a class="yn-rule-source" href="https://www.gipf.com/yinsh/rules/rules.html" target="_blank" rel="noopener">GIPF 官方规则 ↗</a><button class="yn-primary" data-action="close-rules">回到棋盘 →</button></section></div>';
    overlay.querySelector('[data-action="close-rules"]').focus();
  }
  function closeRules() { rulesOpen = false; overlay.innerHTML = ''; root.querySelector('[data-action="rules"]')?.focus(); scheduleAI(); }
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.mode) { mode = button.dataset.mode; render(); return; }
    if (button.dataset.human) { human = Number(button.dataset.human); render(); return; }
    if (button.dataset.target) { target = Number(button.dataset.target); render(); return; }
    const action = button.dataset.action;
    if (action === 'rules') { showRules(); return; }
    if (action === 'start') { clearTimeout(timer); game = E.newGame(mode, human, target); screen = 'game'; selected = null; selectedRow = 0; hover = null; error = ''; aiFailed = false; save(); render(); scheduleAI(); return; }
    if (action === 'continue') { resume(); return; }
    if (action === 'new') { clearTimeout(timer); Motion.cancel(); screen = 'setup'; selected = null; hover = null; error = ''; render(); return; }
    if (action === 'hints') { hints = !hints; try { localStorage.setItem('boardgame-box-yinsh-hints', hints ? 'on' : 'off'); } catch {} render(); return; }
    if (action === 'undo') { clearTimeout(timer); selected = null; hover = null; error = ''; if (E.undo(game)) { save(); render(); scheduleAI(); } return; }
    if (action === 'cancel') { selected = null; hover = null; error = ''; render(); return; }
    if (action === 'show-rows') { root.querySelector('.yn-action-panel')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (action === 'retry-ai') { aiFailed = false; error = ''; render(); scheduleAI(); return; }
    if (!canAct()) { error = Room.active ? Room.reason : game.winner ? '本局已经结束，可以查看棋盘或新开一局。' : '请等待电脑完成行动。'; render(); return; }
    if (button.dataset.rowIndex !== undefined) { selectedRow = Number(button.dataset.rowIndex); error = ''; render(); root.querySelector('[data-row-index="' + selectedRow + '"]')?.focus({ preventScroll: true }); return; }
    try {
      if (action === 'take-row') { commit({ type: 'row', cells: E.rows(game)[selectedRow] }); return; }
      if (action === 'pass') { commit({ type: 'pass' }); return; }
      if (button.dataset.ynPoint === undefined) return;
      const i = Number(button.dataset.ynPoint);
      if (game.phase === 'place') commit({ type: 'place', to: i });
      else if (game.phase === 'ring') commit({ type: 'remove', at: i });
      else if (game.phase === 'row') { error = '在收排面板中选一排，再点击“收回这 5 枚棋子”。'; render(); }
      else if (game.board[i] === game.turn + 2) { selected = selected === i ? null : i; hover = null; error = ''; render(); if (selected !== null) root.querySelector('[data-yn-point="' + i + '"]')?.focus({ preventScroll: true }); }
      else if (selected !== null) commit({ type: 'move', from: selected, to: i });
      else { error = '先选择一个自己的空心环，再选落点。'; render(); }
    } catch (e) { error = e.message; render(); }
  });
  root.addEventListener('pointerover', event => { const node = event.target.closest('[data-yn-point]'); if (node) { hover = Number(node.dataset.ynPoint); previewMove(hover); } });
  root.addEventListener('focusin', event => { const node = event.target.closest('[data-yn-point]'); if (node) previewMove(Number(node.dataset.ynPoint)); });
  overlay.addEventListener('click', event => { if (event.target.closest('[data-action="close-rules"]') || event.target.classList.contains('yn-modal-backdrop')) closeRules(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { if (rulesOpen) closeRules(); else if (selected !== null) { selected = null; hover = null; render(); } }
    if (rulesOpen && event.key === 'Tab') {
      const nodes = [...overlay.querySelectorAll('button,a,summary')].filter(n => n.getClientRects().length), first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  if (Room.active) Room.connect({ game: 'yinsh', root: 'yinsh', getState: () => game, setState: value => { game = value; screen = 'game'; selected = null; selectedRow = 0; hover = null; }, render });
  else {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (E.validSave(s)) saved = s; } catch {}
    if (new URLSearchParams(location.search).get('continue') === '1' && saved) resume(); else render();
  }
})();
