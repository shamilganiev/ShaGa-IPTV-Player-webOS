// Коды кнопок пульта LG. Для проверки в браузере на компьютере:
// Esc = Back, PageUp/PageDown = CH+/CH−, Y = жёлтая, B = синяя.
var K = {
  LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461,
  CHUP: 33, CHDN: 34,
  RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
  PLAY: 415, PAUSE: 19, STOP: 413
};

function digitOf(code) {
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 96 && code <= 105) return code - 96;
  return -1;
}

function isInput(el) {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

// Группы с такими названиями при первой загрузке плейлиста скрываются.
// Пользователь может открыть их в настройках.
// «ххх» — кириллицей: так бывает в русских плейлистах
var ADULT_RE = /(xxx|ххх|adult|18\s*\+|взросл|эрот|porn)/i;

var App = {
  version: '0.1.4',
  channels: [],
  groupOrder: [],    // группы в порядке появления в плейлисте
  groupMap: {},      // группа -> [каналы]
  byNum: {},         // номер -> канал
  meta: {},
  favSet: {},
  screens: {},
  screen: null,
  prev: null,
  openLocked: null,  // группа «Под PIN-кодом», для которой сейчас введён PIN (одна)
  lockTouch: {},     // группа -> когда её последний раз смотрели (для автоскрытия через 10 мин)
  LOCK_IDLE_MS: 10 * 60 * 1000,

  init: function () {
    Config.load();
    // «Под PIN-кодом» не переживает перезапуск
    this.hideAllLocked('запуск');
    var sys = (navigator.language || 'en').toLowerCase();
    Lang.set(Config.d.lang || (sys.indexOf('ru') === 0 ? 'ru' : 'en'));
    this.applyI18n();

    PinPad.init();
    Player.init();
    Browser.init();
    Settings.init();
    Setup.init();
    this.screens = { setup: Setup, browser: Browser, player: Player, settings: Settings };
    this.rebuildFavSet();

    document.addEventListener('keydown', function (e) { App.onKey(e); }, true);
    document.addEventListener('visibilitychange', function () {
      var visible = !document.hidden;
      if (!visible) { App.hideAllLocked('сворачивание'); App.openLocked = null; }
      Player.onVisibility(visible);
      if (visible) App.refreshScreen();
    });
    setInterval(function () { App.checkLocks(); }, 30000);

    this.start();
  },

  start: function () {
    var self = this, src = Config.d.source;
    Log.info('Версия ' + this.version + ', язык ' + Lang.cur + ', движок ' + Config.d.engine +
      ', hls.js ' + (window.Hls ? Hls.version + (Hls.isSupported() ? '' : ' (не поддерж.)') : 'нет') + ', плейлист: ' + (src ? Log.url(src.url) : 'не задан'));
    if (!src) { this.show('setup'); return; }

    var cache = Store.get('playlist', null);
    if (cache && cache.url === src.url && cache.channels && cache.channels.length) {
      // Сразу показываем сохранённый список, свежий подтягиваем в фоне
      Log.info('Список из кэша: ' + cache.channels.length + ' каналов');
      this.setChannels(cache, false);
      this.show('browser');
      this.autoplayLast();
      // Обновляем плейлист в фоне, но только когда канал уже пошёл:
      // скачивание и разбор (около секунды на ТВ) не должны тормозить старт видео
      Player.onceStarted(function () {
        Source.load(src).then(function (res) {
          self.setChannels(res, true);
          if (self.screen === Browser) Browser.enter({});
        }).catch(function () { Toast.show(t('fromCache'), 4000); });
      });
      return;
    }

    Busy.show(t('loading'));
    Source.load(src).then(function (res) {
      Busy.hide();
      self.setChannels(res, true);
      self.show('browser');
      self.autoplayLast();
    }).catch(function (err) {
      Busy.hide();
      self.show('setup', { allowBack: false, error: self.errText(err) });
    });
  },

  // ---------- Данные ----------
  setChannels: function (res, save) {
    this.channels = res.channels;
    this.meta = res.meta || {};
    var order = [], map = {}, byNum = {};
    this.channels.forEach(function (ch) {
      if (!map[ch.group]) { map[ch.group] = []; order.push(ch.group); }
      map[ch.group].push(ch);
      byNum[ch.n] = ch;
    });
    this.groupOrder = order;
    this.groupMap = map;
    this.byNum = byNum;
    if (save) {
      var ok = Store.set('playlist', { url: Config.d.source.url, at: Date.now(), meta: this.meta, channels: this.channels });
      if (!ok) Log.warn('Кэш плейлиста не сохранился (мало места в localStorage)');
    }
  },

  setSource: function (src, res) {
    var d = Config.d;
    var changed = !d.source || d.source.url !== src.url;
    d.source = src;
    if (changed) {
      d.last = null;
      res.channels.forEach(function (ch) {
        if (ADULT_RE.test(ch.group) && d.hidden.indexOf(ch.group) < 0) d.hidden.push(ch.group);
      });
    }
    Config.save();
    Log.info('Новый источник: ' + Log.url(src.url) + (changed ? ', скрыты группы: ' + (d.hidden.join(', ') || 'нет') : ''));
    this.setChannels(res, true);
  },

  isHidden: function (g) { return Config.d.hidden.indexOf(g) >= 0; },
  // Без PIN-кода замок не действует
  isLocked: function (g) { return !!Config.d.pin && Config.d.locked.indexOf(g) >= 0; },
  // Канал недоступен без PIN: группа скрыта или закрыта
  isRestricted: function (g) { return this.isHidden(g) || this.isLocked(g); },
  isOpen: function (g) { return !this.isLocked(g) || this.openLocked === g; },

  listFor: function (gid) {
    var self = this;
    if (gid === '__fav') {
      return this.channels.filter(function (c) { return self.favSet[c.name] && !self.isRestricted(c.group); });
    }
    if (gid === '__all') {
      return this.channels.filter(function (c) { return !self.isRestricted(c.group); });
    }
    // Закрытая группа отдаёт каналы только после PIN-кода
    if (this.isHidden(gid) || !this.isOpen(gid) || !this.groupMap[gid]) return [];
    return this.groupMap[gid];
  },

  rebuildFavSet: function () {
    var s = {};
    Config.d.favorites.forEach(function (n) { s[n] = true; });
    this.favSet = s;
  },

  isFav: function (ch) { return !!this.favSet[ch.name]; },

  toggleFav: function (ch) {
    var f = Config.d.favorites, i = f.indexOf(ch.name);
    if (i >= 0) { f.splice(i, 1); Toast.show(t('favRemoved', { name: ch.name })); }
    else { f.push(ch.name); Toast.show(t('favAdded', { name: ch.name })); }
    Config.save();
    this.rebuildFavSet();
  },

  // ---------- Воспроизведение ----------
  guardPlay: function (ch, cb) {
    var self = this, g = ch.group;
    if (this.isHidden(g)) return;
    if (this.isOpen(g)) { cb(); return; }
    this.askPin(function () { self.unlockGroup(g); cb(); });
  },

  playFrom: function (list, idx, gid) {
    var self = this;
    this.guardPlay(list[idx], function () {
      Player.play(list, idx, gid);
      self.show('player');
    });
  },

  playNumber: function (n) {
    var ch = this.byNum[n];
    if (!ch || this.isRestricted(ch.group)) { Toast.show(t('noChannel', { n: n })); return; }
    var list = this.listFor('__all');
    this.playFrom(list, list.indexOf(ch), '__all');
  },

  autoplayLast: function () {
    var last = Config.d.last;
    if (!last) return;
    var gid = last.gid || '__all';
    var list = this.listFor(gid);
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].name === last.name) { idx = i; break; }
    if (idx < 0) {
      gid = '__all';
      list = this.listFor(gid);
      for (var j = 0; j < list.length; j++) if (list[j].name === last.name) { idx = j; break; }
    }
    // Каналы под PIN-кодом автоматически не включаем
    if (idx < 0 || this.isRestricted(list[idx].group)) return;
    Player.play(list, idx, gid);
    this.show('player');
  },

  // ---------- PIN-код ----------
  // Спрашивает PIN каждый раз (запоминание — забота вызывающего). Без PIN — сразу cb.
  askPin: function (cb) {
    if (!Config.d.pin) { cb(); return; }
    PinPad.open({
      title: t('pinEnter'),
      onDone: function (p, pad) {
        if (hashPin(p) === Config.d.pin) {
          pad.close();
          cb();
        } else {
          pad.reset(t('pinEnter'), t('pinWrong'));
        }
      }
    });
  },

  setNewPin: function (cb) {
    var self = this, first = null;
    PinPad.open({
      title: t('pinNew'),
      onDone: function (p, pad) {
        if (first === null) { first = p; pad.reset(t('pinRepeat')); return; }
        if (p === first) {
          Config.d.pin = hashPin(p);
          Config.save();
          pad.close();
          Toast.show(t('pinSaved'));
          if (cb) cb();
        } else {
          first = null;
          pad.reset(t('pinNew'), t('pinMismatch'));
        }
      }
    });
  },

  // ---------- Замки групп ----------
  unlockGroup: function (g) {
    this.openLocked = g;
    this.lockTouch[g] = Date.now();
    Log.info('PIN: открыта группа «' + g + '»');
  },

  // Закрыть открытую группу, если из неё ушли (и её канал сейчас не играет)
  relockIfLeft: function (currentGid) {
    var g = this.openLocked;
    if (g === null || currentGid === g) return;
    if (Player.ch && Player.ch.group === g && Player.state !== 'idle') return;
    this.lockTouch[g] = Date.now();
    this.openLocked = null;
  },

  // Группу «смотрят»: открыта PIN-кодом и (играет её канал или она выбрана в списке)
  isLockActive: function (g) {
    if (this.openLocked !== g) return false;
    if (Player.ch && Player.ch.group === g && Player.state !== 'idle') return true;
    return this.screen === Browser && Browser.gid === g;
  },

  hideGroup: function (g, why) {
    var d = Config.d;
    d.locked = d.locked.filter(function (x) { return x !== g; });
    if (d.hidden.indexOf(g) < 0) d.hidden.push(g);
    if (this.openLocked === g) this.openLocked = null;
    delete this.lockTouch[g];
    Config.save();
    Log.info('Группа «' + g + '» скрыта: ' + why);
  },

  hideAllLocked: function (why) {
    var self = this;
    Config.d.locked.slice().forEach(function (g) { self.hideGroup(g, why); });
  },

  // Раз в 30 с: группы «Под PIN-кодом», которые не смотрят 10 минут, становятся скрытыми
  checkLocks: function () {
    var self = this, now = Date.now(), changed = false;
    Config.d.locked.slice().forEach(function (g) {
      if (self.isLockActive(g)) { self.lockTouch[g] = now; return; }
      if (!self.lockTouch[g]) self.lockTouch[g] = now;
      if (now - self.lockTouch[g] >= self.LOCK_IDLE_MS) { self.hideGroup(g, '10 минут без просмотра'); changed = true; }
    });
    if (changed) this.refreshScreen();
  },

  // Перерисовать текущий экран после смены замков
  refreshScreen: function () {
    if (Player.ch && this.isHidden(Player.ch.group)) {
      Player.stop();
      if (this.screen === Player) this.show('browser');
    }
    if (this.screen === Browser) Browser.enter({});
    else if (this.screen === Settings) Settings.draw();
  },

  // ---------- Экраны ----------
  show: function (name, opts) {
    var s = this.screens[name];
    if (this.screen && this.screen !== s) {
      this.screen.el.classList.remove('active');
      if (this.screen.leave) this.screen.leave();
    }
    if (this.screen !== s) this.prev = this.screen;
    this.screen = s;
    s.el.classList.add('active');
    if (s.enter) s.enter(opts || {});
  },

  confirmExit: function () {
    Confirm.open(t('exitTitle'), [
      { label: t('exit'), action: function () { window.close(); } },
      { label: t('cancel') }
    ]);
  },

  errText: function (err) {
    err = err || {};
    if (err.code === 'http') return t('errHttp', { code: err.status });
    if (err.code === 'timeout') return t('errTimeout');
    if (err.code === 'empty') return t('errEmpty');
    return t('errNetwork');
  },

  applyI18n: function () {
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-i18n'));
    document.title = t('appName');
  },

  // ---------- Пульт ----------
  onKey: function (e) {
    var code = e.keyCode;
    var inInput = isInput(e.target);
    if (code === 27 || (code === 8 && !inInput)) code = K.BACK;
    if (!inInput) {
      if (code === 89) code = K.YELLOW;
      else if (code === 66) code = K.BLUE;
    }

    if (PinPad.isOpen) { if (PinPad.onKey(code)) e.preventDefault(); return; }
    if (Confirm.isOpen) { if (Confirm.onKey(code)) e.preventDefault(); return; }

    if (!inInput && this.screen && this.screen.acceptsDigits) {
      var d = digitOf(code);
      if (d >= 0) { Num.press(d); e.preventDefault(); return; }
      if (Num.buf && code === K.OK) { Num.commit(); e.preventDefault(); return; }
    }

    if (this.screen && this.screen.onKey(code, e)) e.preventDefault();
  }
};

window.addEventListener('load', function () { App.init(); });
