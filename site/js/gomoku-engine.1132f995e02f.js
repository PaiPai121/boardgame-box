(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GomokuEngine = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const SIZE = 15;
  const CELLS = SIZE * SIZE;
  const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  function newGame(mode = 'ai') {
    if (!['ai', 'local'].includes(mode)) throw new Error('未知的对局模式');
    return { version: 1, mode, board: Array(CELLS).fill(0), history: [], turn: 1, winner: 0 };
  }
  function inside(row, col) { return row >= 0 && row < SIZE && col >= 0 && col < SIZE; }
  function count(board, row, col, player, dr, dc) {
    let total = 0;
    row += dr; col += dc;
    while (inside(row, col) && board[row * SIZE + col] === player) {
      total++; row += dr; col += dc;
    }
    return total;
  }
  function winsAt(board, index, player) {
    const row = Math.floor(index / SIZE), col = index % SIZE;
    return DIRECTIONS.some(([dr, dc]) => 1 + count(board, row, col, player, dr, dc) +
      count(board, row, col, player, -dr, -dc) >= 5);
  }
  function wouldWin(board, index, player) {
    if (board[index] !== 0) return false;
    board[index] = player;
    const result = winsAt(board, index, player);
    board[index] = 0;
    return result;
  }
  function play(game, index) {
    if (game.winner) throw new Error('对局已经结束');
    if (!Number.isInteger(index) || index < 0 || index >= CELLS || game.board[index] !== 0) throw new Error('这个位置不能落子');
    const player = game.turn;
    game.board[index] = player;
    game.history.push({ index, player });
    if (winsAt(game.board, index, player)) game.winner = player;
    else if (game.history.length === CELLS) game.winner = 3;
    else game.turn = 3 - player;
    return game.winner;
  }
  function undo(game) {
    if (!game.history.length) return false;
    let moves = 1;
    if (game.mode === 'ai' && game.history.at(-1).player === 2) moves = Math.min(2, game.history.length);
    let earliest = null;
    while (moves-- > 0) {
      earliest = game.history.pop();
      game.board[earliest.index] = 0;
    }
    game.turn = earliest.player;
    game.winner = 0;
    return true;
  }
  function scoreMove(board, index, player) {
    const row = Math.floor(index / SIZE), col = index % SIZE;
    let result = 0;
    for (const [dr, dc] of DIRECTIONS) {
      let stones = 1, open = 0;
      for (const sign of [-1, 1]) {
        let r = row + dr * sign, c = col + dc * sign;
        while (inside(r, c) && board[r * SIZE + c] === player) {
          stones++; r += dr * sign; c += dc * sign;
        }
        if (inside(r, c) && board[r * SIZE + c] === 0) open++;
      }
      if (stones >= 5) result += 100000;
      else if (stones === 4) result += open === 2 ? 9000 : open === 1 ? 2500 : 0;
      else if (stones === 3) result += open === 2 ? 800 : open === 1 ? 160 : 0;
      else if (stones === 2) result += open === 2 ? 75 : open === 1 ? 20 : 0;
      else result += open === 2 ? 5 : 1;
    }
    return result;
  }
  function candidates(board) {
    const result = new Set();
    for (let i = 0; i < CELLS; i++) {
      if (!board[i]) continue;
      const row = Math.floor(i / SIZE), col = i % SIZE;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const r = row + dr, c = col + dc;
        if (inside(r, c) && !board[r * SIZE + c]) result.add(r * SIZE + c);
      }
    }
    return result.size ? [...result].sort((a, b) => a - b) : [112];
  }
  function chooseAI(game) {
    if (game.winner || game.turn !== 2) return null;
    const options = candidates(game.board);
    for (const index of options) if (wouldWin(game.board, index, 2)) return index;
    for (const index of options) if (wouldWin(game.board, index, 1)) return index;
    let best = options[0], bestScore = -Infinity;
    for (const index of options) {
      const attack = scoreMove(game.board, index, 2);
      const defend = scoreMove(game.board, index, 1);
      const row = Math.floor(index / SIZE), col = index % SIZE;
      const centrality = 14 - Math.abs(row - 7) - Math.abs(col - 7);
      const score = attack + defend * 0.88 + centrality * 0.1;
      if (score > bestScore) { bestScore = score; best = index; }
    }
    return best;
  }
  function validSave(value) {
    if (!value || value.version !== 1 || !['ai', 'local'].includes(value.mode) ||
        !Array.isArray(value.board) || value.board.length !== CELLS ||
        !value.board.every(cell => [0, 1, 2].includes(cell)) ||
        !Array.isArray(value.history) || value.history.length > CELLS ||
        ![1, 2].includes(value.turn) || ![0, 1, 2, 3].includes(value.winner)) return false;
    const seen = new Set();
    for (let i = 0; i < value.history.length; i++) {
      const move = value.history[i];
      if (!move || !Number.isInteger(move.index) || move.index < 0 || move.index >= CELLS ||
          move.player !== (i % 2) + 1 || seen.has(move.index) || value.board[move.index] !== move.player) return false;
      seen.add(move.index);
    }
    return value.board.filter(Boolean).length === value.history.length;
  }
  return { SIZE, newGame, play, undo, chooseAI, winsAt, wouldWin, validSave };
});
