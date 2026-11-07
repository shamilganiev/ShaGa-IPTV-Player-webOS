// Первый запуск и смена плейлиста.
var Setup = {
  el: null,
  idx: 0,            // 0 — поле ввода, 1 — «Загрузить», 2 — «Бесплатные каналы»
  allowBack: false,
  // Бесплатные легальные каналы (Free-TV на GitHub) — для проверки в магазине и для знакомства
  DEMO_URL: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',

  init: function () {
    var self = this;
    this.el = $('setup');
    this.input = $('urlInput');
    this.btns = [this.input, $('btnLoad'), $('btnDemo')];

    this.btns.forEach(function (b, i) {
      b.addEventListener('mousemove', function () {
        if (self.idx !== i) { self.idx = i; self.draw(); }
      });
    });
    this.input.addEventListener('click', function () { self.idx = 0; self.draw(); });
    $('btnLoad').addEventListener('click', function () { self.submit(); });
    $('btnDemo').addEventListener('click', function () { self.submit(self.DEMO_URL); });
  },

  enter: function (opts) {
    opts = opts || {};
    this.allowBack = !!opts.allowBack;
    var src = Config.d.source;
    this.input.value = (src && src.type === 'url' && opts.allowBack) ? src.url : '';
    this.input.placeholder = t('urlPlaceholder');
    $('setupError').textContent = opts.error || '';
    this.idx = this.input.value ? 1 : 0;
    this.draw();
  },

  leave: function () { this.input.blur(); },

  draw: function () {
    for (var i = 0; i < this.btns.length; i++) this.btns[i].classList.toggle('focus', i === this.idx);
  },

  showError: function (msg) { $('setupError').textContent = msg; },

  submit: function (url) {
    var self = this;
    url = String(url || this.input.value).trim();
    this.input.blur();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      this.showError(t('errInvalidUrl'));
      this.idx = 0;
      this.draw();
      return;
    }
    this.showError('');
    var src = { type: 'url', url: url };
    Busy.show(t('loading'));
    Source.load(src).then(function (res) {
      Busy.hide();
      App.setSource(src, res);
      App.show('browser');
    }).catch(function (err) {
      Busy.hide();
      self.showError(App.errText(err));
    });
  },

  onKey: function (code) {
    var inInput = document.activeElement === this.input;
    if (inInput) {
      // Пока открыта клавиатура, перехватываем только навигацию — буквы идут в поле
      if (code === K.OK) { this.submit(); return true; }
      if (code === K.DOWN) { this.input.blur(); this.idx = 1; this.draw(); return true; }
      if (code === K.BACK) { this.input.blur(); return true; }
      return false;
    }
    switch (code) {
      case K.UP: this.idx = 0; this.draw(); return true;
      case K.DOWN: if (this.idx === 0) { this.idx = 1; this.draw(); } return true;
      case K.LEFT: if (this.idx === 2) { this.idx = 1; this.draw(); } return true;
      case K.RIGHT: if (this.idx === 1) { this.idx = 2; this.draw(); } return true;
      case K.OK:
        if (this.idx === 0) this.input.focus();
        else if (this.idx === 1) this.submit();
        else this.submit(this.DEMO_URL);
        return true;
      case K.BACK:
        if (this.allowBack) App.show('settings');
        else App.confirmExit();
        return true;
    }
    return false;
  }
};
