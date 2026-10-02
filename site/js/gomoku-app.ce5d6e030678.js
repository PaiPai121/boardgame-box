(function () {
  'use strict';
  const BoardMotion = window.BoardMotion || { watch() {}, aiDelay: () => 360, cancel() {} };
  const Room = window.BoardRoom || { active: false, wrap: e => e };
  let E = window.GomokuEngine;
  const root = document.getElementById('gomoku');
  const SAVE_KEY = 'boardgame-box-gomoku-v1';
  let game = null;
  let saved = null;
  let screen = 'setup';
  let selectedMode = 'ai';
  let aiTimer = null;
  E = BoardMotion.watch({ game: 'gomoku', engine: E, state: () => game, methods: ['play', 'undo'] }) || E;
  E = Room.wrap(E, 'gomoku');
  function readSave() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (E.validSave(parsed)) saved = parsed;
    } catch { saved = null; }
  }
  function save() {
    if (Room.active) return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(game));
    localStorage.setItem('boardgame-box-last-played', 'gomoku');
    saved = JSON.parse(JSON.stringify(game));
  }
  function lastMove() { return game.history.at(-1)?.index ?? -1; }
  function playerName(player) {
    if (Room.active) return String(Room.snapshot?.seats[player - 1]?.name || '玩家').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) + (player === 1 ? ' · 黑棋' : ' · 白棋');
    if (player === 1) return game.mode === 'ai' ? '你 · 黑棋' : '黑棋';
    return game.mode === 'ai' ? '电脑 · 白棋' : '白棋';
  }
  function winningCells() {
    if (game.winner !== 1 && game.winner !== 2) return [];
    const last = lastMove(), row = Math.floor(last / 15), col = last % 15;
    for (const [dr, dc] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const line = [last];
      for (const sign of [-1, 1]) {
        let r = row + dr * sign, c = col + dc * sign;
        while (r >= 0 && r < 15 && c >= 0 && c < 15 && game.board[r * 15 + c] === game.winner) {
          line.push(r * 15 + c); r += dr * sign; c += dc * sign;
        }
      }
      if (line.length >= 5) return line;
    }
    return [];
  }
  function renderSetup() {
    root.innerHTML = '<div class="gk-app"><header class="gk-topbar"><a class="gk-brand" href="index.html">' +
      '<span class="gk-brand-mark"><i></i><i></i><i></i><i></i></span><span><strong>桌游盒子</strong><small>BOARD GAME LOUNGE</small></span></a>' +
      '<a class="gk-back" href="index.html">← 返回游戏库</a></header>' +
      '<main class="gk-setup"><div class="gk-setup-art"><div class="gk-art-board"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
      '<span class="gk-art-caption">FIVE IN A ROW</span></div>' +
      '<div class="gk-setup-copy"><span class="gk-kicker">CLASSIC STRATEGY · 02</span><h1>五子棋</h1>' +
      '<p>方寸棋盘，一步攻守。黑白轮流落子，率先连成五子就能获胜。</p>' +
      '<div class="gk-mode-label">选择对局方式</div><div class="gk-mode-options">' +
      '<button data-mode="ai" aria-pressed="' + (selectedMode === 'ai') + '" class="gk-mode' + (selectedMode === 'ai' ? ' active' : '') + '"><span>♟</span><strong>挑战电脑</strong><small>你执黑棋 · 简单难度</small></button>' +
      '<button data-mode="local" aria-pressed="' + (selectedMode === 'local') + '" class="gk-mode' + (selectedMode === 'local' ? ' active' : '') + '"><span>♟♟</span><strong>双人同屏</strong><small>和朋友轮流落子</small></button></div>' +
      '<div class="gk-setup-actions"><button class="gk-primary" data-action="start">开始对局 <span>→</span></button>' +
      (saved ? '<button class="gk-secondary" data-action="continue">继续上次对局</button>' : '') +
      '</div><div class="gk-setup-note">15 × 15 棋盘 · 无禁手规则 · 本机自动保存</div></div></main></div>';
  }
  function renderGame() {
    const line = new Set(winningCells());
    const status = game.winner === 3 ? '和棋' : game.winner ? playerName(game.winner) + '获胜！' :
      (game.mode === 'ai' && game.turn === 2 ? '电脑正在思考…' : '轮到' + playerName(game.turn) + '落子');
    const canPlay = !game.winner && !(game.mode === 'ai' && game.turn === 2) && (!Room.active || Room.canAct);
    const cells = game.board.map((cell, index) => {
      const row = Math.floor(index / 15) + 1, col = index % 15 + 1;
      const star = [48, 56, 112, 168, 176].includes(index) ? '<span class="gk-star"></span>' : '';
      return '<button class="gk-cell' + (index === lastMove() ? ' last' : '') + (line.has(index) ? ' winning' : '') +
        '" data-cell="' + index + '" aria-label="第 ' + row + ' 行第 ' + col + ' 列' +
        (cell ? (cell === 1 ? '，黑棋' : '，白棋') : '，空位') + '"' + (cell || !canPlay ? ' disabled' : '') + '>' +
        star + (cell ? '<span class="gk-stone ' + (cell === 1 ? 'black' : 'white') + '"></span>' : '') + '</button>';
    }).join('');
    root.innerHTML = '<div class="gk-app"><header class="gk-topbar"><a class="gk-brand" href="index.html">' +
      '<span class="gk-brand-mark"><i></i><i></i><i></i><i></i></span><span><strong>桌游盒子</strong><small>BOARD GAME LOUNGE</small></span></a>' +
      '<div class="gk-top-actions"><span class="gk-top-label">五子棋 <b>/</b> ' + (Room.active ? '房间联机' : game.mode === 'ai' ? '挑战电脑' : '双人同屏') + '</span>' +
      '<a class="gk-back" href="index.html">返回游戏库 ↗</a></div></header>' +
      '<main class="gk-game"><aside class="gk-game-side"><div class="gk-kicker">GOMOKU · CLASSIC</div><h1>五子棋</h1>' +
      '<p class="gk-intro">在棋盘的交点落子，横、竖或斜向连成五子即获胜。</p>' +
      '<div class="gk-status' + (game.winner ? ' ended' : '') + '" role="status"><small>当前局面</small><strong>' + status + '</strong>' +
      '<span>已落 ' + game.history.length + ' 手</span></div>' +
      '<div class="gk-player-list"><div class="gk-player' + (!game.winner && game.turn === 1 ? ' active' : '') + '">' +
      '<span class="gk-avatar black"></span><div><strong>' + playerName(1) + '</strong><small>先手</small></div>' +
      (!game.winner && game.turn === 1 ? '<b>行动中</b>' : '') + '</div>' +
      '<div class="gk-player' + (!game.winner && game.turn === 2 ? ' active' : '') + '"><span class="gk-avatar white"></span>' +
      '<div><strong>' + playerName(2) + '</strong><small>后手</small></div>' +
      (!game.winner && game.turn === 2 ? '<b>行动中</b>' : '') + '</div></div>' +
      '<div class="gk-controls"><button class="gk-primary" data-action="new">新开一局 <span>↗</span></button>' +
      '<button class="gk-secondary" data-action="undo"' + (!game.history.length ? ' disabled' : '') + '>悔棋</button></div>' +
      '<div class="gk-rule-note"><strong>玩法提示</strong><p>点击空交点落子。单人模式中，电脑会寻找成五机会并阻挡你的直接胜利。</p>' +
      '<p>' + (Room.active ? '申请悔棋后，需对方同意才能撤回刚走的一步。对局自动保存在房间里。' : '悔棋会撤销最近一回合；双人模式撤销一步。') + '</p></div></aside>' +
      '<section class="gk-board-area"><div class="gk-board-frame"><div class="gk-board" role="grid" aria-label="15乘15五子棋棋盘">' +
      cells + '</div></div><div class="gk-board-bottom"><span><i class="gk-legend-stone black"></i> 黑棋先行</span>' +
      '<span><i class="gk-legend-stone white"></i> 先连五子获胜</span></div></section></main></div>';
  }
  function render() { if (screen === 'game') renderGame(); else renderSetup(); }
  function scheduleAI() {
    if (Room.active) return;
    clearTimeout(aiTimer);
    if (screen !== 'game' || game.mode !== 'ai' || game.turn !== 2 || game.winner) return;
    aiTimer = setTimeout(() => {
      try {
        const index = E.chooseAI(game);
        if (index !== null) {
          E.play(game, index);
          save();
          render();
        }
      } catch (error) { console.error('电脑落子失败：', error); }
    }, BoardMotion.aiDelay());
  }
  function start() {
    clearTimeout(aiTimer);
    game = E.newGame(selectedMode);
    screen = 'game';
    save();
    render();
  }
  function resume() {
    if (!saved) return;
    game = JSON.parse(JSON.stringify(saved));
    screen = 'game';
    render();
    scheduleAI();
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.mode) { selectedMode = button.dataset.mode; render(); return; }
    if (button.dataset.action === 'start') { start(); return; }
    if (button.dataset.action === 'continue') { resume(); return; }
    if (button.dataset.action === 'new') {
      clearTimeout(aiTimer); selectedMode = game.mode; screen = 'setup'; render(); return;
    }
    if (button.dataset.action === 'undo') {
      clearTimeout(aiTimer);
      if (E.undo(game)) { save(); render(); scheduleAI(); }
      return;
    }
    if (button.dataset.cell !== undefined && screen === 'game') {
      if (game.mode === 'ai' && game.turn === 2) return;
      try {
        E.play(game, Number(button.dataset.cell));
        save();
        render();
        scheduleAI();
      } catch (error) { console.error('落子失败：', error); }
    }
  });
  if (Room.active) Room.connect({ game: 'gomoku', root: 'gomoku', getState: () => game, setState: value => { game = value; screen = 'game'; selectedMode = 'local'; }, render });
  else { readSave(); if (new URLSearchParams(location.search).get('continue') === '1' && saved) resume(); else render(); }
})();
