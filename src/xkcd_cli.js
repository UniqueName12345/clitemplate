const THIS_GOOD_LOW = "good-low"
const THIS_BAD_HIGH = "bad-high"
const THIS_SAME = "same-same"

const IDLE = "idle"
const SET_TIER = "set-tier"
const SET_TOPIC = "set-topic"
const COMPARE_TIER = "compare-tier"
const COMPARE_SORT = "compare-sort"

const adjToIndex = (thisAdj, [low, mid, high]) => {
  if (thisAdj !== THIS_SAME) {
    return thisAdj == THIS_GOOD_LOW ? low : high
  } 
  return mid
}

const adjToFeeling = (thisAdj) => {
  const feelings = ['best', 'middle', 'worst']
  return adjToIndex(thisAdj, feelings)
}

const flipAdj = (thisAdj) => {
  const thatAdjList = [THIS_BAD_HIGH, THIS_SAME, THIS_GOOD_LOW]
  return adjToIndex(thisAdj, thatAdjList) 
}

const sameKeys = (obj, keySet) => {
  const oKeys = [...obj.keys()]
  const sameSize = oKeys.length == keySet.size
  const isGood = (key) => keySet.has(key)
  return sameSize && oKeys.every(isGood)
}

const needKey = (value, label) => {
  if (value == null) {
    throw new TypeError(`${label} "${value}" must be defined`)
  }
}

const needList = (value, label, allPossible) => {
  if (!allPossible.includes(value)) {
    const possibilities = allPossible.join(', ')
    throw new TypeError(`${label} "${value}" must be in ${possibilities}`)
  }
}

