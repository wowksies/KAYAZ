                                                                            
                                                             
(function () {
  'use strict';

  var state = { role: '', user: '', challengeId: '' };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function msg(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'msg ' + (kind || 'err') + (text ? ' on' : '');
  }

                                                                           
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'x-requested-with': 'kz-panel' };
    if (opts.body) headers['content-type'] = 'application/json';
    return fetch('/api/' + path, {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        return { ok: r.ok, status: r.status, data: j };
      });
    });
  }

                                                                              
  function showLoginChallenge(data) {
    state.challengeId = data.challengeId || '';
    $('loginForm').hidden = true;
    $('loginVerifyForm').hidden = false;
    $('loginCode').value = '';
    msg($('loginVerifyMsg'), 'code sent to your Discord DMs, enter it below', 'ok');
    $('loginCode').focus();
  }

  function showLoginForm() {
    state.challengeId = '';
    $('loginVerifyForm').hidden = true;
    $('loginForm').hidden = false;
    $('loginCode').value = '';
    msg($('loginVerifyMsg'), '');
    msg($('loginMsg'), '');
  }

  function completeLogin(r) {
    boot({ user: r.data.user, role: r.data.role });
  }

  var loginForm = $('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('loginBtn');
      var u = $('lu').value.trim();
      var p = $('lp').value;
      if (!u || !p) return msg($('loginMsg'), 'enter your username or email and password');
      btn.disabled = true;
      btn.textContent = 'checking...';
      api('login', { method: 'POST', body: { user: u, password: p } }).then(function (r) {
        btn.disabled = false;
        btn.textContent = 'sign in';
        if (r.data && r.data.challenge === 'discord') {
          $('lp').value = '';
          showLoginChallenge(r.data);
          return;
        }
        if (!r.ok) return msg($('loginMsg'), r.data.error || 'sign in failed');
        $('lp').value = '';
        completeLogin(r);
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = 'sign in';
        msg($('loginMsg'), 'network error, try again');
      });
    });
  }

  var loginVerifyForm = $('loginVerifyForm');
  if (loginVerifyForm) {
    loginVerifyForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('loginVerifyBtn');
      var code = $('loginCode').value.trim();
      if (!/^[0-9]{6}$/.test(code)) return msg($('loginVerifyMsg'), 'enter the six digit code');
      if (!state.challengeId) return showLoginForm();
      btn.disabled = true;
      btn.textContent = 'verifying...';
      api('login', { method: 'POST', body: { challengeId: state.challengeId, code: code } }).then(function (r) {
        btn.disabled = false;
        btn.textContent = 'verify code';
        if (!r.ok) return msg($('loginVerifyMsg'), r.data.error || 'wrong or expired code');
        state.challengeId = '';
        completeLogin(r);
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = 'verify code';
        msg($('loginVerifyMsg'), 'network error, try again');
      });
    });
  }

  if ($('loginBack')) {
    $('loginBack').addEventListener('click', function () {
      showLoginForm();
      if ($('lu')) $('lu').focus();
    });
  }

  function boot(profile) {
    state.user = profile.user || '';
    state.role = profile.role === 'admin' ? 'admin' : 'reseller';
    document.body.setAttribute('data-role', state.role);

    if (state.role !== 'admin') {
      [].forEach.call(document.querySelectorAll('[data-admin]'), function (el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    }

    $('gate').hidden = true;
    $('app').hidden = false;
    if ($('whoami')) $('whoami').textContent = state.user + ' · ' + state.role;

    loadAccount();
    loadKeys('r6');
    loadKeys('site');
    if (state.role === 'admin') {
      loadOverview();
      loadResellers();
      loadGames();
    }

                                                                            
    var hash = String((window.location && window.location.hash) || '').replace('#', '');
    if (hash && showTab(hash)) {
      var load = loaders[hash];
      if (load) load();
    }
  }

  var loaders = {
    overview: loadOverview,
    keys: function () { loadKeys('r6'); },
    sitekeys: function () { loadKeys('site'); },
    resellers: loadResellers,
    games: loadGames
  };

  function showTab(name) {
    var found = false;
    [].forEach.call(document.querySelectorAll('.tab'), function (x) {
      var on = x.getAttribute('data-tab') === name;
      x.classList.toggle('on', on);
      if (on) found = true;
    });
    [].forEach.call(document.querySelectorAll('.panel'), function (p) {
      p.classList.toggle('on', p.id === 'tab-' + name);
    });
    return found;
  }

  function goTab(name) {
    if (!showTab(name)) return;
    if (window.history && window.history.replaceState) {
      try { window.history.replaceState(null, '', '#' + name); } catch (e) {}
    }
    var load = loaders[name];
    if (load) load();
  }

  [].forEach.call(document.querySelectorAll('.tab'), function (t) {
    t.addEventListener('click', function () { goTab(t.getAttribute('data-tab')); });
  });

  if ($('out')) {
    $('out').addEventListener('click', function () {
      api('logout', { method: 'POST' }).then(function () { location.href = '/'; })
        .catch(function () { location.href = '/'; });
    });
  }

                                                                              
  function loadOverview() {
    if (!$('sKeys')) return;
    var out = {};
    Promise.all([
      api('keys?target=r6').then(function (r) { if (r.ok) out.r6 = r.data.keys || []; }),
      api('keys?target=site').then(function (r) { if (r.ok) out.site = r.data.keys || []; }),
      api('resellers').then(function (r) { if (r.ok) out.accounts = r.data.resellers || []; }),
      api('games').then(function (r) { if (r.ok) out.games = r.data.games || []; }),
      api('audit').then(function (r) { if (r.ok) out.events = r.data.events || []; })
    ]).then(function () {
      var keys = (out.r6 || []).concat(out.site || []);
      var accounts = out.accounts || [];
      var games = out.games || [];
      if ($('sKeys')) $('sKeys').textContent = keys.length;
      if ($('sUnused')) $('sUnused').textContent = keys.filter(function (k) { return !k.used && !k.revoked; }).length;
      if ($('sUsed')) $('sUsed').textContent = keys.filter(function (k) { return k.used && !k.revoked; }).length;
      if ($('sRevoked')) $('sRevoked').textContent = keys.filter(function (k) { return k.revoked; }).length;
      if ($('sAccounts')) $('sAccounts').textContent = accounts.length;
      if ($('sGames')) $('sGames').textContent = games.length;
      renderEvents(out.events || []);
      msg($('ovMsg'), '');
    }).catch(function () { msg($('ovMsg'), 'network error'); });
  }

  function renderEvents(events) {
    var box = $('ovList');
    if (!box) return;
    if ($('ovCount')) $('ovCount').textContent = events.length;
    if (!events.length) {
      box.innerHTML = '<div class="empty">nothing recorded yet</div>';
      return;
    }
    var rows = events.map(function (e) {
      return '<tr>' +
        '<td class="mono dim nowrap">' + (e.at ? new Date(e.at).toLocaleString() : '') + '</td>' +
        '<td>' + esc(e.who) + '</td>' +
        '<td><span class="tag">' + esc(e.action) + '</span></td>' +
        '<td class="hide-s mono dim">' + esc(e.target) + '</td>' +
        '</tr>';
    }).join('');
    box.innerHTML = '<div class="scroll"><table><thead><tr><th>when</th><th>who</th>' +
      '<th>action</th><th class="hide-s">target</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  if ($('ovRefresh')) $('ovRefresh').addEventListener('click', loadOverview);

                                                                              
  function quotaText(quota, used) {
    if (!quota) return used + ' keys on this account · no limit';
    return used + ' of ' + quota + ' keys used';
  }

  var KUI = {
    r6: {
      list: 'kList', count: 'kCount', quota: 'quotaLine', msg: 'kMsg', out: 'kOut',
      gen: 'kGen', n: 'kn', label: 'kl', owner: 'ko', duration: 'kd',
      refresh: 'kRefresh', prune: 'kPrune'
    },
    site: {
      list: 'gkList', count: 'gkCount', quota: 'gQuotaLine', msg: 'gkMsg', out: 'gkOut',
      gen: 'gkGen', n: 'gkn', label: 'gkl', owner: 'gko',
      refresh: 'gkRefresh', prune: 'gkPrune'
    }
  };

  function expiresCell(k) {
    if (!k.used) {
      return k.durationDays
        ? '<span class="dim">' + k.durationDays + 'd from bind</span>'
        : '<span class="dim">lifetime</span>';
    }
    if (!k.expiresAt) {
      return k.durationDays
        ? '<span class="dim">' + k.durationDays + 'd</span>'
        : '<span class="dim">lifetime</span>';
    }
    var left = k.expiresAt - Math.floor(Date.now() / 1000);
    if (left <= 0) return '<span class="st rev">expired</span>';
    if (left < 86400) return Math.floor(left / 3600) + 'h left';
    return Math.floor(left / 86400) + 'd left';
  }

  function loadKeys(target) {
    target = target === 'site' ? 'site' : 'r6';
    var ui = KUI[target];
    var box = $(ui.list);
    if (!box) return;
    api('keys?target=' + target).then(function (r) {
      if (!r.ok) {
        box.innerHTML = '<div class="empty">' + esc(r.data.error || 'could not load keys') + '</div>';
        return;
      }
      var keys = r.data.keys || [];
      if ($(ui.quota)) $(ui.quota).textContent = quotaText(Number(r.data.quota) || 0, Number(r.data.used) || 0);
      if ($(ui.count)) $(ui.count).textContent = keys.length;
      if (!keys.length) {
        box.innerHTML = '<div class="empty">no keys yet</div>';
        return;
      }

      var admin = state.role === 'admin';
      var rows = keys.map(function (k) {
        var st = k.revoked
          ? '<span class="st rev">revoked</span>'
          : (k.used ? '<span class="st used">in use</span>' : '<span class="st free">unused</span>');
        var isR6 = target === 'r6';
        return '<tr>' +
          '<td class="mono">' + esc(k.shown || '••••') + '</td>' +
          '<td>' + st + '</td>' +
          (isR6 ? '<td class="hide-s">' + expiresCell(k) + '</td>' : '') +
          (admin ? '<td class="hide-s">' + esc(k.ownerName || 'admin') + '</td>' : '') +
          '<td class="hide-s">' + esc(k.label || '') + '</td>' +
          '<td class="hide-s mono dim">' + (k.created ? new Date(k.created).toLocaleDateString() : '') + '</td>' +
          '<td class="right nowrap">' +
            (isR6 ? '<button class="btn sm" type="button" data-kdur="' + esc(k.h) + '">duration</button> ' : '') +
            (isR6 && admin && k.used ? '<button class="btn sm d" type="button" data-kban="' + esc(k.h) + '">ban hwid</button> ' : '') +
            (k.used ? '<button class="btn sm" type="button" data-reset="' + esc(k.h) + '">unbind</button> ' : '') +
            '<button class="btn sm" type="button" data-rev="' + esc(k.h) + '" data-on="' + (k.revoked ? '0' : '1') + '">' +
              (k.revoked ? 'restore' : 'revoke') + '</button> ' +
            '<button class="btn sm d" type="button" data-kdel="' + esc(k.h) + '">delete</button>' +
          '</td></tr>';
      }).join('');

      var isR6 = target === 'r6';
      box.innerHTML = '<div class="scroll"><table><thead><tr><th>key</th><th>status</th>' +
        (isR6 ? '<th class="hide-s">expires</th>' : '') +
        (admin ? '<th class="hide-s">account</th>' : '') +
        '<th class="hide-s">label</th><th class="hide-s">made</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';

      bindKeys(box, target);
    }).catch(function () {
      box.innerHTML = '<div class="empty">network error</div>';
    });
  }

  function bindKeys(box, target) {
    [].forEach.call(box.querySelectorAll('[data-kdel]'), function (b) {
      b.addEventListener('click', function () {
        if (!confirm('delete this key? any device using it loses access')) return;
        api('keys', { method: 'DELETE', body: { h: b.getAttribute('data-kdel'), target: target } })
          .then(function () { loadKeys(target); });
      });
    });
    [].forEach.call(box.querySelectorAll('[data-rev]'), function (b) {
      b.addEventListener('click', function () {
        api('keys', {
          method: 'PATCH',
          body: { h: b.getAttribute('data-rev'), revoked: b.getAttribute('data-on') === '1', target: target }
        }).then(function () { loadKeys(target); });
      });
    });
    [].forEach.call(box.querySelectorAll('[data-reset]'), function (b) {
      b.addEventListener('click', function () {
        if (!confirm('unbind this key from its device?')) return;
        api('keys', { method: 'PATCH', body: { h: b.getAttribute('data-reset'), reset: true, target: target } })
          .then(function () { loadKeys(target); });
      });
    });
    // r6 only: change the remaining duration on this key
    [].forEach.call(box.querySelectorAll('[data-kdur]'), function (b) {
      b.addEventListener('click', function () {
        var v = prompt('new duration (lifetime, 7d, 30d, 90d, 1y...)', '30d');
        if (v === null) return;
        api('keys', { method: 'PATCH', body: { h: b.getAttribute('data-kdur'), duration: v.trim() || 'lifetime', target: 'r6' } })
          .then(function (r) {
            if (!r.ok) alert(r.data.error || 'could not change duration');
            loadKeys('r6');
          });
      });
    });
    // r6 only, admin only: ban the hwid this key is bound to
    [].forEach.call(box.querySelectorAll('[data-kban]'), function (b) {
      b.addEventListener('click', function () {
        var reason = prompt('reason for banning this HWID (optional)', 'manual');
        if (reason === null) return;
        api('keys', { method: 'PATCH', body: { h: b.getAttribute('data-kban'), banHwid: true, banReason: reason, target: 'r6' } })
          .then(function (r) {
            if (!r.ok) alert(r.data.error || 'could not ban');
            else { loadKeys('r6'); loadBans(); }
          });
      });
    });
  }

  function bindKeyGen(target) {
    var ui = KUI[target];
    if (!$(ui.gen)) return;
    $(ui.gen).addEventListener('click', function () {
      var b = this;
      var body = { count: $(ui.n).value, label: $(ui.label).value, target: target };
      if (ui.duration && $(ui.duration)) body.duration = $(ui.duration).value;
      if ($(ui.owner) && $(ui.owner).value) body.owner = $(ui.owner).value;
      b.disabled = true;
      api('keys', { method: 'POST', body: body }).then(function (r) {
        b.disabled = false;
        if (!r.ok) return msg($(ui.msg), r.data.error || 'could not generate keys');
        var out = $(ui.out);
        out.className = 'codes-out on';
        out.innerHTML = (r.data.codes || []).map(function (c) {
          return '<div><span>' + esc(c) + '</span>' +
            '<button class="btn sm" type="button" data-cp="' + esc(c) + '">copy</button></div>';
        }).join('');
        [].forEach.call(out.querySelectorAll('[data-cp]'), function (x) {
          x.addEventListener('click', function () {
            navigator.clipboard.writeText(x.getAttribute('data-cp')).then(function () {
              x.textContent = 'copied';
              setTimeout(function () { x.textContent = 'copy'; }, 1200);
            });
          });
        });
        msg($(ui.msg), (r.data.codes || []).length + ' generated - copy them now', 'ok');
        $(ui.label).value = '';
        loadKeys(target);
      }).catch(function () {
        b.disabled = false;
        msg($(ui.msg), 'network error');
      });
    });
  }

  bindKeyGen('r6');
  bindKeyGen('site');

  ['r6', 'site'].forEach(function (t) {
    var ui = KUI[t];
    if ($(ui.refresh)) $(ui.refresh).addEventListener('click', function () { loadKeys(t); });
    if ($(ui.prune)) {
      $(ui.prune).addEventListener('click', function () {
        if (!confirm('delete every unused key in this section? this cannot be undone')) return;
        api('keys', { method: 'DELETE', body: { all: 'unused', target: t } }).then(function (r) {
          msg($(ui.msg), r.ok ? ('removed ' + r.data.removed) : 'failed', r.ok ? 'ok' : 'err');
          loadKeys(t);
        });
      });
    }
  });

  // ── HWID bans (admin only; lives under tab-keys) ──────────────────────
  function loadBans() {
    var box = $('bList');
    if (!box) return;
    api('keys?kind=bans&target=r6').then(function (r) {
      if (!r.ok) {
        box.innerHTML = '<div class="empty">' + esc(r.data.error || 'could not load bans') + '</div>';
        return;
      }
      var bans = r.data.bans || [];
      if ($('bCount')) $('bCount').textContent = bans.length;
      if (!bans.length) { box.innerHTML = '<div class="empty">no bans</div>'; return; }
      var rows = bans.map(function (x) {
        var when = x.at ? new Date(x.at * 1000).toLocaleString() : '';
        return '<tr>' +
          '<td class="mono">' + esc(x.hwid.slice(0, 16)) + '…</td>' +
          '<td class="hide-s">' + esc(x.reason || '') + '</td>' +
          '<td class="hide-s mono dim">' + esc(when) + '</td>' +
          '<td class="right"><button class="btn sm" type="button" data-unban="' + esc(x.hwid) + '">unban</button></td>' +
        '</tr>';
      }).join('');
      box.innerHTML = '<div class="scroll"><table><thead><tr><th>hwid</th><th class="hide-s">reason</th><th class="hide-s">when</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
      [].forEach.call(box.querySelectorAll('[data-unban]'), function (btn) {
        btn.addEventListener('click', function () {
          if (!confirm('remove this ban?')) return;
          api('keys', { method: 'DELETE', body: { kind: 'bans', hwid: btn.getAttribute('data-unban'), target: 'r6' } })
            .then(function () { loadBans(); });
        });
      });
    }).catch(function () { box.innerHTML = '<div class="empty">network error</div>'; });
  }

  if ($('bAdd')) {
    $('bAdd').addEventListener('click', function () {
      var hwid = ($('bHwid').value || '').trim().toLowerCase();
      var reason = ($('bReason').value || '').trim();
      if (!/^[a-f0-9]{32,96}$/.test(hwid)) {
        return msg($('bMsg'), 'HWID must be 32-96 lowercase hex characters', 'err');
      }
      api('keys', { method: 'POST', body: { kind: 'bans', target: 'r6', hwid: hwid, reason: reason } })
        .then(function (r) {
          if (!r.ok) return msg($('bMsg'), r.data.error || 'could not ban', 'err');
          $('bHwid').value = ''; $('bReason').value = '';
          msg($('bMsg'), 'banned', 'ok');
          loadBans();
        }).catch(function () { msg($('bMsg'), 'network error', 'err'); });
    });
  }
  if ($('bRefresh')) $('bRefresh').addEventListener('click', loadBans);
  if ($('bList')) loadBans();

                                                                              
  function loadResellers() {
    var box = $('rList');
    if (!box) return;
    api('resellers').then(function (r) {
      if (!r.ok) {
        box.innerHTML = '<div class="empty">' + esc(r.data.error || 'could not load accounts') + '</div>';
        return;
      }
      var list = r.data.resellers || [];
      if ($('rCount')) $('rCount').textContent = list.length;

      ['ko', 'gko'].forEach(function (id) {
        var sel = $(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">me (admin)</option>' + list.filter(function (a) {
          return !a.disabled;
        }).map(function (a) {
          return '<option value="' + esc(a.id) + '">' + esc(a.user) + ' · ' + esc(a.role) + '</option>';
        }).join('');
      });

      if (!list.length) {
        box.innerHTML = '<div class="empty">no accounts yet</div>';
        return;
      }

      var rows = list.map(function (a) {
        var st = a.disabled
          ? '<span class="st rev">disabled</span>'
          : '<span class="st free">active</span>';
        var mine = a.id === r.data.me;
        return '<tr>' +
          '<td><strong>' + esc(a.user) + '</strong>' + (mine ? ' <span class="tag">you</span>' : '') +
            (a.email ? '<div class="mono dim">' + esc(a.email) + '</div>' : '') +
            (a.discordId ? '<div class="mono dim">discord ' + esc(a.discordId) + '</div>' : '') + '</td>' +
          '<td><span class="tag">' + esc(a.role) + '</span></td>' +
          '<td>' + st + '</td>' +
          '<td class="hide-s mono">' + (a.quota ? a.quota : '∞') + ' · ' + a.used + ' used</td>' +
          '<td class="hide-s mono dim">' + (a.lastLogin ? new Date(a.lastLogin).toLocaleDateString() : 'never') + '</td>' +
          '<td class="right nowrap">' +
            (mine ? '' :
              '<button class="btn sm" type="button" data-redit="' + esc(a.id) + '">manage</button> ' +
              '<button class="btn sm d" type="button" data-rdel="' + esc(a.id) + '">delete</button>') +
          '</td></tr>' +
          '<tr class="edit-row" id="re-' + esc(a.id) + '" hidden><td colspan="6">' +
            '<div class="edit-grid">' +
              '<div><label>username</label><input class="f" data-af="user" value="' + esc(a.user) + '" maxlength="32"></div>' +
              '<div><label>email</label><input class="f" type="email" data-af="email" value="' + esc(a.email || '') + '" maxlength="64"></div>' +
              '<div><label>role</label><select class="f" data-af="role">' +
                '<option value="reseller"' + (a.role === 'reseller' ? ' selected' : '') + '>reseller</option>' +
                '<option value="admin"' + (a.role === 'admin' ? ' selected' : '') + '>admin</option>' +
              '</select></div>' +
              '<div><label>key allowance (0 = unlimited)</label>' +
                '<input class="f" type="number" min="0" data-af="quota" value="' + (Number(a.quota) || 0) + '"></div>' +
              '<div><label>discord user id for login codes</label>' +
                '<input class="f mono" data-af="discordId" value="' + esc(a.discordId || '') + '" maxlength="20" inputmode="numeric"></div>' +
              '<div class="full"><label>new password (leave blank to keep)</label>' +
                '<input class="f" type="password" data-af="password" autocomplete="new-password"></div>' +
            '</div>' +
            '<div class="edit-actions">' +
              '<div class="chk"><input type="checkbox" data-af="disabled"' + (a.disabled ? ' checked' : '') + '>' +
                '<span>disable sign in</span></div>' +
              '<div class="spacer"></div>' +
              '<button class="btn sm" type="button" data-rcancel="' + esc(a.id) + '">cancel</button>' +
              '<button class="btn sm p" type="button" data-rsave="' + esc(a.id) + '">save</button>' +
            '</div>' +
            '<div class="row-msg" id="rm-' + esc(a.id) + '"></div>' +
          '</td></tr>';
      }).join('');

      box.innerHTML = '<div class="scroll"><table><thead><tr><th>account</th><th>role</th><th>status</th>' +
        '<th class="hide-s">keys</th><th class="hide-s">last login</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';

      bindResellers();
    }).catch(function () {
      box.innerHTML = '<div class="empty">network error</div>';
    });
  }

  function bindResellers() {
    [].forEach.call(document.querySelectorAll('[data-redit]'), function (b) {
      b.addEventListener('click', function () {
        var row = document.getElementById('re-' + b.getAttribute('data-redit'));
        if (row) row.hidden = !row.hidden;
      });
    });

    [].forEach.call(document.querySelectorAll('[data-rcancel]'), function (b) {
      b.addEventListener('click', function () {
        var row = document.getElementById('re-' + b.getAttribute('data-rcancel'));
        if (row) row.hidden = true;
      });
    });

    [].forEach.call(document.querySelectorAll('[data-rdel]'), function (b) {
      b.addEventListener('click', function () {
        if (!confirm('delete this account? it can no longer sign in')) return;
        api('resellers', { method: 'DELETE', body: { id: b.getAttribute('data-rdel') } }).then(function (r) {
          msg($('rListMsg'), r.ok ? 'account deleted' : (r.data.error || 'could not delete'), r.ok ? 'ok' : 'err');
          loadResellers();
        });
      });
    });

    [].forEach.call(document.querySelectorAll('[data-rsave]'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-rsave');
        var row = document.getElementById('re-' + id);
        if (!row) return;
        var body = { id: id };
        [].forEach.call(row.querySelectorAll('[data-af]'), function (i) {
          var f = i.getAttribute('data-af');
          if (f === 'disabled') body.disabled = i.checked;
          else if (f === 'password') { if (i.value) body.password = i.value; }
          else body[f] = i.value;
        });
        var rm = document.getElementById('rm-' + id);
        b.disabled = true;
        api('resellers', { method: 'PATCH', body: body }).then(function (r) {
          b.disabled = false;
          if (rm) {
            rm.className = 'row-msg ' + (r.ok ? 'good' : 'bad');
            rm.textContent = r.ok ? 'saved' : (r.data.error || 'save failed');
          }
          if (r.ok) {
            msg($('rListMsg'), 'account updated', 'ok');
            setTimeout(loadResellers, 600);
          }
        }).catch(function () {
          b.disabled = false;
          if (rm) { rm.className = 'row-msg bad'; rm.textContent = 'network error'; }
        });
      });
    });
  }

  if ($('rAdd')) {
    $('rAdd').addEventListener('click', function () {
      var b = this;
      var body = {
        user: $('ru').value.trim(),
        email: $('re') ? $('re').value.trim() : '',
        password: $('rp').value,
        role: $('rr').value,
        quota: $('rq').value,
        discordId: $('rd') ? $('rd').value.trim() : ''
      };
      if (!body.user || !body.password) return msg($('rMsg'), 'username and password are required');
      b.disabled = true;
      api('resellers', { method: 'POST', body: body }).then(function (r) {
        b.disabled = false;
        if (!r.ok) return msg($('rMsg'), r.data.error || 'could not create the account');
        msg($('rMsg'), 'created ' + r.data.user, 'ok');
        $('ru').value = '';
        if ($('re')) $('re').value = '';
        $('rp').value = '';
        if ($('rd')) $('rd').value = '';
        $('rq').value = '50';
        $('rr').value = 'reseller';
        loadResellers();
      }).catch(function () {
        b.disabled = false;
        msg($('rMsg'), 'network error');
      });
    });
  }

  if ($('rRefresh')) $('rRefresh').addEventListener('click', loadResellers);

                                                                              
  var gf = $('gf');
  var gPrev = $('gPrev');
  var gi = $('gi');
  var uploadData = '';

  if ($('gUp') && gf) $('gUp').addEventListener('click', function () { gf.click(); });

  if (gi) {
    gi.addEventListener('input', function () {
      uploadData = '';
      if (gPrev) gPrev.src = gi.value.trim();
    });
  }

  if (gf) {
    gf.addEventListener('change', function () {
      var f = gf.files && gf.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var max = 400;
          var s = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * s);
          c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          uploadData = c.toDataURL('image/jpeg', 0.78);
          if (gPrev) gPrev.src = uploadData;
          gi.value = '';
          msg($('gMsg'), 'image ready (' + Math.round(uploadData.length / 1024) + ' kb)', 'ok');
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(f);
    });
  }

  if ($('gAdd')) {
    $('gAdd').addEventListener('click', function () {
      var b = this;
      var body = {
        title: $('gt').value.trim(),
        cat: $('gc').value.trim(),
        url: $('gu').value.trim(),
        img: uploadData || gi.value.trim(),
        kb: $('gk').checked
      };
      if (!body.title || !body.url) return msg($('gMsg'), 'title and game link are required');
      b.disabled = true;
      api('games', { method: 'POST', body: body }).then(function (r) {
        b.disabled = false;
        if (!r.ok) return msg($('gMsg'), r.data.error || 'failed');
        msg($('gMsg'), 'added ' + body.title, 'ok');
        $('gt').value = '';
        $('gu').value = '';
        gi.value = '';
        uploadData = '';
        gPrev.removeAttribute('src');
        $('gk').checked = false;
        loadGames();
      }).catch(function () {
        b.disabled = false;
        msg($('gMsg'), 'network error');
      });
    });
  }

  if ($('gSeed')) {
    $('gSeed').addEventListener('click', function () {
      var b = this;
      if (!window.SEED_GAMES || !window.SEED_GAMES.length) return msg($('gMsg'), 'seed list missing');
      if (!confirm('import ' + window.SEED_GAMES.length + ' built-in games?')) return;
      b.disabled = true;
      b.textContent = 'importing…';
      api('games', { method: 'POST', body: { bulk: window.SEED_GAMES } }).then(function (r) {
        b.disabled = false;
        b.textContent = 'import built-in 75';
        msg($('gMsg'), r.ok
          ? ('imported ' + r.data.added + (r.data.skipped ? ', skipped ' + r.data.skipped + ' already there' : ''))
          : (r.data.error || 'failed'), r.ok ? 'ok' : 'err');
        loadGames();
      }).catch(function () {
        b.disabled = false;
        b.textContent = 'import built-in 75';
      });
    });
  }

  if ($('gRefresh')) $('gRefresh').addEventListener('click', loadGames);

  function loadGames() {
    if (!$('gList')) return;
    api('games').then(function (r) {
      if (!r.ok) {
        $('gList').innerHTML = '<div class="empty">' + esc(r.data.error || 'failed') + '</div>';
        return;
      }
      var list = r.data.games || [];
      if ($('gCount')) $('gCount').textContent = list.length;

      var dupes = {};
      list.forEach(function (g) { var k = String(g.title).trim().toLowerCase(); dupes[k] = (dupes[k] || 0) + 1; });
      var dupCount = Object.keys(dupes).filter(function (k) { return dupes[k] > 1; }).length;
      var warn = $('dupWarn');
      if (warn) {
        warn.textContent = dupCount
          ? (dupCount + ' game name' + (dupCount > 1 ? 's appear' : ' appears') + ' more than once, editing one will not change the other')
          : '';
        warn.className = 'msg err' + (dupCount ? ' on' : '');
      }

      var cats = {};
      list.forEach(function (g) { if (g.cat) cats[g.cat] = 1; });
      if ($('cats')) {
        $('cats').innerHTML = Object.keys(cats).sort().map(function (c) {
          return '<option value="' + esc(c) + '">';
        }).join('');
      }

      if (!list.length) {
        $('gList').innerHTML = '<div class="empty">no games yet</div>';
        return;
      }

      var rows = list.map(function (g) {
        return '<tr><td><img class="tt" src="' + esc(g.img || '') + '" alt=""></td>' +
          '<td><strong>' + esc(g.title) + '</strong>' + (g.kb ? ' <span class="tag">keys</span>' : '') +
          (dupes[String(g.title).trim().toLowerCase()] > 1 ? ' <span class="tag dup">duplicate</span>' : '') + '</td>' +
          '<td class="hide-s"><span class="tag">' + esc(g.cat || '') + '</span></td>' +
          '<td class="hide-s mono ellipsis">' + esc(g.url) + '</td>' +
          '<td class="right nowrap">' +
            '<button class="btn sm" type="button" data-edit="' + esc(g.id) + '">edit</button> ' +
            '<button class="btn sm d" type="button" data-del="' + esc(g.id) + '">delete</button>' +
          '</td></tr>' +
          '<tr class="edit-row" id="er-' + esc(g.id) + '" hidden><td colspan="5">' +
            '<div class="edit-grid">' +
              '<div><label>title</label><input class="f" data-f="title" value="' + esc(g.title) + '"></div>' +
              '<div><label>tag</label><input class="f" data-f="cat" value="' + esc(g.cat || '') + '"></div>' +
              '<div class="full"><label>game link</label><input class="f" data-f="url" value="' + esc(g.url) + '"></div>' +
              '<div class="full"><label>thumbnail link</label><input class="f" data-f="img" value="' +
                esc(/^data:/.test(g.img || '') ? '' : (g.img || '')) + '" placeholder="' +
                (/^data:/.test(g.img || '') ? 'uploaded image kept unless you type a link' : '') + '"></div>' +
            '</div>' +
            '<div class="edit-actions">' +
              '<div class="chk"><input type="checkbox" data-f="kb"' + (g.kb ? ' checked' : '') + '>' +
                '<span>needs keyboard</span></div>' +
              '<div class="spacer"></div>' +
              '<button class="btn sm" type="button" data-cancel="' + esc(g.id) + '">cancel</button>' +
              '<button class="btn sm p" type="button" data-save="' + esc(g.id) + '">save changes</button>' +
            '</div><div class="row-msg" id="rm-' + esc(g.id) + '"></div>' +
          '</td></tr>';
      }).join('');

      $('gList').innerHTML = '<div class="scroll"><table><thead><tr><th></th><th>title</th>' +
        '<th class="hide-s">tag</th><th class="hide-s">link</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';

      bindGames();
    });
  }

  function bindGames() {
    [].forEach.call(document.querySelectorAll('.tt'), function (img) {
      img.addEventListener('error', function () { img.style.visibility = 'hidden'; });
    });

    [].forEach.call(document.querySelectorAll('[data-del]'), function (b) {
      b.addEventListener('click', function () {
        if (!confirm('delete this game?')) return;
        api('games', { method: 'DELETE', body: { id: b.getAttribute('data-del') } }).then(loadGames);
      });
    });

    [].forEach.call(document.querySelectorAll('[data-edit]'), function (b) {
      b.addEventListener('click', function () {
        var r = document.getElementById('er-' + b.getAttribute('data-edit'));
        if (r) r.hidden = !r.hidden;
      });
    });

    [].forEach.call(document.querySelectorAll('[data-cancel]'), function (b) {
      b.addEventListener('click', function () {
        var r = document.getElementById('er-' + b.getAttribute('data-cancel'));
        if (r) r.hidden = true;
      });
    });

    [].forEach.call(document.querySelectorAll('[data-save]'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-save');
        var row = document.getElementById('er-' + id);
        if (!row) return;
        var body = { id: id };
        [].forEach.call(row.querySelectorAll('[data-f]'), function (i) {
          if (i.type === 'checkbox') body[i.getAttribute('data-f')] = i.checked;
          else if (i.getAttribute('data-f') === 'img') { if (i.value.trim()) body.img = i.value.trim(); }
          else body[i.getAttribute('data-f')] = i.value;
        });
        var rm = document.getElementById('rm-' + id);
        b.disabled = true;
        b.textContent = 'saving…';
        if (rm) { rm.className = 'row-msg'; rm.textContent = ''; }
        api('games', { method: 'PATCH', body: body }).then(function (r) {
          b.disabled = false;
          b.textContent = 'save changes';
          if (!r.ok) {
            if (rm) { rm.className = 'row-msg bad'; rm.textContent = r.data.error || 'save failed'; }
            return;
          }
          if (rm) { rm.className = 'row-msg good'; rm.textContent = 'saved'; }
          setTimeout(loadGames, 700);
        }).catch(function () {
          b.disabled = false;
          b.textContent = 'save changes';
          if (rm) { rm.className = 'row-msg bad'; rm.textContent = 'network error'; }
        });
      });
    });
  }

                                                                              
  function loadAccount() {
    api('account').then(function (r) {
      if (!r.ok) return;
      state.user = r.data.user || state.user;
      if ($('whoami')) $('whoami').textContent = state.user + ' · ' + r.data.role;
      if ($('au')) $('au').value = state.user;
      if ($('ae')) $('ae').value = r.data.email || '';
      if ($('aWho')) {
        $('aWho').textContent = state.user + ' · ' + r.data.role + ' · ' +
          (r.data.quota ? (r.data.used + ' of ' + r.data.quota + ' keys') : (r.data.used + ' keys, unlimited'));
      }
    }).catch(function () {});
  }

  if ($('auSave')) {
    $('auSave').addEventListener('click', function () {
      var b = this;
      var cur = $('auCur').value;
      var name = $('au').value.trim();
      var email = $('ae') ? $('ae').value.trim() : '';
      if (!cur) return msg($('aMsg'), 'enter your current password to confirm');
      b.disabled = true;
      api('account', { method: 'POST', body: { current: cur, user: name, email: email } }).then(function (r) {
        b.disabled = false;
        if (!r.ok) return msg($('aMsg'), r.data.error || 'could not save your details');
        $('auCur').value = '';
        msg($('aMsg'), 'login details updated', 'ok');
        loadAccount();
      }).catch(function () {
        b.disabled = false;
        msg($('aMsg'), 'network error');
      });
    });
  }

  if ($('apSave')) {
    $('apSave').addEventListener('click', function () {
      var b = this;
      var cur = $('apCur').value;
      var p1 = $('ap').value;
      var p2 = $('ap2').value;
      if (!cur) return msg($('apMsg'), 'enter your current password');
      if (p1.length < 12) return msg($('apMsg'), 'new password must be at least 12 characters');
      if (p1 !== p2) return msg($('apMsg'), 'the new passwords do not match');
      b.disabled = true;
      api('account', { method: 'POST', body: { current: cur, password: p1 } }).then(function (r) {
        b.disabled = false;
        if (!r.ok) return msg($('apMsg'), r.data.error || 'could not change the password');
        $('apCur').value = '';
        $('ap').value = '';
        $('ap2').value = '';
        msg($('apMsg'), 'password changed - every other session is signed out', 'ok');
      }).catch(function () {
        b.disabled = false;
        msg($('apMsg'), 'network error');
      });
    });
  }

                                                                              
  api('session').then(function (r) {
    if (r.ok && r.data.role && r.data.role !== 'user') {
      boot({ user: r.data.user || '', role: r.data.role });
    }
  }).catch(function () {});
})();
