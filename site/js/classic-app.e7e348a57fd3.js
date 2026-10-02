(function () {
  'use strict';
  const BoardMotion = window.BoardMotion || { watch() {}, aiDelay: () => 360, cancel() {} };
  const Room = window.BoardRoom || { active: false, wrap: e => e };
  let E = window.ClassicEngine;
  const root = document.getElementById('classic');
  const kind = document.body.dataset.game;
  const settings = {
    go: { name: '围棋', english: 'GO', subtitle: '围地、提子，双方连续停一手后数子。', sides: ['黑棋', '白棋'], note: '中国数子法 · 白棋贴 7.5 目 · 禁止自杀与重复局面' },
    xiangqi: { name: '象棋', english: 'XIANGQI', subtitle: '车马炮士象将卒，楚河汉界间见招拆招。', sides: ['红方', '黑方'], note: '红先黑后 · 将帅不可照面 · 无子可走判负' },
    chess: { name: '国际象棋', english: 'CHESS', subtitle: '从开局到将死，走好每一步。', sides: ['白方', '黑方'], note: '含王车易位、吃过路兵、升变与常见和棋判定' }
  };
  const cfg = settings[kind];
  if (!cfg) throw Error('未知棋类');
  const KEY = 'boardgame-box-' + kind + '-v1';
  let game = null, saved = null, mode = 'ai', size = 9, screen = 'setup', selected = -1;
  let promotion = null, aiTimer = null, message = '';
  E = BoardMotion.watch({ game: kind, engine: E, state: () => game, methods: ['playGo', 'playXiangqi', 'playChess', 'undo', 'passGo', 'finishGo', 'markGoDead'] }) || E;
  E = Room.wrap(E, kind);
  const sideName = side => cfg.sides[side - 1] + (Room.active ? ' · ' + String(Room.snapshot?.seats[side - 1]?.name || '玩家').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) : '');
  const pieceNames = { R: '车', H: '马', E: '相', A: '仕', K: '帅', C: '炮', P: '兵',
    r: '車', h: '馬', e: '象', a: '士', k: '将', c: '砲', p: '卒' };
  const chessGlyphs = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟',
    k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

  function readSave() {
    try { const value = JSON.parse(localStorage.getItem(KEY)); if (E.validSave(value) && value.kind === kind) saved = value; }
    catch { saved = null; }
  }
  function save() {
    if (Room.active) return;
    localStorage.setItem(KEY, JSON.stringify(game));
    localStorage.setItem('boardgame-box-last-played', kind);
    saved = JSON.parse(JSON.stringify(game));
  }
  function shell(inner) {
    root.innerHTML = '<div class="cb-app"><header class="cb-topbar"><a class="cb-brand" href="index.html"><span class="cb-mark">✦</span><span>桌游盒子<small>BOARD GAME LOUNGE</small></span></a><a class="cb-back" href="index.html">← 返回游戏库</a></header>' + inner + '</div>';
  }
  function renderSetup() {
    const illustration = kind === 'chess' ? '♞' : kind === 'xiangqi' ? '帥' : '●';
    shell('<main class="cb-setup"><div class="cb-setup-art ' + kind + '"><div class="cb-art-ring"></div><span>' + illustration + '</span><small>' + cfg.english + '</small></div>' +
      '<section class="cb-setup-copy"><div class="cb-kicker">CLASSIC BOARD GAMES</div><h1>' + cfg.name + '</h1><p>' + cfg.subtitle + '</p>' +
      '<h2>选择对局方式</h2><div class="cb-mode-row"><button class="cb-mode ' + (mode === 'ai' ? 'active' : '') + '" data-mode="ai" aria-pressed="' + (mode === 'ai') + '"><b>挑战电脑</b><small>你先手 · 简单难度</small></button>' +
      '<button class="cb-mode ' + (mode === 'local' ? 'active' : '') + '" data-mode="local" aria-pressed="' + (mode === 'local') + '"><b>双人同屏</b><small>轮流走棋</small></button></div>' +
      (kind === 'go' ? '<h2>棋盘大小</h2><div class="cb-size-row">' + [9, 13, 19].map(n => '<button data-size="' + n + '" class="' + (size === n ? 'active' : '') + '">' + n + ' × ' + n + '</button>').join('') + '</div>' : '') +
      '<div class="cb-actions"><button class="cb-primary" data-action="start">开始对局 →</button>' + (saved ? '<button class="cb-secondary" data-action="continue">继续上次对局</button>' : '') + '</div>' +
      '<div class="cb-note">' + cfg.note + '<br>对局自动保存在当前设备</div></section></main>');
  }
  function statusText() {
    if (game.phase === 'scoring') return '双方已停一手 · 点击死棋后确认数子';
    if (game.winner) return game.winner === 3 ? '和棋 · ' + game.reason : sideName(game.winner) + '获胜 · ' + game.reason;
    if (game.mode === 'ai' && game.turn === 2) return '电脑正在思考…';
    return '轮到' + sideName(game.turn) + (kind === 'go' ? '落子' : '走棋') +
      ((kind === 'chess' && E.chessInCheck(game, game.turn)) || (kind === 'xiangqi' && E.xqInCheck(game, game.turn)) ? ' · 被将军' : '');
  }
  function boardCells() {
    const legal = kind === 'go' ? [] : E.moves(game);
    const targets = new Set(legal.filter(move => move.from === selected).map(move => move.to));
    const aiTurn = game.mode === 'ai' && game.turn === 2 || Room.active && !Room.canAct;
    return game.board.map((piece, index) => {
      const row = Math.floor(index / game.size) + 1, col = index % game.size + 1;
      let label = '第 ' + row + ' 行第 ' + col + ' 列';
      if (kind === 'go') {
        label += piece ? '，' + sideName(piece) : '，空位';
        const dead = game.dead.includes(index);
        return '<button class="cb-cell cb-go-cell' + (index === game.last ? ' last' : '') + (dead ? ' dead' : '') +
          '" data-cell="' + index + '" aria-label="' + label + '" title="' + label + '"' +
          ((game.phase === 'play' && (piece || aiTurn)) || game.phase === 'ended' || (game.phase === 'scoring' && (!piece || aiTurn)) ? ' disabled' : '') + '>' +
          (piece ? '<span class="cb-stone ' + (piece === 1 ? 'black' : 'white') + '"></span>' : '') +
          (game.size === 9 && [20, 24, 40, 56, 60].includes(index) && !piece ? '<i class="cb-star"></i>' : '') + '</button>';
      }
      label += piece ? '，' + (kind === 'chess' ? (piece === piece.toUpperCase() ? '白方' : '黑方') + '棋子' : pieceNames[piece]) : '，空位';
      const glyph = kind === 'chess' ? chessGlyphs[piece] : pieceNames[piece];
      const color = piece && piece === piece.toUpperCase() ? 'light' : 'dark';
      return '<button class="cb-cell cb-piece-cell ' + (kind === 'chess' ? 'chess-square ' + ((Math.floor(index / 8) + index % 8) % 2 ? 'tint' : 'plain') : 'xq-square') +
        (selected === index ? ' selected' : '') + (targets.has(index) ? ' target' : '') + (game.last === index ? ' last' : '') +
        '" data-cell="' + index + '" aria-label="' + label + '" title="' + label + '"' + (game.winner || aiTurn ? ' disabled' : '') + '>' +
        (piece ? '<span class="cb-piece ' + color + '">' + glyph + '</span>' : '') + '</button>';
    }).join('');
  }
  function renderGame() {
    const turns = game.history.length;
    const sizeClass = kind === 'go' ? 'go-size-' + game.size : kind;
    const score = game.phase === 'scoring' || game.phase === 'ended' ? E.goScore(game) : null;
    shell('<main class="cb-game"><aside class="cb-side"><div class="cb-kicker">' + cfg.english + ' · CLASSIC</div><h1>' + cfg.name + '</h1><p>' + cfg.subtitle + '</p>' +
      '<div class="cb-status" role="status"><small>当前局面</small><strong>' + statusText() + '</strong><span>已走 ' + turns + ' 手</span></div>' +
      '<div class="cb-players">' + [1, 2].map(side => '<div class="cb-player ' + (!game.winner && game.turn === side ? 'active' : '') + '"><i class="' + (side === 1 ? 'first' : 'second') + '"></i><div><strong>' + sideName(side) + '</strong><small>' + (side === 1 ? '先手' : game.mode === 'ai' ? '电脑 · 简单' : '后手') + '</small></div></div>').join('') + '</div>' +
      (kind === 'go' ? '<div class="cb-capture">提子：黑 ' + game.captures[0] + ' · 白 ' + game.captures[1] + '</div>' : '') +
      (score ? '<div class="cb-score"><strong>当前数子</strong><span>黑 ' + score.black + ' · 白 ' + score.white + '（贴 ' + score.komi + '）</span></div>' : '') +
      '<div class="cb-controls"><button class="cb-primary" data-action="new">新开一局</button><button class="cb-secondary" data-action="undo"' + (!turns ? ' disabled' : '') + '>悔棋</button>' +
      (kind === 'go' && game.phase === 'play' ? '<button class="cb-secondary" data-action="pass">停一手</button>' : '') +
      (kind === 'go' && game.phase === 'scoring' ? '<button class="cb-primary" data-action="finish">确认数子</button>' : '') + '</div>' +
      '<div class="cb-help"><b>玩法提示</b><p>' + (kind === 'go' ? '点击交点落子。双方连续停一手后，点击双方认可的死棋整组标记，再确认数子。' : '先点自己的棋子，再点高亮的可走位置。') + '</p><p>' + cfg.note + '</p></div></aside>' +
      '<section class="cb-board-area"><div class="cb-board-scroll"><div class="cb-board-frame"><div class="cb-board ' + sizeClass + '" role="grid" aria-label="' + cfg.name + '棋盘" style="--cols:' + game.size + '">' +
      boardCells() + (kind === 'xiangqi' ? '<svg class="cb-xq-lines" viewBox="0 0 900 1000" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="450" width="900" height="100" fill="#d3a66f"/><path d="M350 50 L550 250 M550 50 L350 250 M350 750 L550 950 M550 750 L350 950" fill="none" stroke="#704724" stroke-width="2"/><text x="250" y="515" text-anchor="middle">楚 河</text><text x="650" y="515" text-anchor="middle">汉 界</text></svg>' : '') + '</div></div></div>' +
      (message ? '<div class="cb-message" role="alert">' + message + '</div>' : '') + '<div class="cb-board-foot">' + (kind === 'go' ? '黑棋先行 · 白棋贴目 ' + game.komi + (game.size > 9 ? ' · 小屏可左右滑动棋盘' : '') : sideName(1) + '先行') + (Room.active ? ' · 房间自动保存' : ' · 本地自动保存') + '</div></section></main>' +
      (promotion ? '<div class="cb-overlay"><div class="cb-dialog"><h2>兵升变</h2><p>选择升变棋子</p><div class="cb-promotion">' + ['Q', 'R', 'B', 'N'].map(piece => '<button data-promotion="' + piece + '">' + chessGlyphs[piece] + '</button>').join('') + '</div><button class="cb-secondary" data-action="cancel-promotion">取消</button></div></div>' : ''));
  }
  function render() { if (screen === 'game') renderGame(); else renderSetup(); }
  function scheduleAI() {
    if (Room.active) return;
    clearTimeout(aiTimer);
    if (screen !== 'game' || !game || game.mode !== 'ai' || game.turn !== 2 || game.winner || game.phase !== 'play') return;
    aiTimer = setTimeout(() => {
      try {
        const move = E.chooseAI(game);
        if (!move || move.pass) E.passGo(game);
        else if (kind === 'go') E.playGo(game, move.to);
        else if (kind === 'chess') E.playChess(game, move.from, move.to, move.promotion);
        else E.playXiangqi(game, move.from, move.to);
        save(); render();
      } catch (error) { message = '电脑落子失败：' + error.message; render(); console.error(error); }
    }, BoardMotion.aiDelay());
  }
  function start() { clearTimeout(aiTimer); game = E.newGame(kind, mode, size); selected = -1; message = ''; screen = 'game'; save(); render(); }
  function resume() { if (!saved) return; game = JSON.parse(JSON.stringify(saved)); mode = game.mode; size = game.size; selected = -1; message = ''; screen = 'game'; render(); scheduleAI(); }
  function commitMove(to, promotionChoice) {
    if (kind === 'chess') E.playChess(game, selected, to, promotionChoice);
    else E.playXiangqi(game, selected, to);
    selected = -1; promotion = null; message = ''; save(); render(); scheduleAI();
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    try {
      if (button.dataset.mode) { mode = button.dataset.mode; render(); return; }
      if (button.dataset.size) { size = Number(button.dataset.size); render(); return; }
      if (button.dataset.action === 'start') { start(); return; }
      if (button.dataset.action === 'continue') { resume(); return; }
      if (button.dataset.action === 'new') { clearTimeout(aiTimer); mode = game.mode; size = game.size; screen = 'setup'; render(); return; }
      if (button.dataset.action === 'undo') {
        clearTimeout(aiTimer); const times = game.mode === 'ai' && game.turn === 1 && game.history.length > 1 ? 2 : 1;
        for (let i = 0; i < times; i++) E.undo(game);
        selected = -1; promotion = null; message = ''; save(); render(); scheduleAI(); return;
      }
      if (button.dataset.action === 'pass') { E.passGo(game); message = ''; save(); render(); scheduleAI(); return; }
      if (button.dataset.action === 'finish') { E.finishGo(game); message = ''; save(); render(); return; }
      if (button.dataset.action === 'cancel-promotion') { promotion = null; render(); return; }
      if (button.dataset.promotion && promotion) {
        commitMove(promotion.to, game.turn === 1 ? button.dataset.promotion : button.dataset.promotion.toLowerCase()); return;
      }
      if (button.dataset.cell === undefined || screen !== 'game' || game.winner || (game.mode === 'ai' && game.turn === 2)) return;
      const to = Number(button.dataset.cell);
      if (kind === 'go') {
        if (game.phase === 'scoring') E.markGoDead(game, to);
        else E.playGo(game, to);
        message = ''; save(); render(); scheduleAI(); return;
      }
      const piece = game.board[to], own = piece && (piece === piece.toUpperCase() ? 1 : 2) === game.turn;
      if (selected < 0 || own) { selected = own ? to : -1; message = own ? '' : '请先选择自己的棋子'; render(); return; }
      const legal = E.moves(game).filter(move => move.from === selected && move.to === to);
      if (!legal.length) { message = '这里不能走，请选择高亮位置'; render(); return; }
      if (kind === 'chess' && legal.some(move => move.promotion)) { promotion = { to }; render(); return; }
      commitMove(to);
    } catch (error) { message = error.message; render(); }
  });
  if (Room.active) Room.connect({ game: kind, root: 'classic', getState: () => game, setState: value => {
    game = value; screen = 'game'; mode = 'local'; size = value.size; selected = -1; promotion = null; message = '';
  }, render });
  else { readSave(); if (new URLSearchParams(location.search).get('continue') === '1' && saved) resume(); else render(); }
})();
