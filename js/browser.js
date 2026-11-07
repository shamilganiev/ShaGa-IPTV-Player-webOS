// Экран списка: группы слева, каналы справа.
var Browser = {
  el: null,
  groups: null,      // VList групп
  chans: null,       // VList каналов
  panel: 'groups',
  groupItems: [],
  gid: '__all',
  memory: {},        // gid -> на каком канале стояли в этой группе
  acceptsDigits: true,

  init: function () {
    var self = this;
    this.el = $('browser');

    this.groups = new VList($('groupList'), {
      rowH: 70,
      render: this.renderGroup,
      onMove: function (i) { self.openGroup(i); },
      onActivate: function (i) { self.openGroup(i); self.enterGroup(); },
      onPointer: function () { self.focusPanel('groups'); }
    });

    this.chans = new VList($('chanList'), {
      rowH: 84,
      render: this.renderChannel,
      onMove: function (i) { self.memory[self.gid] = i; },
      onActivate: function (i) { App.playFrom(self.chans.items, i, self.gid); },
      onPointer: function () { self.focusPanel('channels'); }
    });
  },

  // ---------- Отрисовка строк ----------
  renderGroup: function (row, g) {
    if (!row._g) {
      row.classList.add('g-row');
      row.innerHTML = '<span class="g-name"></span><span class="ico lock">' + ICON_LOCK +
        '</span><span class="g-count"></span>';
      row._g = { name: row.children[0], lock: row.children[1], count: row.children[2] };
    }
    row._g.name.textContent = g.name;
    row._g.lock.style.display = g.locked ? '' : 'none';
    row._g.count.textContent = g.closed ? '' : g.count;
  },

  renderChannel: function (row, ch) {
    if (!row._c) {
      row.classList.add('c-row');
      row.innerHTML = '<span class="c-num"></span><span class="c-logo"><img alt=""></span>' +
        '<span class="c-name"></span><span class="ico lock">' + ICON_LOCK + '</span>' +
        '<span class="ico star">' + ICON_STAR + '</span>';
      var logo = row.children[1], img = logo.firstChild;
      img.onerror = function () { logo.classList.add('noimg'); };
      row._c = { num: row.children[0], logo: logo, img: img, name: row.children[2],
                 lock: row.children[3], star: row.children[4], src: null };
    }
    var c = row._c;
    c.num.textContent = ch.n;
    c.name.textContent = ch.name;
    if (c.src !== ch.logo) {
      c.src = ch.logo;
      c.logo.setAttribute('data-l', (ch.name.charAt(0) || '?').toUpperCase());
      if (ch.logo) { c.logo.classList.remove('noimg'); c.img.src = ch.logo; }
      else { c.logo.classList.add('noimg'); c.img.removeAttribute('src'); }
    }
    c.lock.style.display = App.isLocked(ch.group) ? '' : 'none';
    c.star.style.display = App.isFav(ch) ? '' : 'none';
    row.classList.toggle('playing', Player.isCurrent(ch));
  },

  // ---------- Данные ----------
  buildGroups: function () {
    var items = [
      { id: '__fav', name: t('favorites'), count: App.listFor('__fav').length },
      { id: '__all', name: t('allChannels'), count: App.listFor('__all').length }
    ];
    App.groupOrder.forEach(function (g) {
      if (App.isHidden(g)) return;
      var locked = App.isLocked(g);
      items.push({ id: g, name: g || t('noGroup'), count: App.groupMap[g].length,
                   locked: locked, closed: locked && !App.isOpen(g) });
    });
    this.groupItems = items;
  },

  indexOfGroup: function (gid) {
    for (var i = 0; i < this.groupItems.length; i++) if (this.groupItems[i].id === gid) return i;
    return -1;
  },

  openGroup: function (i) {
    var g = this.groupItems[i];
    if (!g) return;
    App.relockIfLeft(g.id);           // ушли из открытой PIN-кодом группы — она снова закрыта
    g.closed = g.locked && !App.isOpen(g.id);
    this.groups.render();
    this.gid = g.id;
    var items = App.listFor(g.id);    // для закрытой группы — пусто
    this.chans.setItems(items, this.memory[g.id] || 0);
    $('groupTitle').textContent = g.name;
    $('groupCount').textContent = g.closed ? '' : Lang.count(items.length);
    var empty = $('chanEmpty');
    empty.textContent = g.closed ? t('lockedGroup') : g.id === '__fav' ? t('emptyFav') : t('emptyGroup');
    empty.classList.toggle('on', items.length === 0);
  },

  // OK / вправо на группе: закрытая — спросить PIN, потом перейти к каналам
  enterGroup: function () {
    var self = this, g = this.groupItems[this.groups.index];
    if (g && g.closed) {
      App.askPin(function () {
        App.unlockGroup(g.id);
        self.openGroup(self.groups.index);
        self.focusPanel('channels');
      });
      return;
    }
    this.focusPanel('channels');
  },

  focusPanel: function (p) {
    if (p === 'channels' && !this.chans.items.length) p = 'groups';
    this.panel = p;
    this.groups.setActive(p === 'groups');
    this.chans.setActive(p === 'channels');
  },

  // opts.fromPlayer — встать на играющий канал; opts.keep — сохранить текущее место
  enter: function (opts) {
    opts = opts || {};
    this.buildGroups();

    var gid = this.gid, chIdx = null, panel = this.panel;
    if (opts.fromPlayer && Player.ch) {
      gid = Player.gid;
      panel = 'channels';
    }
    var gi = this.indexOfGroup(gid);
    if (gi < 0) {
      // Группа исчезла или скрыта; по умолчанию — Избранное, если оно не пустое
      gi = this.indexOfGroup(App.listFor('__fav').length ? '__fav' : '__all');
      panel = 'groups';
    }
    this.groups.setItems(this.groupItems, gi);
    this.openGroup(gi);

    if (opts.fromPlayer && Player.ch) {
      var items = this.chans.items;
      for (var i = 0; i < items.length; i++) {
        if (Player.isCurrent(items[i])) { chIdx = i; break; }
      }
      if (chIdx !== null) { this.chans.setIndex(chIdx); this.memory[this.gid] = chIdx; }
    }
    this.panel = null;
    this.focusPanel(panel);
  },

  onKey: function (code) {
    var list = this.panel === 'groups' ? this.groups : this.chans;
    switch (code) {
      case K.UP: list.move(-1); return true;
      case K.DOWN: list.move(1); return true;
      case K.CHUP: list.page(-1); return true;
      case K.CHDN: list.page(1); return true;
      case K.LEFT: this.focusPanel('groups'); return true;
      case K.RIGHT: if (this.panel === 'groups') this.enterGroup(); return true;
      case K.OK:
        if (this.panel === 'groups') this.enterGroup();
        else if (this.chans.items.length) {
          var ch = this.chans.current();
          if (Player.isCurrent(ch) && Player.state !== 'error') App.show('player');
          else App.playFrom(this.chans.items, this.chans.index, this.gid);
        }
        return true;
      case K.YELLOW:
        if (this.panel === 'channels' && this.chans.items.length) {
          App.toggleFav(this.chans.current());
          this.refreshCounts();
        }
        return true;
      case K.BLUE: App.show('settings'); return true;
      // Back отматывает по шагу: каналы → группы → остановить видео → предложить закрыть
      case K.BACK:
        if (this.panel === 'channels') this.focusPanel('groups');
        else if (Player.ch) { Player.stop(); this.chans.render(); }
        else App.confirmExit();
        return true;
    }
    return false;
  },

  // После изменения избранного: обновить счётчик и, если мы в Избранном, сам список
  refreshCounts: function () {
    var favIdx = this.indexOfGroup('__fav');
    this.groupItems[favIdx].count = App.listFor('__fav').length;
    this.groups.render();
    if (this.gid === '__fav') {
      var keep = this.chans.index;
      this.memory.__fav = keep;
      this.openGroup(favIdx);
      this.focusPanel(this.chans.items.length ? 'channels' : 'groups');
    } else {
      this.chans.render();
    }
  }
};
