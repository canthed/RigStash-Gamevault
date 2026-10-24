const $ = s => document.querySelector(s);
const grid = $('#grid');
let games = [], tab = 'all', loaded = false;

const hue = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const label = { steam: 'Steam', epic: 'Epic Games', gog: 'GOG', manual: 'Added by me' };
// Simplified platform marks drawn as SVG. Swap in the official brand assets before a public release.
const icons = {
  steam: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#1b2838"/><circle cx="15" cy="9.5" r="3.2" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="8.5" cy="15.5" r="2.4" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M10.5 14 13 11.5" stroke="#fff" stroke-width="1.6"/></svg>',
  epic: '<svg viewBox="0 0 24 24"><path d="M4 2h16v15l-8 5-8-5z" fill="#2a2a2e" stroke="#fff" stroke-width="1"/><text x="12" y="13.5" text-anchor="middle" font-family="Arial,sans-serif" font-size="6.5" font-weight="700" fill="#fff">EPIC</text></svg>',
  gog: '<svg viewBox="0 0 24 24"><rect x="1" y="3" width="22" height="18" rx="5" fill="#86328a"/><text x="12" y="15" text-anchor="middle" font-family="Arial,sans-serif" font-size="8" font-weight="700" fill="#fff">GOG</text></svg>',
  manual: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#7c5cff"/><path d="M12 6.5v11M6.5 12h11" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
  all: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>'
};
const bmSvg = '<svg viewBox="0 0 20 22"><path d="M3 2h14v18l-7-5-7 5z"/></svg>';

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function render() {
  const q = $('#q').value.toLowerCase().trim();
  const list = games.filter(g => g.name.toLowerCase().includes(q) &&
    (tab === 'all' || (tab === 'fav' ? g.fav : g.source === tab)));
  grid.innerHTML = '';
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = !loaded ? 'Looking for installed games…'
      : games.length ? 'No games match this search or tab.'
      : 'No installed games found. Use the + button to add one, or rescan after installing Steam or Epic games.';
    grid.appendChild(p); return;
  }
  for (const g of list) {
    const c = document.createElement('div');
    c.className = 'card'; c.tabIndex = 0; c.setAttribute('role', 'button');
    c.setAttribute('aria-label', 'Play ' + g.name);
    const h = hue(g.name);
    const art = document.createElement('div');
    art.className = 'art';
    art.style.background = `linear-gradient(150deg,hsl(${h} 55% 38%),hsl(${(h + 50) % 360} 50% 18%))`;
    if (g.img) {
      const img = new Image(); img.alt = ''; img.src = g.img; img.loading = 'lazy';
      img.addEventListener('error', () => img.remove());
      art.appendChild(img);
    }
    const plat = document.createElement('span');
    plat.className = 'plat'; plat.innerHTML = icons[g.source]; plat.title = label[g.source];
    const b = document.createElement('b'); b.textContent = g.name;
    const bm = document.createElement('button');
    bm.className = 'bm' + (g.fav ? ' on' : ''); bm.innerHTML = bmSvg;
    bm.setAttribute('aria-label', 'Favorite ' + g.name);
    bm.addEventListener('click', async e => { e.stopPropagation(); await vault.fav(g.id); g.fav = !g.fav; render(); });
    c.append(art, plat, b, bm);
    const play = async () => {
      const r = await vault.launch(g.id);
      toast(r.ok ? 'Launching ' + g.name + '…' : r.error);
    };
    c.addEventListener('click', play);
    c.addEventListener('keydown', e => { if (e.key === 'Enter') play(); });
    c.addEventListener('contextmenu', async e => {
      e.preventDefault();
      if (confirm(`Remove "${g.name}" from RigStash? This doesn't uninstall the game.`)) { await vault.remove(g.id); load(); }
    });
    grid.appendChild(c);
  }
}

async function load() {
  const btn = $('#refresh'); btn.classList.add('spin');
  games = await vault.list(); loaded = true;
  btn.classList.remove('spin'); render();
  // Fetch cover art online for games that don't have a Steam ID, then refresh the grid.
  const y = grid.scrollTop;
  const updated = await vault.art();
  if (JSON.stringify(updated.map(g => g.img)) !== JSON.stringify(games.map(g => g.img))) { games = updated; render(); grid.scrollTop = y; }
}

$('#q').addEventListener('input', render);
$('#refresh').addEventListener('click', load);
$('#wmin').addEventListener('click', () => vault.min());
$('#wmax').addEventListener('click', () => vault.max());
$('#wclose').addEventListener('click', () => vault.close());
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
  if (b.classList.contains('head')) return;
  tab = b.dataset.tab;
  document.querySelectorAll('.nav .sub,.nav .fav').forEach(x => x.classList.toggle('on', x.dataset.tab === tab));
  render();
}));

const dlg = $('#dlg');
$('#add').addEventListener('click', () => { $('#form').reset(); $('#f-err').textContent = ''; dlg.showModal(); $('#f-name').focus(); });
$('#f-cancel').addEventListener('click', () => dlg.close());
$('#f-browse').addEventListener('click', async () => {
  const p = await vault.pickExe(); if (!p) return;
  $('#f-exe').value = p;
  if (!$('#f-name').value) $('#f-name').value = p.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
});
$('#form').addEventListener('submit', async e => {
  e.preventDefault();
  const r = await vault.add({ name: $('#f-name').value, exe: $('#f-exe').value, steamId: $('#f-steam').value });
  if (!r.ok) { $('#f-err').textContent = r.error; return; }
  dlg.close(); await load(); toast('Game added');
});

// Platform logos in the sidebar tabs
document.querySelectorAll('.nav .sub').forEach(b => {
  const s = document.createElement('span'); s.className = 'ico'; s.innerHTML = icons[b.dataset.tab] || ''; b.prepend(s);
});
// Show this computer's name next to the avatar
vault.pcName().then(n => { if (n) $('#pcname').textContent = n; });

load();
