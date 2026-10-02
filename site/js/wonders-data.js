(function (root) {
  'use strict';
  const R = { W: '木材', S: '石材', C: '黏土', O: '矿石', G: '玻璃', P: '纸莎草', L: '织物' };
  const TYPES = { brown: '原材料', gray: '工艺品', blue: '民用', red: '军事', green: '科技', yellow: '商业', purple: '行会' };
  const COLORS = { brown: '#9d613f', gray: '#859095', blue: '#547ca9', red: '#a84e49', green: '#5c9b76', yellow: '#c29b4c', purple: '#866da7' };
  const templates = {};
  function card(key, name, type, cost, effect, chain) {
    templates[key] = { key, name, type, cost: cost || '', effect, chain: chain || null };
  }
  // Cards are instantiated with the player-count marks printed on the base-game decks.
  card('lumber', '伐木场', 'brown', '', { produce: 'W' });
  card('stone', '采石坑', 'brown', '', { produce: 'S' });
  card('clay', '黏土场', 'brown', '', { produce: 'C' });
  card('ore', '矿脉', 'brown', '', { produce: 'O' });
  card('tree', '林木农场', 'brown', '$', { choose: 'WC' });
  card('excavation', '挖掘场', 'brown', '$', { choose: 'SC' });
  card('forest', '森林洞穴', 'brown', '$', { choose: 'WO' });
  card('mine', '矿井', 'brown', '$', { choose: 'SO' });
  card('timber', '木石场', 'brown', '$', { choose: 'WS' });
  card('claypit', '黏土矿坑', 'brown', '$', { choose: 'CO' });
  card('glass', '玻璃作坊', 'gray', '', { produce: 'G' });
  card('press', '纸莎草厂', 'gray', '', { produce: 'P' });
  card('loom', '织布坊', 'gray', '', { produce: 'L' });
  card('baths', '浴场', 'blue', 'S', { points: 3 });
  card('altar', '祭坛', 'blue', '', { points: 2 });
  card('theater', '剧院', 'blue', '', { points: 2 });
  card('well', '水井', 'blue', '', { points: 3 });
  card('apothecary', '药房', 'green', 'L', { science: 'compass' });
  card('workshop', '工坊', 'green', 'G', { science: 'gear' });
  card('scriptorium', '抄写室', 'green', 'P', { science: 'tablet' });
  card('eastpost', '东部商栈', 'yellow', '', { trade: 'rightRaw' });
  card('westpost', '西部商栈', 'yellow', '', { trade: 'leftRaw' });
  card('market', '市场', 'yellow', '', { trade: 'manufactured' });
  card('tavern', '酒馆', 'yellow', '', { coins: 5 });
  card('stockade', '栅栏', 'red', 'W', { shields: 1 });
  card('barracks', '兵营', 'red', 'O', { shields: 1 });
  card('guard', '哨塔', 'red', 'C', { shields: 1 });

  card('sawmill', '锯木厂', 'brown', '$', { produce: 'WW' });
  card('quarry', '大型采石场', 'brown', '$', { produce: 'SS' });
  card('brickyard', '砖厂', 'brown', '$', { produce: 'CC' });
  card('foundry', '铸造厂', 'brown', '$', { produce: 'OO' });
  card('aqueduct', '高架水渠', 'blue', 'SSS', { points: 5 }, 'baths');
  card('temple', '神庙', 'blue', 'WWG', { points: 3 });
  card('statue', '雕像', 'blue', 'OOW', { points: 4 }, 'well');
  card('courthouse', '法院', 'blue', 'CCL', { points: 4 }, 'scriptorium');
  card('dispensary', '诊疗所', 'green', 'OOG', { science: 'compass' }, 'apothecary');
  card('laboratory', '实验室', 'green', 'CCP', { science: 'gear' }, 'workshop');
  card('library', '图书馆', 'green', 'SSL', { science: 'tablet' }, 'scriptorium');
  card('school', '学校', 'green', 'WWP', { science: 'tablet' });
  card('forum', '广场', 'yellow', 'CC', { choose: 'GPL' }, ['eastpost', 'westpost']);
  card('caravan', '商队驿站', 'yellow', 'WW', { choose: 'WSCO' }, 'market');
  card('vineyard', '葡萄园', 'yellow', '', { coinsPer: 'brownAll' });
  card('bazaar', '集市', 'yellow', '', { coinsPer: 'grayAll', coinsRate: 2 });
  card('stables', '马厩', 'red', 'WCO', { shields: 2 }, 'apothecary');
  card('archery', '射箭场', 'red', 'WWO', { shields: 2 }, 'workshop');
  card('walls', '城墙', 'red', 'SSS', { shields: 2 });
  card('training', '训练场', 'red', 'WWOO', { shields: 2 });

  card('townhall', '市政厅', 'blue', 'SSOCG', { points: 6 });
  card('palace', '宫殿', 'blue', 'WSCOGPL', { points: 8 });
  card('gardens', '空中花园', 'blue', 'WWCC', { points: 5 }, 'theater');
  card('senate', '议事厅', 'blue', 'WWSO', { points: 6 }, 'library');
  card('pantheon', '万神殿', 'blue', 'CCOPL', { points: 7 }, 'altar');
  card('academy', '学院', 'green', 'SSSG', { science: 'compass' }, 'school');
  card('study', '书斋', 'green', 'WPL', { science: 'gear' }, 'school');
  card('lodge', '旅馆', 'green', 'CCLP', { science: 'compass' }, 'dispensary');
  card('observatory', '天文台', 'green', 'OOGL', { science: 'gear' }, 'laboratory');
  card('university', '大学', 'green', 'WWGP', { science: 'tablet' }, 'library');
  card('lighthouse', '灯塔', 'yellow', 'SG', { coinsPer: 'yellowSelf', pointsPer: 'yellowSelf' }, 'caravan');
  card('haven', '港口', 'yellow', 'WOL', { coinsPer: 'brownSelf', pointsPer: 'brownSelf' }, 'forum');
  card('chamber', '商会', 'yellow', 'CCP', { coinsPer: 'graySelf', coinsRate: 2, pointsPer: 'graySelf', pointsRate: 2 });
  card('arena', '竞技场', 'yellow', 'SSO', { coinsPer: 'stagesSelf', coinsRate: 3, pointsPer: 'stagesSelf' }, 'dispensary');
  card('ludus', '角斗士学校', 'yellow', 'SSG', { coinsPer: 'redSelf', pointsPer: 'redSelf' });
  card('arsenal', '军械库', 'red', 'WWOC', { shields: 3 });
  card('fort', '防御工事', 'red', 'OOOS', { shields: 3 }, 'walls');
  card('circus', '竞技场军营', 'red', 'SSSO', { shields: 3 }, 'training');
  card('siege', '攻城工坊', 'red', 'CCCW', { shields: 3 }, 'laboratory');
  card('castrum', '军营堡垒', 'red', 'CCCS', { shields: 3 });
  card('workersGuild', '工人行会', 'purple', 'OOSWL', { guild: 'brownNeighbors' });
  card('craftGuild', '工匠行会', 'purple', 'OOSSS', { guild: 'grayNeighbors', guildRate: 2 });
  card('tradersGuild', '商人行会', 'purple', 'GLP', { guild: 'yellowNeighbors' });
  card('philosophersGuild', '哲学家行会', 'purple', 'CCCP', { guild: 'greenNeighbors' });
  card('spiesGuild', '间谍行会', 'purple', 'CCCG', { guild: 'redNeighbors' });
  card('magistratesGuild', '执政官行会', 'purple', 'WWLP', { guild: 'blueNeighbors' });
  card('buildersGuild', '建筑师行会', 'purple', 'SSCG', { guild: 'stagesAll' });
  card('scientistsGuild', '科学家行会', 'purple', 'WWOO', { science: 'wild' });
  card('shipownersGuild', '船主行会', 'purple', 'WWWGL', { guild: 'brownGrayPurpleSelf' });
  card('decoratorsGuild', '装饰师行会', 'purple', 'OOSLP', { guild: 'allStages', guildRate: 7 });

  const age1 = {
    3: 'lumber stone clay ore tree excavation glass press loom baths altar theater apothecary workshop scriptorium eastpost westpost market stockade barracks guard',
    4: 'lumber stone clay ore tavern well guard',
    5: 'lumber stone clay ore forest mine tavern',
    6: 'lumber stone clay ore timber claypit baths',
    7: 'lumber stone clay ore glass press loom'
  };
  const age2 = {
    3: 'sawmill quarry brickyard foundry glass press loom aqueduct temple statue courthouse dispensary laboratory library school forum caravan stables archery walls training',
    4: 'sawmill quarry brickyard foundry vineyard bazaar stables',
    5: 'sawmill quarry brickyard foundry glass press loom',
    6: 'sawmill quarry brickyard foundry aqueduct temple training',
    7: 'sawmill quarry brickyard foundry vineyard bazaar walls'
  };
  const age3 = {
    3: 'townhall palace gardens senate pantheon academy study lodge observatory university lighthouse haven chamber arena arsenal fort',
    4: 'townhall palace gardens senate circus siege',
    5: 'townhall palace academy university ludus haven',
    6: 'townhall palace pantheon lodge chamber arena',
    7: 'townhall palace observatory study circus castrum'
  };
  const GUILDS = 'workersGuild craftGuild tradersGuild philosophersGuild spiesGuild magistratesGuild buildersGuild scientistsGuild shipownersGuild decoratorsGuild'.split(' ');
  const WONDERS = [
    { id: 'giza', name: '吉萨金字塔', city: '吉萨', resource: 'S', motif: 'pyramid',
      a: [{ cost: 'SS', effect: { points: 3 } }, { cost: 'WWW', effect: { points: 5 } }, { cost: 'SSSS', effect: { points: 7 } }],
      b: [{ cost: 'WW', effect: { points: 3 } }, { cost: 'SSS', effect: { points: 5 } }, { cost: 'CCC', effect: { points: 5 } }, { cost: 'GG', effect: { points: 7 } }] },
    { id: 'alexandria', name: '亚历山大灯塔', city: '亚历山大', resource: 'G', motif: 'lighthouse',
      a: [{ cost: 'SS', effect: { points: 3 } }, { cost: 'OO', effect: { choose: 'WSCO' } }, { cost: 'GG', effect: { points: 7 } }],
      b: [{ cost: 'CC', effect: { choose: 'WSCO' } }, { cost: 'WW', effect: { choose: 'GPL' } }, { cost: 'SSS', effect: { points: 7 } }] },
    { id: 'ephesos', name: '以弗所神庙', city: '以弗所', resource: 'P', motif: 'temple',
      a: [{ cost: 'SS', effect: { points: 3 } }, { cost: 'WW', effect: { coins: 9 } }, { cost: 'PP', effect: { points: 7 } }],
      b: [{ cost: 'SS', effect: { points: 2, coins: 4 } }, { cost: 'WW', effect: { points: 3, coins: 4 } }, { cost: 'PP', effect: { points: 5, coins: 4 } }] },
    { id: 'rhodos', name: '罗德岛巨像', city: '罗德岛', resource: 'O', motif: 'colossus',
      a: [{ cost: 'WW', effect: { points: 3 } }, { cost: 'CCC', effect: { shields: 2 } }, { cost: 'OOOO', effect: { points: 7 } }],
      b: [{ cost: 'SSS', effect: { points: 3, shields: 1, coins: 3 } }, { cost: 'OOOO', effect: { points: 4, shields: 1, coins: 4 } }] },
    { id: 'babylon', name: '巴比伦空中花园', city: '巴比伦', resource: 'C', motif: 'garden',
      a: [{ cost: 'CC', effect: { points: 3 } }, { cost: 'WWW', effect: { science: 'wild' } }, { cost: 'CCCC', effect: { points: 7 } }],
      b: [{ cost: 'CC', effect: { points: 3 } }, { cost: 'GG', effect: { science: 'wild' } }, { cost: 'WWW', effect: { lastCard: true } }] },
    { id: 'olympia', name: '奥林匹亚宙斯像', city: '奥林匹亚', resource: 'W', motif: 'statue',
      a: [{ cost: 'WW', effect: { points: 3 } }, { cost: 'SS', effect: { freeAge: true } }, { cost: 'OO', effect: { points: 7 } }],
      b: [{ cost: 'WW', effect: { trade: 'rawBoth' } }, { cost: 'SS', effect: { points: 5 } }, { cost: 'OO', effect: { freeAge: true } }] },
    { id: 'halicarnassus', name: '哈利卡纳苏斯陵墓', city: '哈利卡纳苏斯', resource: 'L', motif: 'mausoleum',
      a: [{ cost: 'CC', effect: { points: 3 } }, { cost: 'OOO', effect: { discardBuild: true } }, { cost: 'LL', effect: { points: 7 } }],
      b: [{ cost: 'OO', effect: { points: 2, discardBuild: true } }, { cost: 'CCC', effect: { points: 1, discardBuild: true } }, { cost: 'LL', effect: { discardBuild: true } }] }
  ];
  const ages = [age1, age2, age3].map((groups, ageIndex) => {
    const result = [];
    for (let minimum = 3; minimum <= 7; minimum++) {
      const keys = groups[minimum].split(' ');
      for (let index = 0; index < keys.length; index++) {
        const base = templates[keys[index]];
        result.push({ ...base, id: 'a' + (ageIndex + 1) + '-' + minimum + '-' + index,
          age: ageIndex + 1, minPlayers: minimum });
      }
    }
    if (ageIndex === 2) for (const key of GUILDS) {
      result.push({ ...templates[key], id: 'guild-' + key, age: 3, guildCard: true });
    }
    return result;
  });
  root.WondersData = Object.freeze({ R, TYPES, COLORS, WONDERS, ages, allCards: ages.flat() });
})(typeof window === 'undefined' ? globalThis : window);
