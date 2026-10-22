(function () {
  'use strict';
  // Effects are a view of committed state. They never delay or change a game action.
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let preference = 'auto';
  try { preference = localStorage.getItem('boardgame-box-motion') || 'auto'; } catch {}
  const running = new Set(), ghosts = new Set();
  const stats = { actions: 0, flights: 0, drops: 0, captures: 0, arrivals: 0, celebrations: 0, last: null };
  const enabled = () => preference !== 'off' && (preference === 'on' || !media.matches);
  function cancel() {
    for (const animation of running) animation.cancel();
    running.clear();
    for (const node of ghosts) node.remove();
    ghosts.clear();
    document.querySelectorAll('[data-bm-hidden]').forEach(node => { node.style.visibility = ''; delete node.dataset.bmHidden; });
  }
  const toggle = document.createElement('button');
  toggle.className = 'bm-toggle'; toggle.type = 'button';
  function sync() {
    document.documentElement.dataset.motion = enabled() ? 'on' : 'off';
    toggle.textContent = enabled() ? '◉ 动效 开' : '○ 动效 关';
    toggle.setAttribute('aria-pressed', String(enabled()));
    toggle.title = '开启或关闭所有桌游的动作动画。也支持系统的减少动态效果设置。';
    if (!enabled()) cancel();
  }
  toggle.addEventListener('click', () => {
    preference = enabled() ? 'off' : 'on';
    try { localStorage.setItem('boardgame-box-motion', preference); } catch {}
    sync();
  });
  media.addEventListener('change', sync); document.body.appendChild(toggle); sync();
  function rect(node) {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return null;
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  function visual(node) {
    if (!node) return null;
    const copy = node.cloneNode(true), originals = [node, ...node.querySelectorAll('*')], copies = [copy, ...copy.querySelectorAll('*')];
    const properties = ['font','color','background','border','border-radius','box-shadow','object-fit','display','align-items','justify-content','padding','text-shadow','opacity'];
    copies.forEach((item, index) => {
      const css = getComputedStyle(originals[index]);
      for (const property of properties) item.style.setProperty(property, css.getPropertyValue(property));
      item.removeAttribute('id'); item.removeAttribute('title'); item.removeAttribute('tabindex');
      // A ghost must not be mistaken for another interactive card or board piece.
      if (!originals[index].classList.contains('ball')) item.removeAttribute('class');
      for (const attr of [...item.attributes]) if (attr.name.startsWith('data-')) item.removeAttribute(attr.name);
    });
    copy.classList.add('bm-ghost'); copy.setAttribute('aria-hidden', 'true'); copy.inert = true;
    return copy;
  }
  function item(node) { return node && rect(node) ? { rect: rect(node), visual: visual(node) } : null; }
  function collect() {
    const map = new Map();
    document.querySelectorAll('[data-motion-key]').forEach(node => {
      const key = node.dataset.motionKey;
      // Prefer the actual token or card illustration, without action buttons and price labels.
      const art = node.querySelector('.ball,.b-gem,[data-motion-art],.pr-icon,.pr-worker,.w-card-art img,.b-card-art img,.card-tile img') || node;
      const found = item(art); if (found && !map.has(key)) map.set(key, found);
    });
    document.querySelectorAll('[data-motion-player]').forEach(node => {
      const found = item(node.querySelector('.trainer-avatar,.b-player-head,.w-player-top,.pr-seat-head') || node);
      if (found) map.set('player:' + node.dataset.motionPlayer, found);
    });
    document.querySelectorAll('[data-cell]').forEach(node => {
      const piece = node.querySelector('.cb-piece,.cb-stone,.gk-stone,.yn-piece');
      if (piece) { const found = item(piece); if (found) map.set('piece:' + node.dataset.cell, found); }
    });
    return map;
  }
  function target(key) {
    if (key.startsWith('piece:')) return document.querySelector('[data-cell="' + key.slice(6) + '"] .cb-piece,[data-cell="' + key.slice(6) + '"] .cb-stone,[data-cell="' + key.slice(6) + '"] .gk-stone,[data-cell="' + key.slice(6) + '"] .yn-piece');
    if (key.startsWith('player:')) return document.querySelector('[data-motion-player="' + key.slice(7) + '"]');
    return document.querySelector('[data-motion-key="' + CSS.escape(key) + '"]');
  }
  function run(node, frames, options, cleanup) {
    if (!node || !enabled()) { cleanup?.(); return; }
    const animation = node.animate(frames, { duration: 420, easing: 'cubic-bezier(.2,.75,.25,1)', ...options });
    running.add(animation);
    const finish = () => { running.delete(animation); cleanup?.(); };
    animation.finished.then(finish, finish);
    return animation;
  }
  function ghostAt(source) {
    if (!source?.rect || !source.visual) return null;
    const node = source.visual.cloneNode(true), r = source.rect;
    Object.assign(node.style, { position: 'fixed', left: r.x + 'px', top: r.y + 'px', width: r.width + 'px', height: r.height + 'px', margin: '0', minWidth: '0', maxWidth: 'none', minHeight: '0', maxHeight: 'none', transformOrigin: 'center', zIndex: '1500', pointerEvents: 'none' });
    document.body.appendChild(node); ghosts.add(node); return node;
  }
  function removeGhost(node) { if (node) { ghosts.delete(node); node.remove(); } }
  function fly(source, destination, options = {}) {
    const end = rect(destination); if (!source || !end || !enabled()) return;
    const node = ghostAt(source); if (!node) return;
    const r = source.rect, scale = options.token ? Math.min(1, 28 / r.width) : Math.min(1, end.width / r.width, end.height / r.height);
    const dx = end.x + end.width / 2 - r.x - r.width / 2, dy = end.y + end.height / 2 - r.y - r.height / 2;
    if (options.hide) { destination.style.visibility = 'hidden'; destination.dataset.bmHidden = 'true'; }
    stats.flights++;
    run(node, [
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: 'translate(' + dx * .48 + 'px,' + (dy * .48 - 28) + 'px) scale(' + (1 + scale) / 2 + ') rotate(-5deg)', opacity: 1, offset: .5 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ') rotate(0deg)', opacity: options.hide ? 1 : .15 }
    ], { duration: options.piece ? 340 : 470, delay: options.delay || 0 }, () => {
      removeGhost(node);
      if (options.hide) { destination.style.visibility = ''; delete destination.dataset.bmHidden; }
      else pulse(destination);
    });
  }
  function pulse(node) { run(node, [{ filter: 'brightness(1)', transform: 'scale(1)' }, { filter: 'brightness(1.35)', transform: 'scale(1.025)', offset: .4 }, { filter: 'brightness(1)', transform: 'scale(1)' }], { duration: 260 }); }
  function arrive(node, delay = 0, stone = false) {
    if (!node || !enabled()) return;
    stats[stone ? 'drops' : 'arrivals']++;
    const base = getComputedStyle(node).transform === 'none' ? '' : getComputedStyle(node).transform + ' ';
    run(node, stone ? [{ transform: base + 'translateY(-22px) scale(.65)', opacity: 0 }, { transform: base + 'translateY(2px) scale(1.08)', opacity: 1, offset: .65 }, { transform: base + 'translateY(0) scale(1)', opacity: 1 }] :
      [{ transform: 'translateY(18px) rotateY(-25deg) scale(.92)', opacity: 0 }, { transform: 'translateY(0) rotateY(0) scale(1)', opacity: 1 }], { duration: stone ? 330 : 380, delay });
  }
  function capture(source) {
    if (!source || !enabled()) return;
    const node = ghostAt(source); stats.captures++;
    run(node, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'translateY(-14px) scale(1.18)', opacity: .75, offset: .4 }, { transform: 'translateY(12px) scale(.2)', opacity: 0 }], { duration: 320 }, () => removeGhost(node));
  }
  function celebrate() {
    if (!enabled()) return;
    stats.celebrations++;
    const colors = ['#f7d17a', '#85d8bd', '#ec997f', '#c0cafa'];
    for (let i = 0; i < 24; i++) {
      const node = document.createElement('i'); node.className = 'bm-confetti'; node.style.background = colors[i % colors.length];
      node.style.left = innerWidth / 2 + 'px'; node.style.top = Math.min(innerHeight * .35, 280) + 'px';
      document.body.appendChild(node); ghosts.add(node);
      const angle = Math.PI * 2 * i / 24, dx = Math.cos(angle) * (130 + i % 4 * 40), dy = Math.sin(angle) * 100 + 180;
      run(node, [{ transform: 'translate(0,0) rotate(0deg)', opacity: 0 }, { opacity: 1, offset: .1 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(' + i * 75 + 'deg)', opacity: 0 }], { duration: 1300, delay: i % 4 * 30 }, () => removeGhost(node));
    }
  }
  function view(state) {
    return structuredClone({ board: state.board, turn: state.turn, current: state.current, phase: state.phase, winner: state.winner, winners: state.winners,
      age: state.age, era: state.era, round: state.round, role: state.role, bank: state.bank, players: state.players, scores: state.scores });
  }
  function transition(kind, before, after, dom, calls) {
    stats.actions++; stats.last = { game: kind, methods: calls.map(call => call.name), time: Date.now() };
    if (!enabled()) return;
    if (kind === 'yinsh' && before.board && after.board) {
      const action = calls.find(c => c.name === 'play')?.args[1], handled = new Set();
      if (action?.type === 'move') {
        fly(dom.get('piece:' + action.from), target('piece:' + action.to), { piece: true, hide: true });
        arrive(target('piece:' + action.from), 0, true); handled.add(action.from); handled.add(action.to);
      }
      for (let i = 0; i < after.board.length; i++) {
        if (handled.has(i) || before.board[i] === after.board[i]) continue;
        const old = before.board[i], next = after.board[i], destination = target('piece:' + i);
        if (old && next && old < 3 && next < 3) {
          const ghost = ghostAt(dom.get('piece:' + i)); stats.flips = (stats.flips || 0) + 1;
          run(ghost, [{ transform: 'rotateY(0deg)', opacity: 1 }, { transform: 'rotateY(90deg)', opacity: 0 }], { duration: 180 }, () => removeGhost(ghost));
          run(destination, [{ transform: 'rotateY(-90deg)', opacity: 0 }, { transform: 'rotateY(0deg)', opacity: 1 }], { duration: 200, delay: 160, fill: 'backwards' });
        } else if (!next && old >= 3 && after.scores?.[old - 3] > before.scores?.[old - 3]) {
          fly(dom.get('piece:' + i), document.querySelector('[data-yinsh-score="' + (old - 2) + ':' + after.scores[old - 3] + '"]'));
        } else if (next) arrive(destination, 0, true);
        else capture(dom.get('piece:' + i));
      }
      if (before.turn !== after.turn) pulse(target('player:' + (after.turn - 1)));
    } else if (before.board && after.board) {
      const moved = new Set(), destinations = new Set();
      const primary = calls.find(call => ['playChess', 'playXiangqi'].includes(call.name));
      if (primary) {
        const from = primary.args[1], to = primary.args[2];
        fly(dom.get('piece:' + from), target('piece:' + to), { piece: true, hide: true }); moved.add(from); destinations.add(to);
        if (before.board[to]) capture(dom.get('piece:' + to));
      }
      // A second rook move (castling), reverse moves after undo, and removed stones.
      const departures = before.board.map((v, i) => v && v !== after.board[i] && !moved.has(i) ? i : -1).filter(i => i >= 0);
      for (let i = 0; i < after.board.length; i++) {
        const value = after.board[i]; if (!value || value === before.board[i] || destinations.has(i)) continue;
        const from = (kind === 'chess' || kind === 'xiangqi') ? departures.find(j => !moved.has(j) && before.board[j] === value && !after.board[j]) : undefined;
        if (from !== undefined) { fly(dom.get('piece:' + from), target('piece:' + i), { piece: true, hide: true }); moved.add(from); }
        else arrive(target('piece:' + i), 0, true);
      }
      for (const i of departures) if (!moved.has(i) && !destinations.has(i)) capture(dom.get('piece:' + i));
    }
    const puertoAction = kind === 'puerto' ? calls.find(call => call.name === 'play')?.args[1] : null;
    if (puertoAction?.type === 'role') fly(dom.get('card:role:' + puertoAction.role), document.querySelector('.pr-phase'));
    if (before.players && after.players) {
      after.players.forEach((p, index) => {
        const old = before.players[index], destination = target('player:' + index);
        if (!old) return;
        const wallet = p.tokens || p.goods || {}, oldWallet = old.tokens || old.goods || {};
        for (const color of Object.keys(wallet)) {
          const difference = wallet[color] - (oldWallet[color] || 0);
          for (let n = 0; n < Math.min(Math.abs(difference), 4); n++) {
            const from = difference > 0 ? dom.get('bank:' + color) : dom.get('wallet:' + index + ':' + color);
            const to = difference > 0 ? target('wallet:' + index + ':' + color) || destination :
              puertoAction?.type === 'ship' ? target('ship:' + puertoAction.ship) : puertoAction?.type === 'trade' ? target('trading') : target('bank:' + color);
            fly(from, to, { token: true, delay: n * 45 });
          }
        }
        for (const zone of ['owned', 'reserved', 'built', 'nobles']) {
          const gained = (p[zone] || []).filter(id => !(old[zone] || []).includes(id));
          for (const id of gained) fly(dom.get('card:' + id) || dom.get('noble:' + id), target('card:' + id) || destination);
        }
        if (kind === 'puerto') {
          for (const tile of p.island.filter(t => !old.island.some(previous => previous.id === t.id))) {
            fly(dom.get('card:' + tile.id) || dom.get('card:quarry'), target('island:' + index + ':' + tile.id) || destination);
          }
          for (const building of p.city.filter(b => !old.city.some(previous => previous.id === b.id))) {
            fly(dom.get('card:building:' + building.id), target('city:' + index + ':' + building.id) || destination);
          }
          const residents = p.loose + p.island.reduce((n, t) => n + t.workers, 0) + p.city.reduce((n, b) => n + b.workers, 0);
          const previous = old.loose + old.island.reduce((n, t) => n + t.workers, 0) + old.city.reduce((n, b) => n + b.workers, 0);
          if (residents > previous) fly(dom.get('workers:ship') || dom.get('workers:supply'), destination, { token: true });
          if (puertoAction?.type === 'allocate' && index === before.current) {
            document.querySelectorAll('.pr-board .pr-worker-badge').forEach((node, i) => arrive(node, Math.min(i * 25, 150), true));
          }
        }
        if (kind === 'burgundy') {
          if (p.workers !== old.workers) pulse(target('workers:' + index));
          if (p.silver !== old.silver) pulse(target('silver:' + index));
          if (before.round !== after.round || before.era !== after.era) {
            document.querySelectorAll('.bu-die-button .bu-die-face').forEach((node, n) =>
              run(node, [{ transform: 'rotate(-100deg) scale(.65)', opacity: .3 }, { transform: 'rotate(16deg) scale(1.08)', opacity: 1 }, { transform: 'rotate(0) scale(1)', opacity: 1 }], { duration: 580, delay: n * 80 }));
          }
          const regions = (p.completed || []).filter(r => !old.completed.includes(r));
          if (regions.length && window.BurgundyData) for (const r of regions) {
            for (const cell of window.BurgundyData.regions[r].cells) arrive(document.querySelector('.bu-hex[data-hex="' + cell + '"]'), 80, true);
            pulse(document.querySelector('.bu-score-total'));
          }
        }
        if (p.coins !== old.coins || p.vp !== old.vp || p.stages?.length !== old.stages?.length) pulse(destination);
      });
      const oldKeys = new Set(dom.keys()); let n = 0;
      document.querySelectorAll('[data-motion-key^="card:"]').forEach(node => {
        if (!oldKeys.has(node.dataset.motionKey)) arrive(node, Math.min(n++ * 28, 160));
      });
      // Draft picks are recorded before simultaneous buildings resolve.
      if (kind === 'wonders') for (const call of calls) {
        if (['play', 'playBonus'].includes(call.name) && call.args[2]) fly(dom.get('card:' + call.args[2]), target('player:' + call.args[1]));
      }
      if (before.current !== after.current) pulse(target('player:' + after.current));
      if (before.age !== after.age || before.round !== after.round || before.role !== after.role) arrive(document.querySelector('.w-age-banner,.pr-phase,.status-pill'));
    }
    if ((after.phase === 'gameover' && before.phase !== 'gameover') || (after.winner && !before.winner)) celebrate();
    document.dispatchEvent(new CustomEvent('boardmotion:action', { detail: stats.last }));
  }
  function watch(options) {
    let pending = null;
    // Keep the public engine untouched, including engines with frozen exports.
    const watched = { ...options.engine };
    for (const name of options.methods) {
      const original = options.engine[name]; if (typeof original !== 'function') continue;
      watched[name] = function (...args) {
        if (!args[0] || args[0] !== options.state()) return original.apply(this, args);
        const initial = pending ? null : { before: view(args[0]), dom: collect(), calls: [] };
        const result = original.apply(this, args); // A rejected action cannot animate.
        if (result === false) return result;
        if (!pending) {
          cancel(); pending = initial;
          requestAnimationFrame(() => {
            const committed = pending; pending = null;
            const state = options.state(); if (!state || !committed) return;
            transition(options.game, committed.before, view(state), committed.dom, committed.calls);
          });
        }
        pending.calls.push({ name, args }); return result;
      };
    }
    return watched;
  }
  window.addEventListener('pagehide', cancel);
  function remote(kind, before, after, render, calls = []) {
    const old = before && view(before), dom = before && collect();
    cancel(); render();
    if (old && after) requestAnimationFrame(() => transition(kind, old, view(after), dom, calls));
  }
  window.BoardMotion = { watch, remote, enabled, cancel, arrive, pulse, fly, collect, celebrate, stats, aiDelay: () => enabled() ? 650 : 150 };
})();
