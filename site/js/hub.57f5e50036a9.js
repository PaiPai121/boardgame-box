(function () {
  'use strict';
  const root = document.getElementById('hub');
  const multiplayer = window.BoardSite?.multiplayer !== false;
  const SPLENDOR_SAVE = 'splendor-pokemon-classroom-v1';
  const GOMOKU_SAVE = 'boardgame-box-gomoku-v1';
  const WONDERS_SAVE = 'boardgame-box-seven-wonders-v1';
  const lanHttp = location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(location.hostname);
  const catalog = [
    {
      id: 'splendor', name: '璀璨宝石：宝可梦', english: 'POKÉMON SPLENDOR',
      genre: '卡牌策略', players: '2–4 人', duration: '30–45 分钟',
      summary: '收集精灵球，捕捉宝可梦，经营你的进化队伍。率先达到 18 分，赢下训练家对决。',
      href: 'splendor.html', color: 'mint', saveKey: SPLENDOR_SAVE
    },
    {
      id: 'splendor-classic', name: '璀璨宝石', english: 'SPLENDOR',
      genre: '卡牌策略', players: '2–4 人', duration: '约 30 分钟',
      summary: '采集宝石，投资矿场，迎接贵族。90 张实体发展卡，体验原版商会竞逐与简单电脑。',
      href: 'splendor-classic.html', color: 'amber', saveKey: 'boardgame-box-splendor-classic-v1'
    },
    {
      id: 'gomoku', name: '五子棋', english: 'GOMOKU',
      genre: '经典对弈', players: '1–2 人', duration: '5–15 分钟',
      summary: '黑白轮流落子，先连成五子获胜。可以和朋友对弈，也可以挑战简单电脑。',
      href: 'gomoku.html', color: 'amber', saveKey: GOMOKU_SAVE
    },
    {
      id: 'yinsh', name: '圈套棋', english: 'YINSH',
      genre: '经典对弈', players: '1–2 人', duration: '约 30 分钟',
      summary: '移环留子，跳跃翻色。连成五子后收回自己的环，先收回三个环获胜。',
      href: 'yinsh.html', color: 'jade', saveKey: 'boardgame-box-yinsh-v1'
    },
    {
      id: 'wonders', name: '七大奇迹', english: 'SEVEN WONDERS',
      genre: '卡牌策略', players: '3–7 人', duration: '30–45 分钟',
      summary: '三个时代里发展城市，与邻座贸易、竞逐军力，建造属于你的世界奇迹。',
      href: 'seven-wonders.html', color: 'royal', saveKey: WONDERS_SAVE
    },
    {
      id: 'puerto-rico', name: '波多黎各', english: 'PUERTO RICO',
      genre: '经营策略', players: '2–5 人', duration: '60–120 分钟',
      summary: '选择角色，经营种植园与城市，安排居民，将货物装船。23 种原版建筑与官方双人玩法。',
      href: 'puerto-rico.html', color: 'jade', saveKey: 'boardgame-box-puerto-rico-v1'
    },
    {
      id: 'burgundy', name: '勃艮第城堡', english: 'THE CASTLES OF BURGUNDY',
      genre: '经营策略', players: '2–4 人', duration: '60–90 分钟',
      summary: '双骰经营，六角领地。修筑城堡、沿河造船、发展城市与牧场，体验五阶段的连锁建造。',
      href: 'burgundy.html', color: 'burgundy', saveKey: 'boardgame-box-burgundy-v1'
    },
    {
      id: 'go', name: '围棋', english: 'GO',
      genre: '经典对弈', players: '1–2 人', duration: '15–90 分钟',
      summary: '从 9 路入门到 19 路对局，围地提子，停一手后数子定胜负。',
      href: 'go.html', color: 'jade', saveKey: 'boardgame-box-go-v1'
    },
    {
      id: 'xiangqi', name: '象棋', english: 'XIANGQI',
      genre: '经典对弈', players: '1–2 人', duration: '15–45 分钟',
      summary: '楚河汉界，车马炮齐上阵。与朋友对弈或挑战简单电脑。',
      href: 'xiangqi.html', color: 'vermillion', saveKey: 'boardgame-box-xiangqi-v1'
    },
    {
      id: 'chess', name: '国际象棋', english: 'CHESS',
      genre: '经典对弈', players: '1–2 人', duration: '15–60 分钟',
      summary: '白棋先行，布局攻防。支持常见特殊走法与简单电脑。',
      href: 'chess.html', color: 'slate', saveKey: 'boardgame-box-chess-v1'
    }
  ];
  let view = 'home';
  let filter = '全部';
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }
  function getSave(game) {
    try {
      const raw = localStorage.getItem(game.saveKey);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (game.id === 'splendor' || game.id === 'splendor-classic') {
        if (value.version !== 1 || !Array.isArray(value.players) || !Number.isInteger(value.current)) return null;
        return {
          label: value.phase === 'gameover' ? '已完成的对局' : '第 ' + (value.turn || 1) + ' 回合 · ' +
            String(value.players[value.current]?.name || '训练家') + ' 行动',
          finished: value.phase === 'gameover'
        };
      }
      if (game.id === 'wonders') {
        if (value.version !== 1 || !Array.isArray(value.players) || ![1, 2, 3].includes(value.age)) return null;
        return { label: value.phase === 'gameover' ? '已完成的对局' : '第 ' + value.age + ' 时代 · 第 ' +
          value.round + ' 轮 · ' + String(value.players[value.current]?.name || '文明') + ' 选牌',
        finished: value.phase === 'gameover' };
      }
      if (game.id === 'puerto-rico' || game.id === 'burgundy') {
        if (value.version !== 1 || value.kind !== game.id || !Array.isArray(value.players) || !Number.isInteger(value.current)) return null;
        return { label: value.phase === 'gameover' ? '已完成的对局' : '第 ' + value.round + ' 轮 · ' + String(value.players[value.current]?.name || '玩家') + ' 行动', finished: value.phase === 'gameover' };
      }
      if (game.id === 'yinsh') {
        if (value.version !== 1 || value.kind !== 'yinsh' || !Array.isArray(value.board) || value.board.length !== 85) return null;
        return { label: value.winner ? '已完成的对局' : value.phase === 'place' ? '开局放环 · 已放 ' + value.placed.reduce((a, b) => a + b, 0) + '/10 环' :
          '白方 ' + value.scores[0] + ' : ' + value.scores[1] + ' 黑方 · ' + (value.turn === 1 ? '白方' : '黑方') + '行动', finished: Boolean(value.winner) };
      }
      if (['go', 'xiangqi', 'chess'].includes(game.id)) {
        const length = game.id === 'go' ? value.size * value.size : game.id === 'xiangqi' ? 90 : 64;
        if (value.version !== 1 || value.kind !== game.id || !Array.isArray(value.board) || value.board.length !== length) return null;
        const side = game.id === 'go' ? ['黑棋', '白棋'] : game.id === 'xiangqi' ? ['红方', '黑方'] : ['白方', '黑方'];
        return { label: value.winner ? '已完成的对局' : value.phase === 'scoring' ? '等待确认数子' :
          '第 ' + ((value.history?.length || 0) + 1) + ' 手 · ' + side[value.turn - 1] + '行动', finished: Boolean(value.winner) };
      }
      if (value.version !== 1 || !Array.isArray(value.board) || value.board.length !== 225) return null;
      return {
        label: value.winner ? '已完成的对局' : '第 ' + ((value.history?.length || 0) + 1) + ' 手 · ' +
          (value.turn === 1 ? '黑棋' : '白棋') + '行动',
        finished: Boolean(value.winner)
      };
    } catch { return null; }
  }
  function cover(id, hero) {
    if (id === 'burgundy') return '<div class="cover cover-burgundy" aria-hidden="true"><span class="bu-cover-stars">✦</span><img class="bu-cover-map" src="assets/burgundy/original/estate-1.jpeg" alt=""><img class="bu-cover-castle" src="assets/burgundy/original/castle.jpeg" alt=""><span class="bu-cover-label">THE CASTLES OF BURGUNDY</span></div>';
    if (id === 'yinsh') return '<div class="cover cover-yinsh" aria-hidden="true"><span class="yn-cover-grid"></span><i class="yn-cover-ring one"></i><i class="yn-cover-ring two"></i><i class="yn-cover-ring three"></i><i class="yn-cover-marker a"></i><i class="yn-cover-marker b"></i><i class="yn-cover-marker c"></i><span class="yn-cover-label">Y I N S H</span></div>';
    if (id === 'puerto-rico') return '<div class="cover cover-puerto' + (hero ? ' hero-cover' : '') + '" aria-hidden="true"><img class="pr-cover-board" src="assets/puerto-rico/boards/island.png" alt=""><img class="pr-cover-ship" src="assets/puerto-rico/decoration/sailing_ship.png" alt=""><span class="pr-cover-label">PUERTO RICO</span></div>';
    if (id === 'splendor-classic') return '<div class="cover cover-splendor cover-base' + (hero ? ' hero-cover' : '') + '" aria-hidden="true">' +
      '<span class="cover-orbit orbit-a"></span><span class="cover-orbit orbit-b"></span>' +
      '<img class="cover-card cover-card-a" src="assets/base-splendor/cards/green-L1-01.webp" alt="">' +
      '<img class="cover-card cover-card-b" src="assets/base-splendor/cards/blue-L2-01.webp" alt="">' +
      '<img class="cover-card cover-card-c" src="assets/base-splendor/cards/white-L3-01.webp" alt="">' +
      '<span class="cover-spark spark-a">✦</span></div>';
    if (id === 'splendor') return '<div class="cover cover-splendor' + (hero ? ' hero-cover' : '') + '" aria-hidden="true">' +
      '<span class="cover-orbit orbit-a"></span><span class="cover-orbit orbit-b"></span>' +
      '<img class="cover-card cover-card-a" src="assets/cards/s1_01.webp" alt="">' +
      '<img class="cover-card cover-card-b" src="assets/cards/rr_08.webp" alt="">' +
      '<img class="cover-card cover-card-c" src="assets/cards/lg_08.webp" alt="">' +
      '<span class="cover-spark spark-a">✦</span><span class="cover-spark spark-b">✧</span></div>';
    if (id === 'wonders') return '<div class="cover cover-wonders' + (hero ? ' hero-cover' : '') + '" aria-hidden="true">' +
      '<span class="w-cover-sun"></span><img class="w-cover-card c1" src="assets/wonders/cards/academy.jpg" alt="">' +
      '<img class="w-cover-card c2" src="assets/wonders/cards/palace.jpg" alt="">' +
      '<img class="w-cover-card c3" src="assets/wonders/cards/arsenal.jpg" alt=""><span class="w-cover-laurel">✦</span></div>';
    if (id === 'go' || id === 'xiangqi' || id === 'chess') {
      const piece = id === 'go' ? '●' : id === 'xiangqi' ? '帥' : '♞';
      return '<div class="cover cover-classic cover-' + id + (hero ? ' hero-cover' : '') + '" aria-hidden="true"><span class="classic-cover-grid"></span><span class="classic-cover-ring"></span><span class="classic-cover-piece">' + piece + '</span><span class="classic-cover-caption">' + (id === 'go' ? 'GO' : id === 'xiangqi' ? 'XIANGQI' : 'CHESS') + '</span></div>';
    }
    return '<div class="cover cover-gomoku' + (hero ? ' hero-cover' : '') + '" aria-hidden="true">' +
      '<span class="cover-grid"></span><span class="stone stone-1"></span><span class="stone stone-2"></span>' +
      '<span class="stone stone-3"></span><span class="stone stone-4"></span><span class="stone stone-5"></span>' +
      '<span class="stone stone-6"></span><span class="stone stone-7"></span><span class="stone stone-8"></span></div>';
  }
  function gameCard(game) {
    const save = getSave(game);
    return '<article class="game-card ' + game.color + '" data-catalog-card="' + game.id + '">' +
      '<a class="card-cover-link" href="' + game.href + '" aria-label="打开' + esc(game.name) + '">' + cover(game.id) + '</a>' +
      '<div class="game-card-body"><div class="card-category"><span class="category-dot"></span>' + esc(game.genre) +
      '<span class="card-number">' + String(catalog.indexOf(game) + 1).padStart(2, '0') + ' / ' + String(catalog.length).padStart(2, '0') + '</span></div>' +
      '<h3>' + esc(game.name) + '</h3><div class="game-en">' + esc(game.english) + '</div>' +
      '<p>' + esc(game.summary) + '</p><div class="game-meta"><span>♟ ' + esc(game.players) + '</span><span>◷ ' +
      esc(game.duration) + '</span><span>' + (lanHttp ? '同网游玩' : '离线游玩') + '</span></div>' +
      '<div class="card-bottom"><a class="button button-primary" href="' + game.href + '">开始游戏 <span>↗</span></a>' +
      (multiplayer ? '<a class="button button-online" href="online.html?game=' + ({ splendor: 'pokemon', 'splendor-classic': 'splendor', 'puerto-rico': 'puerto' }[game.id] || game.id) + '">好友联机</a>' : '') +
      (save && !save.finished ? '<a class="button button-ghost" href="' + game.href + '?continue=1">继续对局</a>' : '') +
      '</div></div></article>';
  }
  function latestSave() {
    const entries = catalog.map(game => ({ game, save: getSave(game) })).filter(item => item.save && !item.save.finished);
    const last = localStorage.getItem('boardgame-box-last-played');
    entries.sort((a, b) => Number(b.game.id === last) - Number(a.game.id === last));
    return entries[0] || null;
  }
  function render() {
    const latest = latestSave();
    root.innerHTML = '<div class="hub-shell"><aside class="hub-sidebar">' +
      '<a class="hub-brand" href="index.html"><span class="hub-mark"><i></i><i></i><i></i><i></i></span>' +
      '<span><strong>桌游盒子</strong><small>BOARD GAME LOUNGE</small></span></a>' +
      '<div class="sidebar-section-label">探索</div><nav class="hub-nav" aria-label="桌游中心导航">' +
      '<button data-view="home" class="' + (view === 'home' ? 'active' : '') + '"><span>⌂</span> 首页</button>' +
      '<button data-view="library" class="' + (view === 'library' ? 'active' : '') + '"><span>▦</span> 游戏库 <b>' + String(catalog.length).padStart(2, '0') + '</b></button>' +
      (multiplayer ? '<a class="hub-online-link" href="online.html"><span>♟</span> 联机房间 <b>新</b></a>' : '') +
      '<button data-view="about" class="' + (view === 'about' ? 'active' : '') + '"><span>✧</span> 关于桌游盒子</button></nav>' +
      '<div class="sidebar-bottom"><div class="sidebar-mini-art"><span>♟</span><span>✦</span><span>●</span></div>' +
      '<strong>把朋友请到桌边</strong><p>' + (multiplayer ? '各自打开网页，同一房间游玩。' : '和朋友共用一台设备，轮流操作。') + '</p><small>桌游盒子 0.9 预览版' + (multiplayer ? '' : ' · 单机／同屏') + '</small></div></aside>' +
      '<main class="hub-main"><header class="hub-header"><div class="breadcrumb">桌游盒子 <span>/</span> ' +
      (view === 'library' ? '游戏库' : view === 'about' ? '关于' : '首页') + '</div><div class="header-right">' +
      '<span class="online-dot"></span> ' + (lanHttp ? '本地局域网' : '支持离线游玩') + ' <span class="header-line"></span><span class="user-badge">玩家</span></div></header>' +
      (view === 'about' ? renderAbout() : view === 'library' ? renderLibrary() : renderHome(latest)) +
      '<footer>桌游盒子 <span>·</span> 好游戏，随时开始 <span class="footer-right">' + catalog.length + ' 款可玩游戏</span></footer>' +
      '</main></div>';
  }
  function renderHome(latest) {
    const splendor = catalog[0];
    const splendorSave = getSave(splendor);
    return '<div class="page-content"><section class="welcome"><div><div class="eyebrow"><span class="eyebrow-line"></span> WELCOME TO THE TABLE</div>' +
      '<h1>今晚，<em>开一局</em>好游戏。</h1><p>挑一款喜欢的桌游，叫上朋友，或者和电脑练练手。所有游戏都在这里，即点即玩。</p></div>' +
      '<div class="welcome-stats"><div><strong>' + String(catalog.length).padStart(2, '0') + '</strong><span>可玩游戏</span></div><div><strong>' + (lanHttp ? '同网' : '离线') + '</strong><span>' + (lanHttp ? '本地访问' : '安装后可用') + '</span></div></div></section>' +
      '<section class="feature-card"><div class="feature-copy"><div class="feature-label"><span>本周精选</span><b>01 / ' + String(catalog.length).padStart(2, '0') + '</b></div>' +
      '<div class="feature-kicker">POKÉMON SPLENDOR</div><h2>璀璨宝石<br><i>宝可梦版</i></h2>' +
      '<p>从一枚精灵球开始，捕捉伙伴、组建队伍。90 张卡牌，一场充满收集与进化的训练家对决。</p>' +
      '<div class="feature-tags"><span>策略卡牌</span><span>2–4 人</span><span>支持简单电脑</span></div>' +
      '<div class="feature-actions"><a class="button button-gold" href="splendor.html">进入游戏 <span>↗</span></a>' +
      (splendorSave && !splendorSave.finished ? '<a class="feature-resume" href="splendor.html?continue=1">继续上次对局 →</a>' : '') +
      '</div></div>' + cover('splendor', true) + '</section>' +
      (latest ? '<section class="resume-strip"><div class="resume-symbol">↺</div><div><small>继续上次对局</small><strong>' +
      esc(latest.game.name) + '</strong><span>' + esc(latest.save.label) + '</span></div><a href="' +
      latest.game.href + '?continue=1">接着玩 <span>→</span></a></section>' : '') +
      '<div class="section-heading"><div><div class="eyebrow">THE COLLECTION</div><h2>选择你的下一局</h2></div>' +
      '<button class="text-button" data-view="library">查看全部游戏 <span>↗</span></button></div>' +
      '<div class="game-cards">' + catalog.map(gameCard).join('') + '</div>' +
      '<section class="coming-banner"><span class="coming-icon">＋</span><div><strong>游戏库会继续扩充</strong>' +
      '<p>新的桌游将作为独立游戏加入，存档与玩法各自保存。</p></div><span class="coming-decoration">✦ &nbsp; ◇ &nbsp; ✦</span></section></div>';
  }
  function renderLibrary() {
    const visible = filter === '全部' ? catalog : catalog.filter(game => game.genre === filter);
    return '<div class="page-content"><section class="library-intro"><div class="eyebrow">YOUR GAME SHELF</div>' +
      '<h1>游戏库</h1><p>' + catalog.length + ' 款游戏，多种节奏。找到适合这一局的玩法。</p></section>' +
      '<div class="library-tools"><div class="filter-list" aria-label="筛选游戏">' +
      ['全部', '卡牌策略', '经营策略', '经典对弈'].map(name => '<button data-filter="' + esc(name) + '" class="' +
        (filter === name ? 'active' : '') + '">' + esc(name) + '</button>').join('') +
      '</div><span>共 ' + visible.length + ' 款游戏</span></div>' +
      '<div class="game-cards">' + visible.map(gameCard).join('') + '</div></div>';
  }
  function renderAbout() {
    return '<div class="page-content"><section class="library-intro"><div class="eyebrow">ABOUT THE LOUNGE</div>' +
      '<h1>把喜欢的桌游，<br>放进同一个盒子。</h1><p>桌游盒子可在电脑、平板和手机浏览器里使用，与朋友或电脑随时开局。</p></section>' +
      '<div class="about-grid"><article><span>01</span><h2>各自独立</h2><p>每款游戏有自己的规则、界面和存档。退出游戏后，随时可以从首页继续。</p></article>' +
      '<article><span>02</span><h2>电脑也能上桌</h2><p>每款游戏均提供一档简单电脑，适合练习和试玩。</p></article>' +
      '<article><span>03</span><h2>本地游玩</h2><p>对局存档保存在当前设备。' + (lanHttp ? '电脑保持网页服务运行时，同一局域网设备可以游玩。' : '安装网页应用后可离线游玩。') + '</p></article></div>' +
      '<section class="install-guide"><div class="eyebrow">PLAY ANYWHERE</div><h2>' + (lanHttp ? '在本地网络游玩' : '在你的设备上安装') + '</h2><p>' +
      (lanHttp ? '电脑和手机、平板连接同一个局域网，保持电脑上的网页服务运行即可游玩。当前局域网 HTTP 地址不提供离线缓存；对局仍保存在各自设备。' :
        'Windows、Mac 和 Android 可在浏览器菜单里选择“安装应用”；iPad 在 Safari 中点击“分享”→“添加到主屏幕”。首次打开会缓存游戏资源，之后可以离线游玩。存档只保存在当前设备。') +
      '</p></section>' +
      '<button class="button button-primary about-back" data-view="library">去游戏库 <span>↗</span></button></div>';
  }
  document.addEventListener('click', event => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) { view = viewButton.dataset.view; render(); window.scrollTo(0, 0); return; }
    const filterButton = event.target.closest('[data-filter]');
    if (filterButton) { filter = filterButton.dataset.filter; render(); }
  });
  render();
})();
