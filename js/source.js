// Слой «откуда берётся плейлист». Сейчас только { type: 'url' }.
// QR-передача добавится сюда же отдельным type, остальной код не изменится.
var Source = {
  TIMEOUT: 20000,

  fetchText: function (url) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var t0 = Date.now();
      Log.info('Плейлист: загрузка ' + Log.url(url));
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = self.TIMEOUT;
      xhr.onload = function () {
        // status 0 бывает у локальных файлов — тогда смотрим, пришёл ли текст
        if ((xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.responseText)) {
          Log.info('Плейлист: получено ' + Math.round(xhr.responseText.length / 1024) + ' КБ за ' + (Date.now() - t0) + ' мс');
          resolve(xhr.responseText);
        } else {
          Log.error('Плейлист: HTTP ' + xhr.status);
          reject({ code: 'http', status: xhr.status });
        }
      };
      xhr.onerror = function () { Log.error('Плейлист: сетевая ошибка (нет связи или CORS) через ' + (Date.now() - t0) + ' мс'); reject({ code: 'network' }); };
      xhr.ontimeout = function () { Log.error('Плейлист: таймаут ' + self.TIMEOUT + ' мс'); reject({ code: 'timeout' }); };
      xhr.send();
    });
  },

  load: function (src) {
    if (!src || src.type !== 'url') return Promise.reject({ code: 'network' });
    return this.fetchText(src.url).then(function (text) {
      var t1 = Date.now();
      var res = M3U.parse(text);
      var groups = {};
      res.channels.forEach(function (c) { groups[c.group] = 1; });
      Log.info('Плейлист: разобрано ' + res.channels.length + ' каналов, ' + Object.keys(groups).length +
        ' групп за ' + (Date.now() - t1) + ' мс; EPG: ' + (res.meta.epg || 'нет'));
      if (!res.channels.length) { Log.warn('Плейлист: каналов нет, начало файла: ' + String(text).slice(0, 120)); throw { code: 'empty' }; }
      return res;
    });
  }
};
