/*
  LE DEMENAGEMENT DU 2026-10-19, GARDE DEVANT LE JEU WEB2 (2026-10-30).

  rabbit.rip/play/ servait le jeu web3 jusqu'au 2026-10-19, puis une page de
  passage vers son nouveau site ; c'est maintenant le jeu WEB2. Mais le
  terrier d'un invite web3 n'existe QUE dans le stockage de cette origine, et
  des liens partages menent encore ici. Avant que le moteur parte
  (window.rrBeforeStart, godot/web/shell.html), ce script regarde :

    - un terrier web2 (session-web2.cfg) : c'est un joueur d'ici, on joue ;
    - sinon un terrier web3 (session.cfg) : on le reprend comme la page de
      passage le faisait — base IndexedDB de Godot (/userfs, FILE_DATA),
      session.cfg et consent.cfg passes dans le FRAGMENT (#rr_move=<base64url
      d'un JSON {nom: texte}>, jamais envoye a un serveur), lus par
      godot/scripts/session.gd (_import_moved_session) ;
    - rien : un nouveau joueur, on joue.

  UNE FOIS par navigateur (localStorage rr_moved_once) : quelqu'un qui avait
  un terrier web3 ici et revient ensuite sur rabbit.rip/play/ veut jouer au
  web2, pas etre renvoye a chaque visite.

  Rien n'est efface. Seulement sur rabbit.rip : le stage sert ce meme site
  sous un autre nom et n'a personne a conduire ailleurs.
*/
(() => {
  const HOSTS = ['rabbit.rip', 'www.rabbit.rip'];
  const DIR = '/userfs/godot/app_userdata/Rabbit Royale/';
  const OLD = ['session.cfg', 'consent.cfg'];
  const MINE = 'session-web2.cfg';
  const TARGET = 'https://sol.rabbit.rip/play/';
  const MOVED = 'rr_moved_once';

  window.rrBeforeStart = () => new Promise((play) => {
    if (!HOSTS.includes(location.hostname)) return play();
    try {
      if (localStorage.getItem(MOVED)) return play();
    } catch (e) {
      return play();
    }
    let done = false;
    const once = (f) => { if (!done) { done = true; f(); } };
    // Une base qui ne repond pas (navigation privee, stockage bloque) ne doit
    // pas retenir le jeu.
    setTimeout(() => once(play), 1500);
    const leave = (files) => once(() => {
      try { localStorage.setItem(MOVED, '1'); } catch (e) { /* rien */ }
      const bytes = new TextEncoder().encode(JSON.stringify(files));
      let bin = '';
      bytes.forEach((b) => { bin += String.fromCharCode(b); });
      location.replace(TARGET + location.search + '#rr_move='
        + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
    });
    try {
      const open = indexedDB.open('/userfs');
      // Ouvrir une base absente la cree, vide et sans magasin : on annule, le
      // moteur la creera lui-meme.
      open.onupgradeneeded = () => open.transaction.abort();
      open.onerror = () => once(play);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('FILE_DATA')) { db.close(); return once(play); }
        const store = db.transaction('FILE_DATA').objectStore('FILE_DATA');
        const files = {};
        const names = [MINE, ...OLD];
        let left = names.length;
        const settle = () => {
          if (--left > 0) return;
          db.close();
          if (files[MINE] !== undefined || files['session.cfg'] === undefined) return once(play);
          delete files[MINE];
          leave(files);
        };
        for (const name of names) {
          const req = store.get(DIR + name);
          req.onsuccess = () => {
            const v = req.result;
            if (v && v.contents) {
              files[name] = new TextDecoder().decode(new Uint8Array(v.contents.buffer, v.contents.byteOffset, v.contents.byteLength));
            }
            settle();
          };
          req.onerror = settle;
        }
      };
    } catch (e) {
      once(play);
    }
  });
})();