const needInteger = (value, label) => {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} "${value}" must be integer`)
  }
}

class Ranker {

  static bw = "better (+) or worse (-)"
  static allTiers = [..."sabcdf"]
  static allTopics = [
    "Anthropology",
    "Algebra",
    "Arithmetic",
    "Astronomy",
    "Avionics",
    "Biology",
    "Calculus",
    "Climate",
    "Chemistry",
    "Computers",
    "Design",
    "Economics",
    "Geogrphy",
    "Geology",
    "Geometry",
    "History",
    "Language",
    "Literature",
    "Materials",
    "Medicine",
    "Movies",
    "Music",
    "Philosophy",
    "Physics",
    "Politics",
    "Statistics",
    "Technology",
    "Television",
  ]

  static isRankable(keyObj, itemObj) {
    const keyKeys = new Set(['comic'])
    const valueKeys = new Set(['rank'])
    const { rank, tier, topic } = itemObj
    const { comic, title } = keyObj
    needInteger(comic, 'Comic')
    needKey(title, 'Title')
    needInteger(rank, 'Rank')
    needList(tier, 'Tier', this.allTiers)
    needList(topic, 'Topic', this.allTopics)
    return true
  }

  static get bestTier() {
    return this.allTiers[0]
  }

  static get worstTier() {
    return this.allTiers[Math.max(this.allTiers.length - 1, 0)]
  }

  static get newTopicCounts() {
    const topicEntries = this.allTopics.map((t) => [t, 0])
    return Object.fromEntries(topicEntries)
  }

  static get newTierLists() {
    const tierEntries = this.allTiers.map((t) => [t, []])
    return Object.fromEntries(tierEntries)
  }

  static insort(tierList, item) {
    const { rank } = item
    let high = tierList.length
    let low = 0

    while (low < high) {
      const mid = low + high >>> 1
      const midRank = tierList[mid].rank
      if (midRank < rank) low = mid + 1
      else high = mid
    }
    tierList.splice(low, 0, item)
    return tierList
  }
 
  static changeTier(xkcd, tier, thisAdj) {
    if (thisAdj == THIS_SAME) {
      throw new RangeError('Cannot compare same tier')
    }
    const { bestTier, worstTier } = this
    if (tier == bestTier && thisAdj == THIS_GOOD_LOW) {
      throw new RangeError('Cannot compare beyond best tier')
    }
    if (tier == worstTier && thisAdj == THIS_BAD_HIGH) {
      throw new RangeError('Cannot compare beyond worst tier')
    }
    const sign = adjToIndex(thisAdj, [-1, 0, +1])
    const newTier = this.allTiers[this.allTiers.indexOf(tier) + sign]
    const newTierList = xkcd.rankings.toTierList(newTier)
    if (newTierList.length == 0) {
      throw new RangeError('Cannot compare to empty tier')
    }
    const endTier = Math.max(newTierList.length - 1, 0) 
    const index = adjToIndex(thisAdj, [endTier, 0, 0])
    return [newTier, index]
  }

  static isTierLogical(thisTier, thisAdj, thatTier) {
    const thisIndex = this.allTiers.indexOf(thisTier)
    const thatIndex = this.allTiers.indexOf(thatTier)
    const aDiff = adjToIndex(thisAdj, [-1, 0, +1])
    const diff = Math.sign(thisIndex - thatIndex)
    return aDiff == diff
  }
}

class KeyString {

  static to(keyObj) {
    const { comic, title } = keyObj
    return [comic, title].join(',')
  }

  static from(keyString) {
    const [comic, title] = keyString.split(',')
    return { comic: parseInt(comic), title }
  }
}

const toEmptyDatum = () => {
  const rank = 0
  const tier = Ranker.allTiers[0]
  const topic = Ranker.allTopics[0]
  return new Datum(...[
    KeyString.to({title: "", comic: 0}),
    JSON.stringify({ rank, tier, topic})
  ])
}

class Datum {

  constructor(keyString, itemString) {

    const keyObj = KeyString.from(keyString)
    const itemObj = JSON.parse(itemString)

    if (Ranker.isRankable(keyObj, itemObj)) {
      const { rank, tier, topic } = itemObj;
      const { comic, title } = keyObj;
      this.comic = comic
      this.title = title 
      this.rank = rank
      this.tier = tier
      this.topic = topic
    }
  }

  get itemObj() {
    const { rank, tier, topic } = this;
    return { rank, tier, topic }
  }

  get keyObj() {
    const { comic, title } = this;
    return { comic, title }
  }

  toJSON() {
    const { keyObj, itemObj } = this;
    return { keyObj, itemObj }
  }

}

class Rankings {

  constructor({latest, store}) {
    this.latest = latest
    this.store = store
    this.storage = {
      'session': sessionStorage,
      'local': localStorage
    }[store] || localStorage
  }

  get length() {
    return this.storage.length;
  }

  get stats() {
    const totalCount = this.latest.num
    const tierLists = Ranker.newTierLists
    const topicCounts = Ranker.newTopicCounts
    for (const datum of this.dataList) {
      const {topic, tier} = datum
      tierLists[tier] = Ranker.insort(tierLists[tier], datum)
      topicCounts[topic] += 1
    }
    // Show sorted tiers of comics
    const tiers = new Map(Object.entries(tierLists))
    const ranked = [].concat(...tiers.values())
    // Show topics sorted by count
    const compareTopics = (a, b) => topicCounts[b] - topicCounts[a]
    const topics = [...Ranker.allTopics].sort(compareTopics)
    const pad = x => `${x}`.padStart(4) + ' '
    const logs = [
    `Ranked ${ranked.length} of ${totalCount} comics`,
      '',
      ...[...tiers].map(([tier, { length }]) => pad(length) + `${tier}-tier comics`),
      '',
      ...topics.map(topic => pad(topicCounts[topic]) + `${topic} comics`),
    ]
    // Log topics and tiers
    return { tiers, topics, topicCounts, logs, ranked }
  }

  toTierList(tier) {
    const { tiers } = this.stats
    return tiers.get(tier) || []
  }

  toDatum(i) {
    const keyString = this.storage.key(i)
    const itemString = this.storage.getItem(keyString)
    return new Datum(keyString, itemString)
  }

  get dataList() {
    const dataList = [];
    for (const datum of this) {
      dataList.push(datum);
    }
    return dataList;
  }

  get tierLists() {
    const { tiers } = this.stats
    return Object.fromEntries(tiers)
  }

  *[Symbol.iterator]() {
    const indices = [...Array(this.length).keys()]
    for (const i in indices) {
      try {
        yield this.toDatum(i)
      }
      catch (e) {
        if (e instanceof SyntaxError) {
          const msg = `key/value in ${this.store} storage`
          console.error(`Found non-json ${msg}`)
        }
        if (e instanceof TypeError) {
          console.error(e.message)
        }
      }
    }
  }

  setTierList(newTierList) {
    newTierList.forEach((datum, rank) => {
      const keyString = KeyString.to(datum.keyObj)
      const itemObj = { ...datum.itemObj, rank }
      const newItemString = JSON.stringify(itemObj)
      this.storage.removeItem(keyString)
      this.storage.setItem(keyString, newItemString)
    })
  }

  updateTierList(keyObj, itemObj) {
    const tierList = this.toTierList(itemObj.tier)
    const dArgs = [KeyString.to(keyObj), JSON.stringify(itemObj)]
    const newTierList = Ranker.insort(tierList, new Datum(...dArgs))
    return this.setTierList(newTierList)
  }

  add(keyObj, itemObj) {
    if (Ranker.isRankable(keyObj, itemObj)) {
      const tierList = this.toTierList(itemObj.tier)
      const comicList = tierList.map(({comic}) => comic)
      if (comicList.includes(keyObj.comic)) {
        const keyString = KeyString.to(keyObj)
        this.storage.removeItem(keyString)
        console.warn(`Updating existing ${keyString}`)
      }
      this.updateTierList(keyObj, itemObj)
    }
  }

  downloadJSON() {
    const tierLists = this.tierLists
    const a = document.createElement('a')
    const text = JSON.stringify(tierLists, null, 2)
    a.href = URL.createObjectURL( new Blob([text], { type: 'application/json' }) )
    const isoDate = (new Date()).toISOString().slice(0, -8).replace(':', '') 
    a.download = `xkcd-${isoDate}.json`
    a.click();
  }

  clearAllData() {
    for (const datum of this.dataList) {
      const { keyObj } = datum
      const keyString = KeyString.to(keyObj)
      this.storage.removeItem(keyString)
    }
  }
}

function pathFilename(path) {
  var match = /\/([^\/]+)$/.exec(path);
  if (match) {
    return match[1];
  }
}

function getRandomInt(min, max) {
  // via https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference/Global_Objects/Math/random#Examples
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(items) {
  return items[getRandomInt(0, items.length-1)];
}

function toFirstMidpoint(thisAdj, high) {
  if (thisAdj == THIS_GOOD_LOW) {
    return (0.5 * high) >>> 1
  }
  if (thisAdj == THIS_BAD_HIGH) {
    return (1.5 * high) >>> 1
  }
  return high >>> 1
}

function toClear() {
  return {
    'stage': IDLE,
    'sort': {
      'high': null,
      'low': null,
      'mid': null,
    },
    'keyObj': {
      'title': null,
      'comic': null,
    },
    'itemObj': {
      'topic': null,
      'rank': null,
      'tier': null
    },
    'tempDatum': toEmptyDatum() 
  }
}

const toMargin = (x) => {
  return 2**Math.max(0, Math.log2(x) - 4)
}

var xkcd = {
  latest: null,
  last: null,
  cache: {},
  now: toClear(),
  rankings: null,
  store: 'session',
  base: 'https://dynamic.xkcd.com/api-0/jsonp/comic/',
  
  askTier: (terminal) => {
    xkcd.now.stage = SET_TIER
    const { title } = xkcd.now.keyObj
    const worstT = `${Ranker.worstTier}`
    const allT = Ranker.allTiers.map(t => `"${t}"`)
    const mostT = allT.slice(0, -1).join(", ")
    const tierString = `${mostT} or ${worstT}?`
    terminal.print(`Which tier is "${title}"? ${tierString}`);
  },

  doTier: (terminal, tier, thisAdj) => {
    xkcd.now.itemObj.tier = tier
    xkcd.now.stage = COMPARE_TIER
    const feeling = adjToFeeling(thisAdj)
    terminal.print(`You chose the ${feeling} of "${tier}-tier"!`)
    let newDatum = null
    try {
      const [newTier, index] = Ranker.changeTier(xkcd, tier, thisAdj)
      const newTierList = xkcd.rankings.toTierList(newTier)
      newDatum = newTierList[index]
    }
    catch (e) {
      if (!(e instanceof RangeError)) {
        throw e;
      }
      return xkcd.startSort(terminal, thisAdj)
    }
    if (newDatum != null) {
      const comicNumber = newDatum.comic
      xkcdDisplay(terminal, comicNumber, (data) => {
        xkcd.now.tempDatum = newDatum;
        xkcd.askCompare(terminal, newDatum)
      });
    }
  },

  askCompare: (terminal, newDatum) => {
    const { bw } = Ranker
    const newTitle = newDatum.title
    const { title } = xkcd.now.keyObj;
    const { tier } = xkcd.now.itemObj;
    terminal.print(`Is this "${newTitle}" comic ${bw} than the "${tier}-tier" "${title}"?`);
  },

  doCompare: (terminal, thisAdj) => {
    const thisTier = xkcd.now.itemObj.tier
    const newDatum = xkcd.now.tempDatum
    const thatTier = newDatum.tier

    // We may need to swap the existing tiers
    if (!Ranker.isTierLogical(thisTier, thisAdj, thatTier)) {
      // Swap ranking at tier border
      const thatTierList = xkcd.rankings.toTierList(thisTier)
      const thatMax = Math.max(thatTierList.length - 1, 0)
      const thatRank = newDatum.rank == 0 ? thatMax : 0
      xkcd.now.itemObj.tier = thatTier
      xkcd.rankings.add(newDatum.keyObj, {
        ...newDatum.itemObj,
        rank: thatRank,
        tier: thisTier
      })
    }
    // Sort at the very edge of the tier
    xkcd.startSort(terminal, flipAdj(thisAdj))
  },

  startSort: (terminal, thisAdj) => {
    xkcd.now.stage = COMPARE_SORT
    const { title } = xkcd.now.keyObj
    const { tier } = xkcd.now.itemObj
    const feeling = adjToFeeling(thisAdj)
    const msg = [
      `Sorting "${title}" among`,
      `the ${feeling} ${tier}-tier comics`
    ].join(' ')
    showNotice(terminal, msg);
    const high = xkcd.rankings.toTierList(tier).length
    const mid = toFirstMidpoint(thisAdj, high)
    xkcd.now.sort = { low: 0, mid, high }
    xkcd.askSort(terminal)
  },

  askSort: (terminal) => {
    const { tier } = xkcd.now.itemObj
    const tierList = xkcd.rankings.toTierList(tier)
    const margin = toMargin(tierList.length)
    const { low, mid, high } = xkcd.now.sort

    if ( high - low > margin ) {
      const { bw } = Ranker
      const newDatum = tierList[mid]
      const { title } = xkcd.now.keyObj
      const comicNumber = newDatum.comic 
      xkcdDisplay(terminal, comicNumber, (data) => {
        const newTitle = data.title
        xkcd.now.tempDatum = newDatum;
        terminal.print(`Is this "${newTitle}" comic ${bw} than "${title}"?`);
      });
    }
    else {
      const { keyObj } = xkcd.now
      xkcd.now.itemObj.rank = mid
      xkcd.now.stage = SET_TOPIC
      xkcd.askTopic(terminal)
    }
  },

  doSort: (terminal, thisAdj) => {
    const { low, mid, high } = xkcd.now.sort
    if (thisAdj == THIS_GOOD_LOW) {
      xkcd.now.sort.low = low
      xkcd.now.sort.high = mid
      xkcd.now.sort.mid = low + mid >>> 1
    }
    else if (thisAdj == THIS_BAD_HIGH) {
      xkcd.now.sort.high = high
      xkcd.now.sort.low = mid + 1
      xkcd.now.sort.mid = mid + 1 + high >>> 1
    }
    return xkcd.askSort(terminal)
  },

  askTopic: (terminal) => {
    const { topics } = xkcd.rankings.stats
    const topicOptions = topics.map((topic) => {
      const index = Ranker.allTopics.indexOf(topic)
      return `${index}: ${topic}`
    })
    const { title, comic } = xkcd.now.keyObj
    xkcdDisplay(terminal, comic, () => {
      terminal.print(`What is the topic of ${title}?`)
      terminal.print(topicOptions.join(', '))
    })
  },

  doTopic: (terminal, topic) => {
    if (Ranker.allTopics.includes(topic)) {
      xkcd.now.itemObj.topic = topic
      const {keyObj, itemObj} = xkcd.now
      xkcd.rankings.add(keyObj, itemObj)
      xkcd.now = toClear()
      Terminal.runCommand('next');
    }
    else {
      xkcd.askTopic(terminal)
    }
  },

  get: function(num, success, error) {
    if (num == null) {
      path = '';
    } else if (Number(num)) {
      path = String(num);
    } else {
      error(false);
      return false;
    }
    
    if (num in this.cache) {
      this.last = this.cache[num];
      success(this.cache[num]);
    } else {
      return $.ajax({
        url: this.base+path,
        dataType: 'jsonp',
        success: $.proxy(function(data) {
          this.last = this.cache[num] = data;
          success(data);
        }, this),
        error: error});
    }
  }
};

var xkcdDisplay = function(terminal, path, callback) {
  function fail() {
    terminal.print($('<p>').addClass('error').text('display: unable to open image "'+path+'": No such file or directory.'));
    terminal.setWorking(false);
  }
      
  if (path) {
    path = String(path);
    num = Number(path.match(/^\d+/));
    filename = pathFilename(path);
    
    if (num > xkcd.latest.num) {
      terminal.print("Time travel mode not enabled.");
      return;
    }
  } else {
    num = xkcd.last.num;
  }
  
  terminal.setWorking(true);
  xkcd.get(num, function(data) {
    if (!filename || (filename == pathFilename(data.img))) {
      $('<img>')
        .hide()
        .load(function() {
          terminal.print($('<h3>').text(data.num+": "+data.title));
          $(this).fadeIn();
          
          var comic = $(this);
          if (data.link) {
            comic = $('<a>').attr('href', data.link).append($(this));
          }
          terminal.print(comic);
          
          terminal.setWorking(false);

          callback(data);
        })
        .attr({src:data.img, alt:data.title, title:data.alt})
        .addClass('comic');
    } else {
      fail();
    }
  }, fail);
};

function showNotice(terminal, msg) {
  terminal.print($('<p>').addClass('notice').text(msg))
}

function showError(terminal, msg) {
  terminal.print($('<p>').addClass('error').text(msg))
}

function nextComic(terminal) {
  if (xkcd.now.stage !== IDLE) {
    const {title} = xkcd.now.keyObj;
    showError(terminal, `Skipping ${title || 'last comic'}!`)
  }
  xkcd.now.stage = IDLE
  const { ranked } = xkcd.rankings.stats
  const rankedComics = ranked.map(({comic}) => comic)
  const allComics = [...Array(xkcd.latest.num).keys()].map(i => i + 1)
  const allowed = allComics.filter(i => !rankedComics.includes(i))
  if (allowed.length) {
    const comicIndex = getRandomInt(1, allowed.length)
    const comicNumber = allowed[comicIndex - 1]
    xkcd.now.comic = comicNumber;
    xkcdDisplay(terminal, comicNumber, (data) => {
      xkcd.now.keyObj.comic = data.num;
      xkcd.now.keyObj.title = data.title;
      xkcd.askTier(terminal)
    });
  }
  else {
    terminal.print('Done!');
  }
};

TerminalShell.commands['next'] = nextComic
TerminalShell.commands['n'] = nextComic

function makeTopicHandler(topic) {
  return (terminal) => {
    if (xkcd.now.stage != SET_TOPIC) {
      const { stage } = xkcd.now
      return showError(terminal, `Refusing to set topic at stage ${stage}!`)
    }
    xkcd.doTopic(terminal, topic)
  }
}

Ranker.allTopics.forEach((topic, i) => {
  TerminalShell.commands[topic] = makeTopicHandler(topic)
  TerminalShell.commands[`${i}`] = makeTopicHandler(topic)
})

function makeTierHandler(tier, thisAdj) {
  return (terminal) => {
    if (xkcd.now.stage != SET_TIER) {
      const { stage } = xkcd.now
      return showError(terminal, `Refusing to set tier at stage ${stage}!`)
    }
    xkcd.doTier(terminal, tier, thisAdj)
  }
}

Ranker.allTiers.forEach(tier => {
  TerminalShell.commands[tier] = makeTierHandler(tier, THIS_SAME)
  TerminalShell.commands[tier+"-"] = makeTierHandler(tier, THIS_BAD_HIGH)
  TerminalShell.commands[tier+"+"] = makeTierHandler(tier, THIS_GOOD_LOW)
})

function makeCompareHandler(thisAdj) {
  return (terminal) => {
    if (xkcd.now.stage == COMPARE_TIER) {
      return xkcd.doCompare(terminal, thisAdj)
    }
    if (xkcd.now.stage == COMPARE_SORT) {
      return xkcd.doSort(terminal, thisAdj)
    }
    const { stage } = xkcd.now
    return showError(terminal, `Refusing to compare at stage ${stage}!`)
  }
}

TerminalShell.commands["-"] = makeCompareHandler(flipAdj(THIS_BAD_HIGH))
TerminalShell.commands["+"] = makeCompareHandler(flipAdj(THIS_GOOD_LOW))
TerminalShell.commands["worse"] = makeCompareHandler(flipAdj(THIS_BAD_HIGH))
TerminalShell.commands["better"] = makeCompareHandler(flipAdj(THIS_GOOD_LOW))

function whoHandler(terminal) {
  const { comic } = xkcd.now.keyObj
  if (comic) {
    xkcdDisplay(terminal, comic, () => null)
  }
}

TerminalShell.commands['whoami'] = whoHandler
TerminalShell.commands['w'] = whoHandler

function listHandler(terminal, target=null) {
  for (const tier of Ranker.allTiers) {
    if (target != null && target != tier) {
      continue
    }
    showNotice(terminal, `Tier ${tier}:`)
    const tierList = xkcd.rankings.toTierList(tier)
    for (const datum of tierList) {
      const { comic, title } = datum
      const href = `https://xkcd.com/${comic}`
      terminal.print($('<a>').attr('href', href).text(title+'\n'))
    }
  }
}

