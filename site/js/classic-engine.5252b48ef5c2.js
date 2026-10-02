(function (root) {
  'use strict';
  const other = side => side === 1 ? 2 : 1;
  const sideOf = piece => !piece ? 0 : piece === piece.toUpperCase() ? 1 : 2;
  const inside = (r, c, rows, cols) => r >= 0 && r < rows && c >= 0 && c < cols;
  const clone = value => JSON.parse(JSON.stringify(value));
  const xy = (i, cols) => [Math.floor(i / cols), i % cols];
  const at = (r, c, cols) => r * cols + c;
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function newGame(kind, mode = 'ai', size = 9) {
    if (!['go', 'xiangqi', 'chess'].includes(kind) || !['ai', 'local'].includes(mode)) throw Error('无效对局设置');
    let board, cols;
    if (kind === 'go') {
      if (![9, 13, 19].includes(size)) throw Error('无效围棋棋盘');
      cols = size; board = Array(size * size).fill(0);
    } else if (kind === 'chess') {
      cols = 8; board = Array.from('rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR', ch => ch === '.' ? '' : ch);
    } else {
      cols = 9; board = Array(90).fill('');
      const top = 'rheakaehr', bottom = top.toUpperCase();
      for (let c = 0; c < 9; c++) {
        board[c] = top[c]; board[81 + c] = bottom[c];
        if (c % 2 === 0) { board[27 + c] = 'p'; board[54 + c] = 'P'; }
      }
      board[19] = board[25] = 'c'; board[64] = board[70] = 'C';
    }
    const game = { version: 1, kind, mode, size: cols, board, turn: 1, winner: 0,
      reason: '', history: [], last: -1, phase: 'play' };
    if (kind === 'go') Object.assign(game, { passes: 0, captures: [0, 0], dead: [], komi: 7.5, positions: [board.join('')], score: null });
    if (kind === 'chess') Object.assign(game, { castling: 'KQkq', ep: -1, halfmove: 0, fullmove: 1, positions: [] });
    if (kind === 'chess') game.positions.push(chessKey(game));
    return game;
  }

  function snapshot(game) {
    const { history, positions, ...rest } = game;
    const state = clone(rest);
    if (positions) state.positionCount = positions.length;
    return state;
  }
  function remember(game) { game.history.push(snapshot(game)); }
  function undo(game) {
    if (!game.history.length) return false;
    const previous = game.history.pop();
    const history = game.history;
    const { positionCount, ...rest } = previous;
    const positions = game.positions && Number.isInteger(positionCount) ? game.positions.slice(0, positionCount) : game.positions;
    Object.assign(game, rest, { history });
    if (positions) game.positions = positions;
    return true;
  }
  function validSave(game) {
    if (!game || game.version !== 1 || !['go', 'xiangqi', 'chess'].includes(game.kind) ||
      !['ai', 'local'].includes(game.mode) || ![1, 2].includes(game.turn) || !Array.isArray(game.history)) return false;
    const size = game.kind === 'go' ? game.size : game.kind === 'chess' ? 8 : 9;
    if (game.kind === 'go' && ![9, 13, 19].includes(size)) return false;
    return Array.isArray(game.board) && game.board.length === (game.kind === 'xiangqi' ? 90 : size * size);
  }

  function goNeighbors(index, size) {
    const [r, c] = xy(index, size);
    return directions.filter(([dr, dc]) => inside(r + dr, c + dc, size, size)).map(([dr, dc]) => at(r + dr, c + dc, size));
  }
  function goGroup(board, index, size) {
    const color = board[index], stones = [], liberties = new Set(), visited = new Set([index]), queue = [index];
    for (let p = 0; p < queue.length; p++) {
      const current = queue[p]; stones.push(current);
      for (const neighbor of goNeighbors(current, size)) {
        if (!board[neighbor]) liberties.add(neighbor);
        else if (board[neighbor] === color && !visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
      }
    }
    return { stones, liberties };
  }
  function tryGo(game, index) {
    if (game.phase !== 'play' || game.winner || !Number.isInteger(index) || index < 0 || index >= game.board.length || game.board[index]) return null;
    const board = game.board.slice(), enemy = other(game.turn);
    board[index] = game.turn;
    let captured = 0;
    for (const neighbor of goNeighbors(index, game.size)) {
      if (board[neighbor] !== enemy) continue;
      const group = goGroup(board, neighbor, game.size);
      if (group.liberties.size === 0) {
        for (const stone of group.stones) board[stone] = 0;
        captured += group.stones.length;
      }
    }
    if (!goGroup(board, index, game.size).liberties.size) return null;
    if (game.positions.includes(board.join(''))) return null;
    return { board, captured };
  }
  function playGo(game, index) {
    const result = tryGo(game, index);
    if (!result) throw Error('该位置无法落子：已有棋子、自杀或重复局面');
    remember(game); game.board = result.board; game.captures[game.turn - 1] += result.captured;
    game.last = index; game.passes = 0; game.turn = other(game.turn); game.positions.push(game.board.join(''));
  }
  function passGo(game) {
    if (game.kind !== 'go' || game.phase !== 'play') throw Error('现在不能停一手');
    remember(game); game.passes++; game.last = -1; game.turn = other(game.turn);
    if (game.passes >= 2) { game.phase = 'scoring'; game.score = goScore(game); }
  }
  function markGoDead(game, index) {
    if (game.kind !== 'go' || game.phase !== 'scoring' || !game.board[index]) throw Error('请选择待移除的棋子');
    remember(game);
    const group = goGroup(game.board, index, game.size).stones;
    const dead = new Set(game.dead), shouldMark = !dead.has(index);
    for (const stone of group) shouldMark ? dead.add(stone) : dead.delete(stone);
    game.dead = [...dead]; game.score = goScore(game);
  }
  function goScore(game) {
    const board = game.board.map((stone, index) => game.dead.includes(index) ? 0 : stone);
    const points = [0, 0], seen = new Set();
    for (let i = 0; i < board.length; i++) {
      if (board[i]) { points[board[i] - 1]++; continue; }
      if (seen.has(i)) continue;
      const region = [i], owners = new Set(); seen.add(i);
      for (let p = 0; p < region.length; p++) for (const n of goNeighbors(region[p], game.size)) {
        if (board[n]) owners.add(board[n]);
        else if (!seen.has(n)) { seen.add(n); region.push(n); }
      }
      if (owners.size === 1) points[[...owners][0] - 1] += region.length;
    }
    return { black: points[0], white: points[1] + game.komi, komi: game.komi };
  }
  function finishGo(game) {
    if (game.phase !== 'scoring') throw Error('双方连续停一手后才能计分');
    remember(game); game.score = goScore(game); game.phase = 'ended';
    game.winner = game.score.black === game.score.white ? 3 : game.score.black > game.score.white ? 1 : 2;
    game.reason = `数子：黑 ${game.score.black}，白 ${game.score.white}（含贴目 ${game.komi}）`;
  }

  function chessKey(game) { return game.board.join('') + '/' + game.turn + '/' + game.castling + '/' + game.ep; }
  function chessAttacked(board, target, bySide) {
    const [tr, tc] = xy(target, 8);
    const pawnRow = tr + (bySide === 1 ? 1 : -1);
    for (const dc of [-1, 1]) if (inside(pawnRow, tc + dc, 8, 8) && board[at(pawnRow, tc + dc, 8)] === (bySide === 1 ? 'P' : 'p')) return true;
    for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
      const r = tr + dr, c = tc + dc;
      if (inside(r, c, 8, 8) && board[at(r, c, 8)] === (bySide === 1 ? 'N' : 'n')) return true;
    }
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = tr + dr, c = tc + dc;
      if (inside(r, c, 8, 8) && board[at(r, c, 8)] === (bySide === 1 ? 'K' : 'k')) return true;
    }
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      let r = tr + dr, c = tc + dc;
      while (inside(r, c, 8, 8)) {
        const piece = board[at(r, c, 8)];
        if (piece) {
          if (sideOf(piece) === bySide && ('q' === piece.toLowerCase() ||
            ((dr === 0 || dc === 0) ? piece.toLowerCase() === 'r' : piece.toLowerCase() === 'b'))) return true;
          break;
        }
        r += dr; c += dc;
      }
    }
    return false;
  }
  function chessInCheck(game, side) {
    const king = game.board.indexOf(side === 1 ? 'K' : 'k');
    return king < 0 || chessAttacked(game.board, king, other(side));
  }
  function pseudoChess(game, side = game.turn) {
    const moves = [], board = game.board;
    for (let from = 0; from < 64; from++) {
      const piece = board[from]; if (!piece || sideOf(piece) !== side) continue;
      const [r, c] = xy(from, 8), type = piece.toLowerCase();
      const add = (nr, nc, extra = {}) => {
        if (!inside(nr, nc, 8, 8)) return false;
        const to = at(nr, nc, 8), target = board[to];
        if (target && (sideOf(target) === side || target.toLowerCase() === 'k')) return false;
        if (type === 'p' && (nr === 0 || nr === 7)) {
          for (const promotion of ['q', 'r', 'b', 'n']) moves.push({ from, to, promotion: side === 1 ? promotion.toUpperCase() : promotion });
        } else moves.push({ from, to, ...extra });
        return !target;
      };
      if (type === 'p') {
        const step = side === 1 ? -1 : 1, next = r + step;
        if (inside(next, c, 8, 8) && !board[at(next, c, 8)]) {
          add(next, c);
          if (r === (side === 1 ? 6 : 1) && !board[at(r + 2 * step, c, 8)]) add(r + 2 * step, c);
        }
        for (const dc of [-1, 1]) if (inside(next, c + dc, 8, 8)) {
          const target = at(next, c + dc, 8);
          if (board[target] && sideOf(board[target]) === other(side)) add(next, c + dc);
          else if (target === game.ep) add(next, c + dc, { enPassant: true });
        }
      } else if (type === 'n' || type === 'k') {
        const offsets = type === 'n' ? [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] :
          [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
        for (const [dr, dc] of offsets) add(r + dr, c + dc);
        if (type === 'k' && !chessInCheck(game, side)) {
          const base = side === 1 ? 60 : 4, enemy = other(side);
          if (from === base && game.castling.includes(side === 1 ? 'K' : 'k') &&
            board[base + 3] === (side === 1 ? 'R' : 'r') && !board[base + 1] && !board[base + 2] &&
            !chessAttacked(board, base + 1, enemy) && !chessAttacked(board, base + 2, enemy)) moves.push({ from, to: base + 2, castle: true });
          if (from === base && game.castling.includes(side === 1 ? 'Q' : 'q') &&
            board[base - 4] === (side === 1 ? 'R' : 'r') && !board[base - 1] && !board[base - 2] && !board[base - 3] &&
            !chessAttacked(board, base - 1, enemy) && !chessAttacked(board, base - 2, enemy)) moves.push({ from, to: base - 2, castle: true });
        }
      } else {
        const dirs = type === 'b' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : type === 'r' ? directions :
          [...directions, [1, 1], [1, -1], [-1, 1], [-1, -1]];
        for (const [dr, dc] of dirs) {
          let nr = r + dr, nc = c + dc;
          while (inside(nr, nc, 8, 8)) {
            const empty = add(nr, nc); if (!empty) break;
            nr += dr; nc += dc;
          }
        }
      }
    }
    return moves;
  }
  function applyChess(game, move) {
    const board = game.board, piece = board[move.from], captured = board[move.to];
    if (piece.toLowerCase() === 'p' || captured || move.enPassant) game.halfmove = 0;
    else game.halfmove++;
    if (piece === 'K') game.castling = game.castling.replace(/[KQ]/g, '');
    if (piece === 'k') game.castling = game.castling.replace(/[kq]/g, '');
    for (const [square, right] of [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']])
      if (move.from === square || move.to === square) game.castling = game.castling.replace(right, '');
    board[move.to] = move.promotion || piece; board[move.from] = '';
    if (move.enPassant) board[move.to + (game.turn === 1 ? 8 : -8)] = '';
    if (move.castle) {
      const rookFrom = move.to > move.from ? move.from + 3 : move.from - 4;
      const rookTo = move.to > move.from ? move.from + 1 : move.from - 1;
      board[rookTo] = board[rookFrom]; board[rookFrom] = '';
    }
    game.ep = piece.toLowerCase() === 'p' && Math.abs(move.to - move.from) === 16 ? (move.to + move.from) / 2 : -1;
    if (game.turn === 2) game.fullmove++;
    game.turn = other(game.turn); game.last = move.to;
  }
  function chessMoves(game, side = game.turn) {
    if (game.winner || game.phase !== 'play') return [];
    return pseudoChess(game, side).filter(move => {
      const next = { ...game, board: game.board.slice(), turn: side };
      applyChess(next, move);
      return !chessInCheck(next, side);
    });
  }
  function chessInsufficient(board) {
    const pieces = board.filter(Boolean).filter(p => p.toLowerCase() !== 'k');
    if (!pieces.length) return true;
    if (pieces.length === 1 && ['b', 'n'].includes(pieces[0].toLowerCase())) return true;
    if (pieces.length === 2 && pieces.every(p => p.toLowerCase() === 'b')) {
      const bishops = board.map((p, i) => p.toLowerCase() === 'b' ? i : -1).filter(i => i >= 0);
      return bishops.every(i => (Math.floor(i / 8) + i % 8) % 2 === (Math.floor(bishops[0] / 8) + bishops[0] % 8) % 2);
    }
    return false;
  }
  function playChess(game, from, to, promotion) {
    const move = chessMoves(game).find(m => m.from === from && m.to === to && (!m.promotion || m.promotion === promotion));
    if (!move) throw Error('这步棋不符合规则');
    remember(game); applyChess(game, move); game.positions.push(chessKey(game));
    const replies = chessMoves(game);
    if (!replies.length) {
      if (chessInCheck(game, game.turn)) { game.winner = other(game.turn); game.reason = '将死'; }
      else { game.winner = 3; game.reason = '逼和'; }
    } else if (game.halfmove >= 100) { game.winner = 3; game.reason = '五十回合规则'; }
    else if (game.positions.filter(key => key === chessKey(game)).length >= 3) { game.winner = 3; game.reason = '三次重复局面'; }
    else if (chessInsufficient(game.board)) { game.winner = 3; game.reason = '子力不足'; }
    return move;
  }

  function xqPalace(side, r, c) { return c >= 3 && c <= 5 && r >= (side === 1 ? 7 : 0) && r <= (side === 1 ? 9 : 2); }
  function pseudoXiangqi(game, side = game.turn) {
    const moves = [], board = game.board;
    for (let from = 0; from < 90; from++) {
      const piece = board[from]; if (!piece || sideOf(piece) !== side) continue;
      const [r, c] = xy(from, 9), type = piece.toLowerCase();
      const add = (nr, nc) => {
        if (!inside(nr, nc, 10, 9)) return false;
        const to = at(nr, nc, 9), target = board[to];
        if (target && sideOf(target) === side) return false;
        moves.push({ from, to }); return !target;
      };
      if (type === 'r' || type === 'c') {
        for (const [dr, dc] of directions) {
          let nr = r + dr, nc = c + dc, screened = false;
          while (inside(nr, nc, 10, 9)) {
            const target = board[at(nr, nc, 9)];
            if (type === 'r') { if (!add(nr, nc)) break; }
            else if (!screened) { if (target) screened = true; else add(nr, nc); }
            else if (target) { if (sideOf(target) !== side) add(nr, nc); break; }
            nr += dr; nc += dc;
          }
        }
      } else if (type === 'h') {
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!inside(r + dr, c + dc, 10, 9) || board[at(r + dr, c + dc, 9)]) continue;
          const tips = dr ? [[r + 2 * dr, c - 1], [r + 2 * dr, c + 1]] : [[r - 1, c + 2 * dc], [r + 1, c + 2 * dc]];
          for (const [nr, nc] of tips) add(nr, nc);
        }
      } else if (type === 'e') {
        for (const [dr, dc] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
          const nr = r + dr, nc = c + dc;
          if (!inside(nr, nc, 10, 9) || (side === 1 ? nr < 5 : nr > 4) || board[at(r + dr / 2, c + dc / 2, 9)]) continue;
          add(nr, nc);
        }
      } else if (type === 'a') {
        for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) if (xqPalace(side, r + dr, c + dc)) add(r + dr, c + dc);
      } else if (type === 'k') {
        for (const [dr, dc] of directions) if (xqPalace(side, r + dr, c + dc)) add(r + dr, c + dc);
        for (let nr = r + (side === 1 ? -1 : 1); inside(nr, c, 10, 9); nr += side === 1 ? -1 : 1) {
          const target = board[at(nr, c, 9)];
          if (target) { if (target.toLowerCase() === 'k' && sideOf(target) !== side) add(nr, c); break; }
        }
      } else if (type === 'p') {
        add(r + (side === 1 ? -1 : 1), c);
        if (side === 1 ? r <= 4 : r >= 5) { add(r, c - 1); add(r, c + 1); }
      }
    }
    return moves;
  }
  function xqInCheck(game, side) {
    const king = game.board.indexOf(side === 1 ? 'K' : 'k');
    return king < 0 || pseudoXiangqi(game, other(side)).some(move => move.to === king);
  }
  function xiangqiMoves(game, side = game.turn) {
    if (game.winner || game.phase !== 'play') return [];
    return pseudoXiangqi(game, side).filter(move => {
      const next = { ...game, board: game.board.slice() };
      next.board[move.to] = next.board[move.from]; next.board[move.from] = '';
      return !xqInCheck(next, side);
    });
  }
  function playXiangqi(game, from, to) {
    if (!xiangqiMoves(game).some(move => move.from === from && move.to === to)) throw Error('这步棋不符合规则');
    remember(game); game.board[to] = game.board[from]; game.board[from] = ''; game.last = to;
    const moved = game.turn; game.turn = other(game.turn);
    if (!xiangqiMoves(game).length) { game.winner = moved; game.reason = xqInCheck(game, game.turn) ? '将死' : '无子可走'; }
  }

  function moves(game, side = game.turn) { return game.kind === 'chess' ? chessMoves(game, side) : game.kind === 'xiangqi' ? xiangqiMoves(game, side) : [];
  }
  const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000, h: 450, e: 200, a: 200, c: 500 };
  function chooseAI(game) {
    if (game.kind === 'go') {
      if (game.phase !== 'play') return null;
      if (game.passes) return { pass: true };
      let best = null, bestScore = -Infinity;
      for (let i = 0; i < game.board.length; i++) {
        const result = tryGo(game, i); if (!result) continue;
        const neighbors = goNeighbors(i, game.size), contact = neighbors.filter(n => game.board[n]).length;
        const [r, c] = xy(i, game.size), center = (game.size - 1) / 2;
        const ownLiberties = goGroup(result.board, i, game.size).liberties.size;
        const score = result.captured * 40 + contact * 2 + Math.random() * 2 - Math.abs(r - center) * .12 - Math.abs(c - center) * .12 - (ownLiberties === 1 ? 15 : 0);
        if (score > bestScore) { best = i; bestScore = score; }
      }
      return best === null ? { pass: true } : { to: best };
    }
    const legal = moves(game);
    if (!legal.length) return null;
    const ranked = legal.map(move => {
      const captured = game.board[move.to];
      let score = (captured ? values[captured.toLowerCase()] || 0 : 0) * 10 + Math.random() * 12;
      if (move.promotion) score += values[move.promotion.toLowerCase()] || 0;
      const next = { ...game, board: game.board.slice(), castling: game.castling };
      if (game.kind === 'chess') {
        applyChess(next, move);
        if (chessInCheck(next, next.turn)) score += 12;
        const danger = chessAttacked(next.board, move.to, next.turn);
        if (danger) score -= (values[game.board[move.from].toLowerCase()] || 0) * 3;
      } else {
        next.board[move.to] = next.board[move.from]; next.board[move.from] = '';
        next.turn = other(game.turn);
        if (xqInCheck(next, next.turn)) score += 12;
        if (pseudoXiangqi(next, next.turn).some(reply => reply.to === move.to)) score -= (values[game.board[move.from].toLowerCase()] || 0) * 3;
      }
      return { move, score };
    });
    ranked.sort((a, b) => b.score - a.score);
    return ranked[0].move;
  }
  root.ClassicEngine = { newGame, validSave, undo, tryGo, playGo, passGo, markGoDead, goScore, finishGo,
    chessMoves, playChess, chessInCheck, xiangqiMoves, playXiangqi, xqInCheck, moves, chooseAI };
})(typeof window !== 'undefined' ? window : globalThis);
