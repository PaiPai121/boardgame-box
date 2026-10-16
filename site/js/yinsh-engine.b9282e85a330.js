(function (root) {
  'use strict';
  const DIRECTIONS = [[1, 0], [0, 1], [1, -1], [-1, 0], [0, -1], [-1, 1]];
  const POINTS = [];
  for (let q = -5; q <= 5; q++) for (let r = -5; r <= 5; r++) {
    if (Math.abs(q + r) > 5 || [q, r, q + r].filter(n => Math.abs(n) === 5).length > 1) continue;
    POINTS.push(Object.freeze({ q, r, label: String.fromCharCode(70 + q) + (r + q + 6),
      x: 330 + Math.sqrt(3) * 27 * q, y: 330 + 54 * (r + q / 2) }));
  }
  const AT = new Map(POINTS.map((p, i) => [p.q + ',' + p.r, i]));
  const at = (q, r) => AT.get(q + ',' + r);
  const STEP = POINTS.map(p => DIRECTIONS.map(([dq, dr]) => at(p.q + dq, p.r + dr)));
  const LINES = [];
  POINTS.forEach((p, i) => DIRECTIONS.slice(0, 3).forEach(([dq, dr]) => {
    const cells = Array.from({ length: 5 }, (_, k) => at(p.q + dq * k, p.r + dr * k));
    if (cells.every(Number.isInteger)) LINES.push(Object.freeze(cells));
  }));
  Object.freeze(POINTS); Object.freeze(LINES);
  const COLORS = ['白方', '黑方'];
  const POSITION_KEYS = ['version', 'kind', 'mode', 'human', 'target', 'board', 'placed', 'scores', 'pool',
    'turn', 'phase', 'mover', 'moveNumber', 'winner', 'reason', 'last', 'removedRow', 'log'];
  function insist(ok, text) { if (!ok) throw Error(text); }
  function snapshot(s) { return structuredClone(Object.fromEntries(POSITION_KEYS.map(k => [k, s[k]]))); }
  function newGame(mode = 'ai', human = 1, target = 3) {
    insist(['ai', 'local'].includes(mode) && [1, 2].includes(human) && [1, 3].includes(target), '对局设置不正确');
    return { version: 1, kind: 'yinsh', mode, human, target, board: Array(85).fill(0), placed: [0, 0],
      scores: [0, 0], pool: 51, turn: 1, phase: 'place', mover: 1, moveNumber: 0, winner: 0,
      reason: '', last: null, removedRow: null, log: ['白方先放环，双方各放置五个环。'], history: [] };
  }
  function rows(s, color = s.turn) { return LINES.filter(cells => cells.every(i => s.board[i] === color)).map(cells => [...cells]); }
  function ringMoves(s, from) {
    if (!Number.isInteger(from) || from < 0 || from >= POINTS.length || ![3, 4].includes(s.board[from])) return [];
    const moves = [];
    for (let direction = 0; direction < 6; direction++) {
      let current = STEP[from][direction]; const flipped = [];
      while (current !== undefined) {
        const piece = s.board[current];
        if (piece >= 3) break;
        if (piece) flipped.push(current);
        else {
          moves.push({ type: 'move', from, to: current, flipped: [...flipped] });
          if (flipped.length) break;
        }
        current = STEP[current][direction];
      }
    }
    return moves;
  }
  function movesFor(s, color = s.turn) {
    return s.board.flatMap((piece, i) => piece === color + 2 ? ringMoves(s, i) : []);
  }
  function actions(s) {
    if (s.winner || s.phase === 'gameover') return [];
    if (s.phase === 'place') return s.board.flatMap((piece, to) => piece ? [] : [{ type: 'place', to }]);
    if (s.phase === 'row') return rows(s).map(cells => ({ type: 'row', cells }));
    if (s.phase === 'ring') return s.board.flatMap((piece, at) => piece === s.turn + 2 ? [{ type: 'remove', at }] : []);
    const moves = movesFor(s);
    return moves.length ? moves : [{ type: 'pass' }];
  }
  function finish(s, winner, reason) { s.phase = 'gameover'; s.winner = winner; s.reason = reason; }
  function resolve(s) {
    // Resolve every mover row first, then every opponent row. Recompute after
    // each removal: intersecting rows and long runs must never score twice.
    for (const color of [s.mover, 3 - s.mover]) if (rows(s, color).length) {
      s.turn = color; s.phase = 'row'; return;
    }
    s.turn = 3 - s.mover; s.phase = 'move'; s.removedRow = null;
    if (!s.pool) finish(s, s.scores[0] === s.scores[1] ? 3 : s.scores[0] > s.scores[1] ? 1 : 2, 'pool');
  }
  function applyMove(board, color, action) {
    board[action.from] = color; board[action.to] = color + 2;
    for (const i of action.flipped) board[i] = 3 - board[i];
  }
  function play(s, proposed) {
    insist(s && !s.winner && proposed && typeof proposed === 'object' && !Array.isArray(proposed), '本局已结束或行动不正确');
    const choices = actions(s);
    const key = cells => Array.isArray(cells) && cells.length === 5 && cells.every(Number.isInteger) ? [...cells].sort((a, b) => a - b).join(',') : '';
    const action = choices.find(a => a.type === proposed.type && (a.type === 'move' ? a.from === proposed.from && a.to === proposed.to :
      a.type === 'place' ? a.to === proposed.to : a.type === 'remove' ? a.at === proposed.at : a.type === 'row' ? key(a.cells) === key(proposed.cells) : true));
    insist(action, s.phase === 'row' ? '请选择高亮的连续五枚同色棋子' : s.phase === 'ring' ? '必须收回自己的一个环' :
      '此处不能行棋：环不能越过环，跳过棋子后须停在紧接的第一个空位');
    s.history.push(snapshot(s));
    const color = s.turn, who = COLORS[color - 1];
    s.last = { ...structuredClone(action), player: color };
    if (action.type === 'place') {
      s.board[action.to] = color + 2; s.placed[color - 1]++; s.turn = 3 - color;
      s.log.push(who + '在 ' + POINTS[action.to].label + ' 放置一个环。');
      if (s.placed[0] + s.placed[1] === 10) { s.phase = 'move'; s.turn = 1; s.log.push('放环完成，白方先移动。'); }
    } else if (action.type === 'move') {
      insist(s.pool > 0, '公共棋子已用完');
      applyMove(s.board, color, action); s.pool--; s.mover = color; s.moveNumber++; s.removedRow = null;
      s.log.push(who + ' ' + POINTS[action.from].label + ' → ' + POINTS[action.to].label + '，翻转 ' + action.flipped.length + ' 枚。');
      resolve(s);
    } else if (action.type === 'row') {
      action.cells.forEach(i => { s.board[i] = 0; }); s.pool += 5;
      s.removedRow = { cells: [...action.cells], player: color }; s.phase = 'ring';
      s.log.push(who + '收回 ' + action.cells.map(i => POINTS[i].label).join(' · ') + ' 五枚棋子。');
    } else if (action.type === 'remove') {
      s.board[action.at] = 0; s.scores[color - 1]++;
      s.log.push(who + '收回 ' + POINTS[action.at].label + ' 的环，当前 ' + s.scores[color - 1] + '/' + s.target + '。');
      if (s.scores[color - 1] >= s.target) finish(s, color, 'rings'); else resolve(s);
    } else {
      s.log.push(who + '没有合法移动，停一步。'); s.turn = 3 - color;
      // The printed rules omit a double block. This app declares a draw rather
      // than letting clients loop forever; the convention is stated in the UI.
      if (!movesFor(s).length) finish(s, 3, 'blocked');
    }
    if (s.phase === 'gameover') s.log.push(s.winner === 3 ? '对局结束，双方和棋。' : COLORS[s.winner - 1] + '获胜。');
    return true;
  }
  function undo(s) {
    if (!s.history.length) return false;
    do { Object.assign(s, s.history.pop()); }
    while (s.mode === 'ai' && s.turn !== s.human && s.history.length);
    return true;
  }
  function validPosition(s) {
    if (!s || s.version !== 1 || s.kind !== 'yinsh' || !['ai', 'local'].includes(s.mode) || ![1, 2].includes(s.human) ||
      ![1, 3].includes(s.target) || ![1, 2].includes(s.turn) || ![1, 2].includes(s.mover) || ![0, 1, 2, 3].includes(s.winner) ||
      !['place', 'move', 'row', 'ring', 'gameover'].includes(s.phase) || !Array.isArray(s.board) || s.board.length !== 85 ||
      !s.board.every(v => Number.isInteger(v) && v >= 0 && v <= 4) || !Number.isInteger(s.pool) || s.pool < 0 || s.pool > 51 ||
      !Number.isInteger(s.moveNumber) || s.moveNumber < 0 || !Array.isArray(s.log) || !s.log.every(v => typeof v === 'string')) return false;
    if (![s.placed, s.scores].every(list => Array.isArray(list) && list.length === 2 && list.every(Number.isInteger))) return false;
    for (let i = 0; i < 2; i++) if (s.placed[i] < 0 || s.placed[i] > 5 || s.scores[i] < 0 || s.scores[i] > s.target ||
      s.board.filter(v => v === i + 3).length !== s.placed[i] - s.scores[i]) return false;
    if (s.pool + s.board.filter(v => v === 1 || v === 2).length !== 51) return false;
    if (s.phase === 'place' ? s.placed[0] + s.placed[1] >= 10 || s.pool !== 51 : s.placed.some(n => n !== 5)) return false;
    if ((s.phase === 'gameover') !== Boolean(s.winner)) return false;
    if (s.phase === 'move' && (!s.pool || rows(s, 1).length || rows(s, 2).length)) return false;
    if (s.phase === 'row' && !rows(s).length) return false;
    if (s.phase === 'ring' && (!s.removedRow || s.removedRow.player !== s.turn || !Array.isArray(s.removedRow.cells) || s.removedRow.cells.length !== 5)) return false;
    return true;
  }
  function validSave(s) {
    try { return validPosition(s) && Array.isArray(s.history) && s.history.length <= 200 && s.history.every(validPosition); }
    catch { return false; }
  }
  function potential(board, color) {
    const weights = [0, .08, .7, 3.8, 18, 700]; let total = 0;
    for (const line of LINES) {
      let own = 0, opponent = 0, blocked = false;
      for (const i of line) { const v = board[i]; if (v >= 3) { blocked = true; break; } if (v === color) own++; else if (v) opponent++; }
      if (blocked) continue;
      if (!opponent) total += weights[own];
      if (!own) total -= weights[opponent] * 1.08;
    }
    return total;
  }
  function chooseAI(s) {
    const choices = actions(s); if (!choices.length) return null;
    const color = s.turn;
    const value = action => {
      const p = POINTS[action.to ?? action.at ?? action.cells?.[0] ?? 0];
      const distance = Math.max(Math.abs(p.q), Math.abs(p.r), Math.abs(p.q + p.r));
      const noise = ((s.history.length * 43 + (action.to || 0) * 29 + (action.from || 0) * 11) % 97) / 9700;
      if (action.type === 'place') {
        const own = s.board.flatMap((v, i) => v === color + 2 ? [POINTS[i]] : []);
        const crowded = own.reduce((n, t) => n + (Math.max(Math.abs(t.q - p.q), Math.abs(t.r - p.r), Math.abs(t.q + t.r - p.q - p.r)) <= 1 ? 3 : 0), 0);
        return 5 - distance * .65 - crowded + noise;
      }
      if (action.type === 'remove') return -ringMoves(s, action.at).length + distance * .1 + noise;
      const board = [...s.board];
      if (action.type === 'row') { action.cells.forEach(i => { board[i] = 0; }); return potential(board, color) + noise; }
      if (action.type === 'pass') return 0;
      applyMove(board, color, action);
      const ownRows = rows({ board }, color).length, opponentRows = rows({ board }, 3 - color).length;
      if (ownRows && s.scores[color - 1] === s.target - 1) return 100000 + ownRows;
      if (opponentRows && s.scores[2 - color] === s.target - 1) return -100000;
      return potential(board, color) + ownRows * 200 - opponentRows * 250 - distance * .06 + noise;
    };
    return choices.map(action => ({ action, value: value(action) })).sort((a, b) => b.value - a.value)[0].action;
  }
  root.YinshEngine = Object.freeze({ POINTS, LINES, at, newGame, rows, ringMoves, movesFor, actions, play, undo, validSave, chooseAI });
})(typeof window === 'undefined' ? globalThis : window);