TerminalShell.commands['list'] = listHandler
TerminalShell.commands['ls'] = listHandler

TerminalShell.commands['delete'] = function(terminal) {
  xkcd.rankings.clearAllData();
  terminal.print("I've cleared your data!");
  const { logs } = xkcd.rankings.stats
  const logString = logs.join('\n')
  terminal.print(logString)
  xkcd.now = toClear()
};

function exitHandler(terminal) {
  terminal.print('Here is your data.');
  xkcd.rankings.downloadJSON();
  xkcd.now = toClear()
};

TerminalShell.commands['exit'] = exitHandler
TerminalShell.commands['save'] = exitHandler
TerminalShell.commands['download'] = exitHandler

function helpHandler(terminal) {
  const { logs } = xkcd.rankings.stats
  const logString = logs.join('\n')
  const helpMessage = `
${logString}

Commands:
  whoami (w): show active image
  list (ls): list all rankings
  delete: clear all data
  exit: save your data

Drag in ".json" file to restore data.
Type "next" (n) to start:
`;
  terminal.print(helpMessage);
};

TerminalShell.commands['h'] = helpHandler
TerminalShell.commands['help'] = helpHandler

TerminalShell.fallback = function(terminal, cmd) {
  cmd = cmd.toLowerCase();
  if (/:\(\)\s*{\s*:\s*\|\s*:\s*&\s*}\s*;\s*:/.test(cmd)) {
    Terminal.setWorking(true);
  }
  $.get("/unixkcd/missing", {cmd: cmd});
  return false;
};

