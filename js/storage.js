// Всё хранится в localStorage телевизора. Ошибки (переполнение, запрет) не роняют приложение.
var Store = {
  get: function (key, def) {
    try {
      var v = localStorage.getItem(key);
      return v == null ? def : JSON.parse(v);
    } catch (e) { return def; }
  },
  set: function (key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  },
  del: function (key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }
};

var Config = {
  d: null,
  defaults: {
    source: null,     // { type: 'url', url: '...' } — потом добавится { type: 'qr', ... }
    lang: null,       // null = по языку телевизора
    favorites: [],    // названия каналов (не ссылки: в ссылках токен, он может смениться)
    hidden: [],       // скрытые группы
    locked: [],       // группы под PIN-кодом
    pin: null,        // хеш PIN-кода
    last: null,       // { name, gid } — последний канал
    engine: 'native'  // 'native' — встроенный плеер webOS, 'hlsjs' — hls.js
  },
  load: function () {
    var s = Store.get('config', {}) || {};
    for (var k in this.defaults) {
      if (!(k in s)) s[k] = JSON.parse(JSON.stringify(this.defaults[k]));
    }
    this.d = s;
    return s;
  },
  save: function () { Store.set('config', this.d); }
};

// Это родительский замок, а не защита банковского уровня: хеш нужен лишь,
// чтобы PIN не лежал открытым текстом.
function hashPin(p) {
  var h = 5381;
  for (var i = 0; i < p.length; i++) h = ((h << 5) + h + p.charCodeAt(i)) | 0;
  return 'h' + (h >>> 0).toString(36);
}
