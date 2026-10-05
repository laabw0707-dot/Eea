/* تخزين دائم + نسخة احتياطية تلقائية من localStorage إلى IndexedDB واستعادتها إن مُسحت */
(function () {
  'use strict';
  var DB = 'rafiq-ls', ST = 'kv', KEY = 'snapshot', MAIN = 'mc';

  function open() {
    return new Promise(function (ok, no) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(ST); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { no(r.error); };
    });
  }
  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (ok, no) {
        var t = db.transaction(ST, mode), q = fn(t.objectStore(ST));
        t.oncomplete = function () { db.close(); ok(q && q.result); };
        t.onerror = t.onabort = function () { db.close(); no(t.error); };
      });
    });
  }

  function snapshot() {
    var o = {};
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); o[k] = localStorage.getItem(k); }
    return o;
  }
  var timer = 0;
  function backupNow() {
    clearTimeout(timer);
    try {
      if (localStorage.getItem(MAIN) === null) return Promise.resolve(false); // لا تستبدل نسخة سليمة بفراغ
      return tx('readwrite', function (s) { return s.put({ ts: Date.now(), data: snapshot() }, KEY); }).then(function () { return true; });
    } catch (e) { return Promise.resolve(false); }
  }
  function sched() { clearTimeout(timer); timer = setTimeout(backupNow, 800); }

  // اعتراض الكتابة في localStorage لعمل نسخة تلقائيًا
  try {
    var P = Storage.prototype, si = P.setItem, ri = P.removeItem, cl = P.clear;
    P.setItem = function () { si.apply(this, arguments); if (this === window.localStorage) sched(); };
    P.removeItem = function () { ri.apply(this, arguments); if (this === window.localStorage) sched(); };
    P.clear = function () { cl.apply(this, arguments); };
  } catch (e) {}
  addEventListener('pagehide', backupNow);
  document.addEventListener('visibilitychange', function () { if (document.hidden) backupNow(); });

  // استعادة إن كان localStorage فارغًا ويوجد نسخة
  function restore() {
    if (localStorage.getItem(MAIN) !== null) return Promise.resolve(false);
    return tx('readonly', function (s) { return s.get(KEY); }).then(function (snap) {
      if (!snap || !snap.data || snap.data[MAIN] == null) return false;
      if (localStorage.getItem(MAIN) !== null) return false;
      Object.keys(snap.data).forEach(function (k) { if (localStorage.getItem(k) === null) localStorage.setItem(k, snap.data[k]); });
      if (!sessionStorage.getItem('rafiq-restored')) {
        sessionStorage.setItem('rafiq-restored', '1');
        location.reload();
      }
      return true;
    }).catch(function () { return false; });
  }

  // طلب تخزين دائم
  function persist() {
    if (navigator.storage && navigator.storage.persist) {
      return navigator.storage.persist().catch(function () { return false; });
    }
    return Promise.resolve(false);
  }

  window.RafiqStorage = { backupNow: backupNow, restore: restore, persist: persist };
  persist();
  restore().then(function (r) { if (!r) backupNow(); });
})();