$(document).ready(function() {
  Terminal.promptActive = false;
  function noData() {
    Terminal.print($('<p>').addClass('error').text('Cannot connect to xkcd.com'));
    Terminal.promptActive = true;
  }
  const screenEl = document.getElementById("screen")
  screenEl.addEventListener("dragover", (ev) => {
    ev.preventDefault()
  })
  screenEl.addEventListener("dragenter", (ev) => {
    ev.currentTarget.style.border = "3px dotted red";
  });
  screenEl.addEventListener("dragleave", (ev) => {
    ev.currentTarget.style.border = "";
  });
  screenEl.addEventListener("drop", (ev) => {
    event.preventDefault()
    const file = ev.dataTransfer.files[0]
    ev.currentTarget.style.border = ""
    reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      const tierLists = JSON.parse(text)
      for (const tierList of Object.values(tierLists)) {
        xkcd.rankings.setTierList(tierList)
      }
      Terminal.runCommand('help');
    };
    reader.readAsText(file)
    return false;
  });
  $('#screen').bind('cli-load', function(e) {
    xkcd.get(null, function(data) {
      if (data) {
        xkcd.latest = data;
        xkcd.rankings = new Rankings(xkcd);
        Terminal.runCommand('help');
      } else {
        noData();
      }
    }, noData);
  });
});
