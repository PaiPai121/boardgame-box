(function () {
  'use strict';
  const D = window.BurgundyData, root = document.getElementById('burgundy'), overlay = document.getElementById('bu-overlay');
  const Motion = window.BoardMotion || { watch: () => null, aiDelay: () => 450, cancel() {} };
  const Room = window.BoardRoom || { active: false, wrap: engine => engine };
  const KEY = 'boardgame-box-burgundy-v1', AI_NAMES = ['菲利普','玛格丽特','查理','伊莎贝尔'];
  const SEAT_COLORS = ['#c8a264','#c17781','#7ca4bc','#92ad7e'];
  const CATEGORY = { regions: '区域完成', colors: '颜色奖励', animals: '畜牧', goods: '货物出售', buildings: '建筑', knowledge: '知识', remaining: '剩余资源' };
  let E = window.BurgundyEngine, state = null, saved = null, screen = 'setup', view = 0, count = 2;
  let selectedDie = 0, selectedTile = null, buyMode = false, modal = '', replacing = null;
  let collectDepots = [0], collectTypes = [], timer, toastTimer, aiError = '', started = Date.now();
  const seats = Array.from({ length: 4 }, (_, i) => ({ name: i ? AI_NAMES[i - 1] + '（简单）' : '玩家', ai: Boolean(i), custom: false }));
  const tooltip = document.createElement('div'); tooltip.className = 'bu-tooltip'; tooltip.hidden = true; tooltip.id = 'bu-tooltip'; tooltip.setAttribute('role', 'tooltip'); document.body.appendChild(tooltip);
  let tipAnchor = null, pinned = false;
  E = Motion.watch({ game: 'burgundy', engine: E, state: () => state, methods: ['play'] }) || E;
  E = Room.wrap(E, 'burgundy');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const tip = text => ' data-bu-tip="' + esc(text) + '"';
  const info = text => '<button class="bu-info-button" data-info' + tip(text) + ' aria-label="说明：' + esc(text) + '">?</button>';
  const icon = (kind, text) => '<span class="bu-icon ' + kind + '" aria-hidden="true">' + ({ vp:'✦', silver:'S', worker:'工' }[kind]) + '</span><span class="bu-sr">' + (text || '') + '</span>';
  const sum = list => list.reduce((a, b) => a + b, 0);
  function button(label, attributes, reason = '', primary = false) {
    return '<button ' + attributes + (primary ? ' class="bu-primary"' : '') + (reason ? ' aria-disabled="true" data-reason="' + esc(reason) + '"' + tip(reason) : '') + '>' + label + '</button>';
  }
  function dice(value, used = false) {
    const spots = {1:[[20,20]],2:[[11,11],[29,29]],3:[[11,11],[20,20],[29,29]],4:[[11,11],[29,11],[11,29],[29,29]],5:[[11,11],[29,11],[20,20],[11,29],[29,29]],6:[[11,10],[29,10],[11,20],[29,20],[11,30],[29,30]]};
    return '<svg class="bu-die-face' + (used ? ' spent' : '') + '" viewBox="0 0 40 40" role="img" aria-label="' + value + ' 点' + (used ? '，已使用' : '') + '"><rect x="1" y="1" width="38" height="38" rx="7"/>' + (spots[value] || []).map(([x,y]) => '<circle cx="' + x + '" cy="' + y + '" r="3"/>').join('') + '</svg>';
  }
  function art(id, motion = true) {
    const t = typeof id === 'object' ? id : D.tileById[id];
    return '<span class="bu-art ' + t.type + (t.number === 22 ? ' symbol' : '') + '" style="--tile-color:' + D.colors[t.type] + '"><img' + (motion ? ' data-motion-art' : '') + ' src="' + D.art(t) + '" alt="' + esc(D.name(t)) + '">' + (t.type === 'animal' ? '<span class="bu-count-mark">' + t.count + '</span>' : '') + '</span>';
  }
  const goodArt = good => '<img class="bu-good-img" src="assets/burgundy/goods/goods' + (good + 1) + '.jpg" alt="' + (good + 1) + ' 号货物">';
  function goodsLine(goods, prefix = '') {
    return goods.some(n => n) ? goods.map((n, good) => n ? '<span class="bu-good-mini"' + (prefix ? ' data-motion-key="' + prefix + good + '"' : '') + tip((good + 1) + ' 号货物：' + n + ' 块。出售需使用相同点数的骰子，每次必须出售这种货物的全部库存。') + '>' + goodArt(good) + '×' + n + '</span>' : '').join('') : '<span class="bu-muted">暂无货物</span>';
  }
  function toast(message) {
    let node = document.querySelector('.bu-toast'); if (!node) { node = document.createElement('div'); node.className = 'bu-toast'; node.setAttribute('role','status'); document.body.appendChild(node); }
    node.textContent = message; node.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => node.hidden = true, 4200);
  }
  function save() {
    if (Room.active || !state) return;
    E.validate(state); localStorage.setItem(KEY, JSON.stringify(state)); localStorage.setItem('boardgame-box-last-played','burgundy'); saved = structuredClone(state);
  }
  try { const data = JSON.parse(localStorage.getItem(KEY)); if (data) { E.validate(data); saved = data; } } catch (error) { console.warn('勃艮第城堡存档无法读取', error); }
  function header() {
    return '<header class="bu-top"><a href="index.html">← 桌游中心</a><div class="bu-brand">勃艮第城堡<small>THE CASTLES OF BURGUNDY</small></div><nav class="bu-top-actions" aria-label="游戏菜单">' + button('规则与图鉴','data-action="rules"') + button('保存','data-action="save"', state ? '' : '开始对局后可保存。') + button('新对局','data-action="menu"') + '</nav></header>';
  }
  function setup() {
    root.innerHTML = header() + '<main class="bu-setup"><section class="bu-hero"><div class="bu-eyebrow">骰子、河流与繁盛的领地</div><h1>勃艮第城堡<br><em>让每一颗骰子<br>成为领地的未来</em></h1><p>沿河造船，修筑城堡，让牧场与城市逐步连成一片。把握五个阶段的机会，建立属于你的繁盛庄园。</p><p class="bu-small">2–4 人 · 约 60–90 分钟 · 一档简单电脑</p><div class="bu-hero-art"><img class="bu-hero-map" src="assets/burgundy/original/estate-1.jpeg" alt="1 号标准领地"><img class="bu-hero-tile" src="assets/burgundy/original/castle.jpeg" alt="原版城堡地块"><img class="bu-hero-tile two" src="assets/burgundy/original/ship.jpeg" alt="原版船舶地块"></div></section><section class="bu-setup-panel"><div class="bu-eyebrow">Burgundy · 15th century</div><h2>创建对局</h2><div class="bu-count"><label for="bu-count">参与人数</label><select id="bu-count" data-count>' + [2,3,4].map(n => '<option value="' + n + '"' + (count === n ? ' selected' : '') + '>' + n + ' 人</option>').join('') + '</select></div>' + seats.slice(0,count).map((seat,i) => '<div class="bu-seat-input"><b>' + (i+1) + 'P</b><input data-name="' + i + '" maxlength="20" aria-label="玩家 ' + (i+1) + ' 名称" value="' + esc(seat.name) + '"><select data-ai="' + i + '" aria-label="玩家 ' + (i+1) + ' 类型"><option value="human"' + (!seat.ai ? ' selected' : '') + '>真人</option><option value="ai"' + (seat.ai ? ' selected' : '') + '>电脑 · 简单</option></select></div>').join('') + '<div class="bu-setup-buttons">' + button('建立领地 →','data-action="start"','',true) + (saved ? button('继续上次对局','data-action="continue"') : '') + '</div><p class="bu-small">2011 经典基础规则 · 1 号标准领地<br>完整 26 种知识、8 种建筑。可混合真人与电脑，所有信息公开，对局自动保存在当前设备。</p></section></main>';
  }
  function seat(p,i) {
    return '<article class="bu-seat' + (state.phase !== 'gameover' && i === state.current ? ' active' : '') + (i === view ? ' viewing' : '') + '" style="--seat-color:' + SEAT_COLORS[i] + '" data-motion-player="' + i + '"><div class="bu-seat-head"><b>' + (i+1) + 'P · ' + esc(p.name) + '</b><span>' + (state.phase !== 'gameover' && i === state.current ? '正在行动' : p.ai ? '简单电脑' : '真人') + '</span></div><div class="bu-seat-stats"><span class="bu-stat"' + tip('已获得的胜利分：' + p.vp + '。点击“查看领地”可看每笔得分与终局预估。') + '>' + icon('vp') + '<b>' + p.vp + '</b></span><span class="bu-stat" data-motion-key="silver:' + i + '"' + tip('银币：现有 ' + p.silver + '。每回合可花 2 枚额外买一块黑市地块；矿山与售货提供银币。终局每枚 1 分。') + '>' + icon('silver') + p.silver + '</span><span class="bu-stat" data-motion-key="workers:' + i + '"' + tip('工人：现有 ' + p.workers + '。每名可将一颗骰子调整一点，1 与 6 可循环；知识 8 提升为最多两点。终局每两名 1 分。') + '>' + icon('worker') + p.workers + '</span><span class="bu-mini-dice">' + p.dice.map(d => dice(d.value,d.used)).join('') + '</span></div><div class="bu-goods-line">' + goodsLine(p.goods,'wallet:' + i + ':') + '</div><div class="bu-seat-foot"><span>领地 ' + p.built.length + '/37 · 顺位轨 ' + p.order + ' 格</span>' + button('查看领地','data-view="' + i + '"') + '</div></article>';
  }
  function banner() {
    const p = state.players[state.current];
    return '<section class="bu-banner"><div><div class="bu-eyebrow">阶段 ' + 'ABCDE'[state.era-1] + ' · 第 ' + state.round + ' / 5 轮 · 共 25 轮</div><h1>' + (state.phase === 'gameover' ? '领地的荣耀' : '轮到 ' + (state.current+1) + 'P · ' + esc(p.name)) + '</h1><p>' + (state.phase === 'gameover' ? '五个阶段已结束。矿山最后一次收入、剩余资源与知识奖励均已计入，点击玩家查看完整得分明细。' : state.pending.length ? esc(state.pending[0].label) + '。完成后继续本回合，普通骰子不会被这项奖励消耗。' : '选择一颗骰子：从对应货站取地块，或将暂存地块放到对应点数的同色格。工人可调整点数。') + '</p></div><div class="bu-progress">' + [1,2,3,4,5].map(n => '<span class="bu-era' + (state.era === n ? ' active' : n < state.era ? ' done' : '') + '"' + tip('阶段 ' + 'ABCDE'[n-1] + '：每个完成区域额外获得 ' + (12-2*n) + ' 分。') + '>' + 'ABCDE'[n-1] + '<small>区域 +' + (12-2*n) + '</small></span>').join('') + '<div class="bu-white"' + tip('白骰仅决定本轮货物进入哪个编号货站，不能用于玩家行动，也不能用工人调整。本轮 ' + (state.delivered+1) + ' 号货物进入 ' + state.whiteDie + ' 号货站。') + '>' + dice(state.whiteDie) + '<span>货物到站<br>' + state.whiteDie + ' 号货站</span></div></div></section>';
  }
  function dieIndex() { return state.pending.length ? -1 : selectedDie; }
  function actorReason() {
    return state.phase === 'gameover' ? '本局已结束。' : Room.active && !Room.canAct ? Room.reason : state.players[state.current].ai ? '现在由电脑行动。' : '';
  }
  function costText(q) { return q.cost ? q.cost + ' 工人调点' : q.free ? '知识免费调点' : state.pending.length ? '奖励 · 免骰子' : '无需工人'; }
  function selectedAction(type, extra = {}) { return { type, die: dieIndex(), ...extra }; }
  function resetChoices() {
    selectedDie = state?.players[state.current].dice.findIndex(d => !d.used) ?? 0;
    if (selectedDie < 0) selectedDie = 0;
    selectedTile = state?.players[state.current].reserved[0] || null; buyMode = false; replacing = null;
    collectDepots = [0]; collectTypes = [];
    if (state?.pending[0]?.type === 'collect') {
      const suggested = E.chooseAI(state); collectDepots = suggested.depots; collectTypes = suggested.types;
    }
  }
  function collectPanel() {
    const p = state.players[state.current], room = 3-p.goods.filter(n=>n).length;
    const available = Array.from({length:6},(_,g)=>collectDepots.reduce((n,d)=>n+state.goodsDepots[d][g],0));
    const newTypes = available.map((n,g)=>n&&!p.goods[g]?g:-1).filter(g=>g>=0);
    const action = {type:'collect',depots:collectDepots,types:collectTypes}, q=E.quote(state,action);
    const total=available.reduce((n,x,g)=>n+(p.goods[g]||collectTypes.includes(g)?x:0),0);
    return '<p>船舶已推进顺位轨一格。选择' + (E.has(p,5)?'一个货站，或两个相邻货站':'一个货站') + '收货；已有的货物种类自动收取，新种类最多再选 ' + room + ' 种。</p><div class="bu-collect-depots">' + state.goodsDepots.map((goods,d)=>'<button data-collect-depot="'+d+'" class="'+(collectDepots.includes(d)?'selected':'')+'" aria-pressed="'+collectDepots.includes(d)+'">'+(d+1)+' 号 · '+sum(goods)+' 块</button>').join('') + '</div>' + (newTypes.length ? '<div class="bu-collect-types">'+newTypes.map(g=>'<button data-collect-type="'+g+'" class="'+(collectTypes.includes(g)?'selected':'')+'" aria-pressed="'+collectTypes.includes(g)+'">'+goodArt(g)+' '+(g+1)+'号 ×'+available[g]+'</button>').join('')+'</div>' : '') + '<div class="bu-command-row">' + button('确认收取 '+total+' 块','data-action="collect"',actorReason()||q.reason,true) + '<span class="bu-small">未能放入货仓的货物留在原货站</span></div>';
  }
  function controls() {
    const p=state.players[state.current], pending=state.pending[0], reason=actorReason();
    if (state.phase==='gameover') return '';
    if (Room.active&&!Room.canAct) return '<section class="bu-controls"><h3>'+esc(Room.reason)+'</h3><p class="bu-small">可以查看所有人的领地、暂存地块、知识与计分明细。</p></section>';
    if (p.ai) return '<section class="bu-controls"><div class="bu-ai"><span class="bu-ai-dots" aria-hidden="true"><i></i><i></i><i></i></span><b>'+esc(p.name)+' 正在行动</b></div><p class="bu-small">'+(pending?esc(pending.label):'正在评估区域、骰子与货站地块')+' · 已执行 '+state.moves+' 次行动</p>'+(aiError?'<p class="bu-error">电脑行动中断：'+esc(aiError)+'</p>'+button('重试电脑','data-action="retry-ai"'):'')+'</section>';
    const workerQ=E.quote(state,selectedAction('workers'));
    return '<section class="bu-controls"><div class="bu-control-head"><div class="bu-dice" role="group" aria-label="选择本次使用的骰子">'+p.dice.map((d,i)=>'<button class="bu-die-button'+(!pending&&selectedDie===i?' selected':'')+(d.used?' spent':'')+'" data-die="'+i+'" aria-pressed="'+(!pending&&selectedDie===i)+'"'+(d.used?' aria-disabled="true" data-reason="这颗骰子本回合已经用过。"'+tip('这颗骰子本回合已经用过。'):'')+'>'+dice(d.value,d.used)+'<small>骰子 '+(i+1)+'<br>'+(d.used?'已使用':pending?'奖励结束后使用':'可使用')+'</small></button>').join('')+'</div><span class="bu-small">'+icon('worker')+' 可用 '+p.workers+' 名</span></div>'+(pending?'<div class="bu-bonus"><h3>'+esc(pending.label)+'</h3>'+(pending.type==='collect'?collectPanel():'<p>'+(pending.type==='take'?'在右侧货站选择符合奖励的地块；暂存满时可以替换。':pending.type==='place'?'选择暂存地块，再选择领地上的同色相邻空格。忽略骰子点数。':pending.type==='sell'?'在下方货仓中选择一种货物，免费出售全部库存。':'这次额外行动可取地块、放地块、售货或领取工人，点数任意。')+'</p><div class="bu-command-row">'+(pending.type==='castle'?button('领取 '+(E.has(p,14)?4:2)+' 名工人','data-action="workers"',reason||workerQ.reason):button('放弃本次建筑奖励','data-action="skip"',reason))+'</div>')+'</div>':'<div class="bu-command-row">'+button('领取 '+(E.has(p,14)?4:2)+' 名工人'+(E.has(p,13)?'＋1 银币':''),'data-action="workers"',reason||workerQ.reason)+'<button data-action="buy-mode" class="'+(buyMode?'active':'')+'" aria-pressed="'+buyMode+'">'+(buyMode?'银币购买中 · 点此返回取地块':'银币购买 · 2 枚')+'</button>'+button('结束回合 →','data-action="end"',reason||E.quote(state,{type:'end'}).reason,true)+'</div><p class="bu-control-hint">'+(buyMode?'购买不耗骰子，每回合一次。'+(E.has(p,6)?'知识 6：可买任意货站。':'请选择黑市地块。'):'取地块：骰子对应货站。放地块：先选暂存，再点领地高亮格。')+' 两颗骰子用完后，仍可购买，再结束回合。</p>')+'</section>';
  }
  function reserve(p) {
    return '<div class="bu-panel-heading"><h3>地块暂存区</h3><small>'+p.reserved.length+'/3 · 取入后需另用行动放置</small></div><div class="bu-reserve">'+Array.from({length:3},(_,i)=>{
      const id=p.reserved[i];
      return id?'<div class="bu-reserve-item'+(id===selectedTile&&view===state.current?' selected':'')+'" data-motion-key="card:'+id+'"><button data-reserve="'+id+'"'+tip(D.name(id)+'：'+D.description(id))+' aria-pressed="'+(id===selectedTile&&view===state.current)+'">'+art(id)+'<b>'+esc(D.name(id))+'</b><small>'+(view===state.current?'点击选择放置':'公开暂存地块')+'</small></button></div>':'<div class="bu-reserve-item"><button data-empty-reserve="'+i+'"'+tip('暂存空位：从编号货站取得或从黑市购买的地块先放在这里。')+'><span class="bu-muted">＋</span><small>空位 '+(i+1)+'</small></button></div>';
    }).join('')+'</div>';
  }
  function estate(p) {
    const own=view===state.current, reason=actorReason();
    return '<div class="bu-estate-shell"><div class="bu-estate" role="group" aria-label="'+esc(p.name)+'的 1 号领地">'+D.cells.map(c=>{
      const id=p.estate[c.index], region=D.regions[c.region], action=selectedAction('place',{tile:selectedTile,cell:c.index});
      const q=own&&selectedTile?E.quote(state,action):{valid:false,reason:'先从自己的暂存区选择要放置的地块。',cost:0};
      const title=id?D.name(id)+'：'+D.description(id)+'\n所属区域 '+region.cells.length+' 格'+(p.completed.includes(c.region)?'，已完成。':'。'):
        D.names[c.type]+'空格 · 需要 '+c.die+' 点\n'+(own?(q.valid?'放置'+D.name(selectedTile)+'：'+costText(q):q.reason):'正在查看其他玩家的公开领地。')+'\n这片区域 '+region.cells.length+' 格，填满得 '+D.regionPoints[region.cells.length]+' 规模分，再加当前阶段 '+(12-state.era*2)+' 分。';
      return '<button class="bu-hex '+(id?'filled':'empty')+(own&&!reason&&q.valid?' valid':'')+'" style="--tile-color:'+D.colors[c.type]+';left:'+(50+(c.q+c.r/2)*100/7)+'%;top:'+(50+c.r*150/11)+'%" data-hex="'+c.index+'"'+(id?' data-motion-key="card:'+id+'"':'')+tip(title)+' aria-label="'+esc((c.r+4)+' 排 '+(c.q+4)+' 列，'+title)+'">'+(id?art(id)+'<span class="bu-built-label">'+esc(D.name(id))+'</span>':'<span class="bu-type-mark">'+D.names[c.type]+'</span><span class="bu-die-number">'+c.die+'</span>'+(own&&q.valid?'<span class="bu-cost-mark">'+(q.cost?q.cost+' 工人':'免费调点')+'</span>':''))+'</button>';
    }).join('')+'</div></div><div class="bu-board-caption"><span>1 号标准领地 · '+p.built.length+'/37</span><span>同色 · 骰子匹配 · 与已有地块相邻</span></div><div class="bu-regions">'+D.regions.map(r=>'<span class="bu-region'+(p.completed.includes(r.index)?' done':'')+'" style="--tile-color:'+D.colors[r.type]+'"'+tip(r.cells.length+' 格'+D.names[r.type]+'区域。当前已放 '+r.cells.filter(i=>p.estate[i]).length+' 块；'+(p.completed.includes(r.index)?'已完成，起始城堡不计分。':'完成可得 '+D.regionPoints[r.cells.length]+'＋'+(12-state.era*2)+' 分。'))+'>'+D.names[r.type]+' '+r.cells.filter(i=>p.estate[i]).length+'/'+r.cells.length+(p.completed.includes(r.index)?' ✓':'')+'</span>').join('')+'</div>';
  }
  function sales(p) {
    return '<div class="bu-panel-heading" style="margin-top:22px"><h3>货仓与售货</h3><small>最多三种 · 每种数量不限</small></div><div class="bu-sell-grid">'+p.goods.map((n,good)=>{
      const a=selectedAction('sell',{good}),q=E.quote(state,a), reason=actorReason()||(view!==state.current?'这是其他玩家的货仓。':q.reason);
      return '<div class="bu-sell"><div class="bu-sell-head">'+goodArt(good)+'<b>'+n+' 块</b><span class="bu-small">'+(good+1)+' 号</span></div><small>已售 '+p.sold[good]+' 块'+(n?' · 本次 +'+n*state.players.length+' 分':'')+'</small>'+button('出售全部'+(q.valid?' · '+(q.cost?q.cost+' 工人':'免调点'):''),'data-sell="'+good+'"',reason)+'</div>';
    }).join('')+'</div>';
  }
  function tileAction(id,depot) {
    const p=state.players[state.current], a=depot===6||buyMode?{type:'buy',depot,tile:id}:selectedAction('take',{depot,tile:id});
    if (p.reserved.length===3) a.discard=p.reserved[0];
    return a;
  }
  function tileButton(id,depot) {
    const t=D.tileById[id],a=tileAction(id,depot),q=E.quote(state,a),reason=actorReason()||q.reason;
    return '<button class="bu-tile-button" data-take="'+id+'" data-depot="'+depot+'" data-motion-key="card:'+id+'"'+(reason?' aria-disabled="true" data-reason="'+esc(reason)+'"':'')+tip(D.name(id)+'：'+D.description(id)+'\n'+(reason?'当前不可取：'+reason:a.type==='buy'?'购买消耗 2 银币，不耗骰子。':'取入暂存区：'+costText(q))+(state.players[state.current].reserved.length===3?'\n暂存区已满，取入前选择弃置一块。':''))+'>'+art(t)+'<b>'+esc(D.name(t))+'</b><small>'+(reason?'悬停 / 点击看原因':a.type==='buy'?'2 银币 · 不耗骰子':costText(q))+'</small>'+(q.valid&&state.players[state.current].reserved.length===3?'<span class="bu-discard-badge">需替换 1 块</span>':'')+'</button>';
  }
  function market() {
    const p=state.players[state.current];
    return '<section class="bu-panel bu-market"><div class="bu-panel-heading"><div><div class="bu-eyebrow">六个货站 · 每阶段补充</div><h2>公共供给</h2></div><small>'+state.players.length+' 人配置</small></div><p class="bu-small">'+(state.pending[0]?.type==='take'?'当前建筑奖励可免费取得相应颜色的地块。':buyMode?'正在用银币购买；结束前可随时返回骰子取地块。':'用编号匹配的骰子取一块地块。船舶收货可选择任意货站。')+'</p><div class="bu-depots">'+state.depots.map((depot,d)=>'<article class="bu-depot'+(!depot.length?' empty':'')+'" data-depot-view="'+d+'"><div class="bu-depot-head"><h3>'+dice(d+1)+' '+(d+1)+' 号货站</h3><small>余 '+depot.length+' 块</small></div><div class="bu-depot-tiles">'+(depot.length?depot.map(id=>tileButton(id,d)).join(''):'<div class="bu-empty-message">地块已取完<br>下个阶段补充</div>')+'</div><div class="bu-depot-goods" data-motion-key="goods-depot:'+d+'">'+goodsLine(state.goodsDepots[d])+'</div></article>').join('')+'</div><section class="bu-black"><div class="bu-depot-head"><h3>✦ 黑市</h3><small>'+ (state.buyUsed?'本回合已购买':p.silver<2?'还差 '+(2-p.silver)+' 枚银币':'本回合可购买一次')+'</small></div><p class="bu-small">2 枚银币买一块，不耗骰子。可在两次骰子行动之前、之间或之后购买。</p><div class="bu-depot-tiles">'+(state.black.length?state.black.map(id=>tileButton(id,6)).join(''):'<div class="bu-empty-message">本阶段黑市已经售罄</div>')+'</div></section><div class="bu-phase-goods"><small>本阶段待投放货物</small>'+state.phaseGoods.map(goodArt).join('')+(state.phaseGoods.length?'':'<span class="bu-small">全部已到站</span>')+'</div><div class="bu-claims"><h3>颜色完成奖励 '+info('填满整块领地上某一种颜色的所有格子时，第一位获得人数＋3 分，第二位获得人数分。完成单个区域仍另有规模分与阶段分。')+'</h3><div class="bu-claim-list">'+D.types.map(type=>'<div class="bu-claim" style="--tile-color:'+D.colors[type]+'">'+D.names[type]+'<small>首 '+(state.players.length+3)+' 分 · '+(state.colorClaims[type][0]!=null?esc(state.players[state.colorClaims[type][0]].name):'未领取')+'<br>次 '+state.players.length+' 分 · '+(state.colorClaims[type][1]!=null?esc(state.players[state.colorClaims[type][1]].name):'未领取')+'</small></div>').join('')+'</div></div></section>';
  }
  function scorePanel(p) {
    const b=E.scoreBreakdown(p,state.phase==='gameover'),total=state.phase==='gameover';
    return '<section class="bu-panel"><div class="bu-score-title"><div><div class="bu-eyebrow">每一分，都有来处</div><h2>'+esc(p.name)+' · 得分明细</h2></div><strong class="bu-score-total">'+p.vp+'<small style="font:12px system-ui"> 分</small></strong></div><div class="bu-score-summary">'+Object.entries(CATEGORY).map(([id,name])=>'<div><b>'+b.categories[id]+'</b><small>'+name+'</small></div>').join('')+'</div><div class="bu-ledger">'+(p.ledger.length?[...p.ledger].reverse().map(entry=>'<div class="bu-ledger-row"><span>'+esc(entry.text)+'<small>'+(entry.final?'终局结算':'阶段 '+'ABCDE'[entry.era-1]+' · 第 '+entry.round+' 轮')+'</small></span><b>＋'+entry.points+'</b></div>').join(''):'<p class="bu-empty-note">还没有得分。完成区域、放置畜牧、售货或修建瞭望塔即可获得分数。</p>')+'</div>'+(total?'':'<details class="bu-final-estimate"><summary>按当前领地结算：终局奖励预估 ＋'+b.projected+' 分 · 合计 '+b.estimatedTotal+'</summary>'+b.estimates.map(e=>'<div class="bu-ledger-row"><span>'+esc(e.text)+'</span><b>＋'+e.points+'</b></div>').join('')+'<p class="bu-small">这是当前资源和知识的预估，尚未计入总分；第五阶段结束后正式结算。</p></details>')+'<h3 style="margin-top:22px">已建地块与知识 · '+p.built.length+' 块</h3><div class="bu-inventory">'+p.built.map(id=>'<article class="bu-owned">'+art(id,false)+'<b>'+esc(D.name(id))+'</b><p>'+esc(D.description(id))+'</p></article>').join('')+'</div></section>';
  }
  function chronicle() {
    return '<section class="bu-panel"><div class="bu-eyebrow">领地纪事</div><h2>行动记录</h2><div class="bu-order"><small>下一轮顺序 · 同格时后到的在前</small>'+E.turnOrder(state).map((i,n)=>'<span>'+(n+1)+'. '+esc(state.players[i].name)+' · '+state.players[i].order+' 格</span>').join('')+'</div><ol class="bu-chronicle">'+[...state.log].reverse().slice(0,60).map(text=>'<li>'+esc(text)+'</li>').join('')+'</ol><p class="bu-small" style="margin:15px 0 0">本局已执行 '+state.moves+' 次行动 · 自动保存于当前设备'+(Room.active?'的房主服务':'')+'</p></section>';
  }
  function game() {
    const p=state.players[view];
    root.innerHTML=header()+'<main class="bu-main">'+banner()+(state.phase==='gameover'?'<section class="bu-winner"><h2>✦ '+esc(state.players[state.winners[0]].name)+' 获胜</h2><p>得分相同时，先比较领地空格数，空格较多者获胜；仍相同时，顺位较后者获胜。'+button('再来一局','data-action="menu"')+'</p></section>':'')+'<section class="bu-players" style="--players:'+state.players.length+'" aria-label="所有玩家">'+state.players.map(seat).join('')+'</section><div class="bu-layout"><section class="bu-panel bu-left"><div class="bu-panel-heading"><div><div class="bu-eyebrow">属于你的勃艮第</div><h2>'+esc(p.name)+'的领地</h2></div><small>标准领地 01</small></div>'+(view!==state.current&&state.phase!=='gameover'?'<div class="bu-view-banner">正在查看 '+(view+1)+'P 的公开信息'+button('回到当前玩家','data-view="'+state.current+'"')+'</div>':'')+controls()+reserve(p)+estate(p)+sales(p)+'</section>'+market()+'</div><div class="bu-bottom">'+scorePanel(p)+chronicle()+'</div></main>';
  }
  function rules() {
    return '<h3>如何开始</h3><p>采用 2011 经典基础规则与 1 号标准领地，不混用 2019 版效果。每人从中央城堡开始，持有 1 银币、3 块随机货物；随机首位起依次领取 1、2、3、4 名工人。所有领地、骰子和库存均为公开信息。</p><h3>五个阶段，每阶段五轮</h3><p>每轮同时掷两颗自己的骰子，白骰只决定一块货物放到哪个货站。按本轮开始时的顺序，各玩家用完自己的两颗骰子。船舶推进顺位轨，新顺序从下一轮生效。</p><ol><li><b>取地块：</b>从骰子点数对应的货站取一块，先放进三个暂存位之一；满了可弃掉原有一块再取。</li><li><b>放地块：</b>从暂存区取一块，放到骰子点数对应的同色空格，并与已有地块相邻。</li><li><b>售货：</b>出售骰子点数对应种类的全部库存，每块得玩家人数分，每次总共得 1 银币。</li><li><b>取工人：</b>任何点数都可领取 2 名工人。每名工人将骰子调整一点，可在 1 和 6 之间循环。</li></ol><p><b>额外购买：</b>每回合可花 2 银币购买一块黑市地块，不耗骰子。可在两次骰子行动前、之间或之后购买。两颗骰子用完不会立即跳到下一人，请主动点“结束回合”。经典版先完成连锁效果，再购买。</p><h3>六种地块与八种建筑</h3><div class="bu-rules-types">'+D.types.filter(t=>t!=='building'&&t!=='knowledge').map(type=>{const t=D.tiles.find(t=>t.type===type);return '<article class="bu-rule-tile">'+art(t,false)+'<div><b>'+D.names[type]+'</b><p>'+D.description(t)+'</p></div></article>';}).join('')+D.buildings.map(b=>{const t=D.tiles.find(t=>t.building===b.id);return '<article class="bu-rule-tile">'+art(t,false)+'<div><b>'+b.name+'</b><p>'+b.effect+'</p></div></article>';}).join('')+'</div><p>每片连续的米色城市中，同一种建筑最多一座（知识 1 例外）。建筑奖励立即执行，不再使用普通骰子；市政厅、城堡等可以继续触发连锁。奖励无法使用时仍可建造。工人与银币不限制总供应数量。</p><h3>区域与颜色计分</h3><table><tr><th>区域格数</th>'+[1,2,3,4,5,6,7,8].map(n=>'<th>'+n+'</th>').join('')+'</tr><tr><td>规模分</td>'+D.regionPoints.slice(1).map(n=>'<td>'+n+'</td>').join('')+'</tr></table><p>完成每片区域再加阶段奖励：A 10、B 8、C 6、D 4、E 2 分。填满全领地某种颜色：首位得人数＋3 分，第二位得人数分。起始城堡不会获得开局计分。</p><h3>终局</h3><p>第五阶段结束后先领取最后一次矿山收入，再计剩余货物每块 1 分、银币每枚 1 分、工人每两名 1 分与知识奖励。未放置的暂存地块不计分。同分先比较空格数，多者胜；再比较最终顺位，后者胜（采用官方英文规则勘误）。</p><h3>26 种知识 · 放置后才生效</h3><div class="bu-knowledge-guide">'+D.knowledge.map(k=>{const t=D.tiles.find(t=>t.number===k.number);return '<article>'+art(t,false)+'<div><b>知识 '+k.number+(k.black?' · 黑市':'')+'</b><p>'+k.effect+'</p></div></article>';}).join('')+'</div><p class="bu-small" style="margin-top:20px">规则来源：<a href="'+D.rulesURL+'" target="_blank" rel="noopener">发行方经典说明书</a> · <a href="'+D.errataURL+'" target="_blank" rel="noopener">授权线上版规则与勘误</a>。本地包含出版商规则书插图与公开项目的数字地块、货物和领地图；来源及校验值见素材清单。</p>';
  }
  function renderOverlay() {
    if (!modal&&!replacing) { overlay.innerHTML=''; return; }
    const p=state?.players[state.current];
    const content=replacing?'<p>将取得 <b>'+esc(D.name(replacing.tile))+'</b>。你的三个暂存位已满，请选择一块<b>原有地块</b>弃置。确认前不会消耗骰子、工人或银币。</p><div class="bu-replace-grid">'+p.reserved.map(id=>'<button class="bu-tile-button" data-replace="'+id+'">'+art(id,false)+'<b>'+esc(D.name(id))+'</b><small>弃置这块并取入新地块</small></button>').join('')+'</div>':rules();
    overlay.innerHTML='<div class="bu-modal-backdrop"><section class="bu-modal'+(replacing?' bu-modal-replace':'')+'" role="dialog" aria-modal="true" aria-label="'+(replacing?'暂存区替换地块':'规则与地块图鉴')+'"><div class="bu-modal-head"><h2>'+(replacing?'选择替换的地块':'规则与地块图鉴')+'</h2>'+button('关闭','data-action="close-modal"')+'</div>'+content+'</section></div>';
  }
  function render() { hideTip(); if (screen==='setup') setup(); else game(); renderOverlay(); }
  function execute(action) {
    E.play(state,action);
    if (Room.active) return;
    aiError=''; view=state.current; resetChoices(); save(); render(); scheduleAI();
  }
  function scheduleAI() {
    clearTimeout(timer);
    if (Room.active||!state||screen!=='game'||state.phase==='gameover'||!state.players[state.current].ai||modal||replacing||aiError) return;
    timer=setTimeout(()=>{
      try { execute(E.chooseAI(state)); }
      catch(error) { console.error(error); aiError=error.message; render(); toast('电脑行动中断：'+error.message+'。可保存后重试。'); }
    },Motion.aiDelay());
  }
  function begin() { state=E.newGame(seats.slice(0,count),Date.now()); screen='game';view=state.current;aiError='';started=Date.now();resetChoices();save();render();scheduleAI(); }
  function resume() { if(!saved)return;state=structuredClone(saved);E.validate(state);screen='game';view=state.current;aiError='';started=Date.now();resetChoices();render();scheduleAI(); }
  function hideTip() { tooltip.hidden=true;tipAnchor=null;pinned=false; }
  function showTip(node, pin=false) {
    if (!node?.dataset.buTip) return;
    tooltip.textContent=node.dataset.buTip;tooltip.hidden=false;tipAnchor=node;pinned=pin;
    const r=node.getBoundingClientRect(),w=tooltip.offsetWidth,h=tooltip.offsetHeight;
    tooltip.style.left=Math.max(12,Math.min(r.x+r.width/2-w/2,innerWidth-w-12))+'px';
    tooltip.style.top=(r.top-h-10>10?r.top-h-10:Math.max(10,Math.min(r.bottom+10,innerHeight-h-12)))+'px';
  }
  document.addEventListener('pointerover',e=>{const n=e.target.closest('[data-bu-tip]');if(n&&n!==tipAnchor)showTip(n);});
  document.addEventListener('pointerout',e=>{if(!pinned&&tipAnchor&&!tipAnchor.contains(e.relatedTarget))hideTip();});
  document.addEventListener('focusin',e=>{const n=e.target.closest('[data-bu-tip]');if(n)showTip(n);});
  document.addEventListener('focusout',()=>{if(!pinned)hideTip();});
  window.addEventListener('scroll',hideTip,{passive:true});window.addEventListener('resize',hideTip);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){hideTip();modal='';replacing=null;renderOverlay();scheduleAI();}});
  root.addEventListener('input',e=>{if(e.target.dataset.name!=null){const seat=seats[Number(e.target.dataset.name)];seat.name=e.target.value;seat.custom=true;}});
  root.addEventListener('change',e=>{
    const n=e.target;
    if(n.hasAttribute('data-count')){count=Number(n.value);render();}
    if(n.dataset.ai!=null){const i=Number(n.dataset.ai),s=seats[i];s.ai=n.value==='ai';if(!s.custom)s.name=s.ai?AI_NAMES[i?i-1:3]+'（简单）':i?'玩家 '+(i+1):'玩家';render();}
  });
  document.addEventListener('click',event=>{
    const n=event.target.closest('button');if(!n)return;
    if(n.hasAttribute('data-info')){showTip(n,true);return;}
    hideTip();const action=n.dataset.action;
    try {
      if(action==='rules'){modal='rules';clearTimeout(timer);renderOverlay();return;}
      if(action==='close-modal'){modal='';replacing=null;renderOverlay();scheduleAI();return;}
      if(n.dataset.reason){toast(n.dataset.reason);showTip(n,true);return;}
      if(action==='save'){if(state){save();toast(Room.active?'联机对局由房主服务自动保存。':'对局已保存在当前设备。');}return;}
      if(action==='menu'){if(Room.active){location.href='online.html?room='+encodeURIComponent(Room.code);return;}clearTimeout(timer);Motion.cancel();screen='setup';state=null;modal='';replacing=null;render();return;}
      if(action==='start'){begin();return;}
      if(action==='continue'){resume();return;}
      if(n.dataset.view!=null){view=Number(n.dataset.view);render();return;}
      if(action==='retry-ai'){aiError='';render();scheduleAI();return;}
      if(!state)return;
      if(n.dataset.hex!=null){
        const cell=Number(n.dataset.hex),p=state.players[view];
        if(p.estate[cell]){showTip(n,true);return;}
        if(view!==state.current){toast('正在查看其他玩家的领地，请先回到当前玩家。');return;}
        if(actorReason()){toast(actorReason());return;}
        const a=selectedAction('place',{tile:selectedTile,cell}),q=E.quote(state,a);if(!q.valid){toast(q.reason);showTip(n,true);return;}execute(a);return;
      }
      if(n.dataset.reserve){
        if(view!==state.current||actorReason()){showTip(n,true);return;}
        selectedTile=n.dataset.reserve;buyMode=false;render();return;
      }
      if(n.dataset.emptyReserve!=null){showTip(n,true);return;}
      if(actorReason()){toast(actorReason());return;}
      if(n.dataset.die!=null){if(state.pending.length){toast('先完成额外效果；奖励不消耗普通骰子。');return;}selectedDie=Number(n.dataset.die);buyMode=false;render();return;}
      if(action==='buy-mode'){buyMode=!buyMode;render();return;}
      if(n.dataset.take){const a=tileAction(n.dataset.take,Number(n.dataset.depot));if(state.players[state.current].reserved.length===3){delete a.discard;replacing=a;clearTimeout(timer);renderOverlay();}else execute(a);return;}
      if(n.dataset.replace){const a={...replacing,discard:n.dataset.replace};replacing=null;execute(a);return;}
      if(n.dataset.sell!=null){execute(selectedAction('sell',{good:Number(n.dataset.sell)}));return;}
      if(n.dataset.collectDepot!=null){
        const d=Number(n.dataset.collectDepot),p=state.players[state.current];
        if(!E.has(p,5))collectDepots=[d];
        else if(collectDepots.includes(d)){if(collectDepots.length>1)collectDepots=collectDepots.filter(x=>x!==d);}
        else if(collectDepots.length===1&&[1,5].includes(Math.abs(collectDepots[0]-d)))collectDepots.push(d);
        else collectDepots=[d];
        const candidates=E.actions(state).filter(a=>a.type==='collect'&&a.depots.length===collectDepots.length&&a.depots.every(x=>collectDepots.includes(x)));
        collectTypes=candidates[0]?.types||[];render();return;
      }
      if(n.dataset.collectType!=null){const g=Number(n.dataset.collectType);collectTypes=collectTypes.includes(g)?collectTypes.filter(x=>x!==g):[...collectTypes,g];render();return;}
      if(action==='collect'){execute({type:'collect',depots:collectDepots,types:collectTypes});return;}
      if(action==='workers'){execute(selectedAction('workers'));return;}
      if(action==='skip'||action==='end'){execute({type:action});return;}
    } catch(error) { console.error(error);toast(error.message); }
  });
  if(Room.active)Room.connect({game:'burgundy',root:'burgundy',getState:()=>state,setState:(value,snapshot,previous)=>{
    const old=state;state=value;screen='game';
    if(!previous)view=snapshot.mine;
    else if(old?.current!==value.current)view=value.current;
    resetChoices();
  },render});
  else if(new URLSearchParams(location.search).get('continue')==='1'&&saved)resume();else render();
})();
