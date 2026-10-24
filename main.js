const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const SKIP = /Steamworks Common|Redistributable|^Proton|Steam Linux Runtime|Steam Controller Configs/i;
const storeFile = () => path.join(app.getPath('userData'), 'library.json');
const emptyStore = () => ({ manual: [], favs: [], hidden: [], art: {} });

function loadStore() {
  try { return { ...emptyStore(), ...JSON.parse(fs.readFileSync(storeFile(), 'utf8')) }; }
  catch { return emptyStore(); }
}
function saveStore(s) {
  fs.mkdirSync(path.dirname(storeFile()), { recursive: true });
  fs.writeFileSync(storeFile(), JSON.stringify(s, null, 2));
}

/* ---------- Steam ---------- */
function regSteam() {
  return new Promise(res => {
    if (process.platform !== 'win32') return res(null);
    execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], (e, out) => {
      const m = !e && /SteamPath\s+REG_SZ\s+(.+)/.exec(out);
      res(m ? m[1].trim() : null);
    });
  });
}
async function steamRoots() {
  const h = os.homedir();
  const c = [await regSteam()];
  if (process.platform === 'win32') c.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam');
  else if (process.platform === 'darwin') c.push(path.join(h, 'Library/Application Support/Steam'));
  else c.push(path.join(h, '.steam/steam'), path.join(h, '.local/share/Steam'));
  return c.filter(p => p && fs.existsSync(p));
}
async function scanSteam() {
  const libs = new Set(), out = [], seen = new Set();
  for (const root of await steamRoots()) {
    libs.add(root);
    try {
      const v = fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
      for (const m of v.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, '\\'));
    } catch {}
  }
  for (const lib of libs) {
    const dir = path.join(lib, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => /^appmanifest_\d+\.acf$/.test(f)); } catch { continue; }
    for (const f of files) {
      try {
        const t = fs.readFileSync(path.join(dir, f), 'utf8');
        const id = (/"appid"\s+"(\d+)"/.exec(t) || [])[1];
        const name = (/"name"\s+"([^"]+)"/.exec(t) || [])[1];
        if (!id || !name || seen.has(id) || SKIP.test(name)) continue;
        seen.add(id);
        out.push({ id: 'steam:' + id, name, source: 'steam', steamId: id });
      } catch {}
    }
  }
  return out;
}

/* ---------- Epic Games ---------- */
// Epic's launcher caches store art (base64 JSON) for the games in your library.
function epicImages() {
  const map = {};
  try {
    const b64 = fs.readFileSync('C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Catalog\\catcache.bin', 'utf8');
    const items = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    for (const it of items) {
      const imgs = it.keyImages || [];
      const pick = ['DieselGameBox', 'OfferImageWide', 'DieselStoreFrontWide', 'Thumbnail', 'DieselGameBoxTall']
        .map(t => imgs.find(i => i.type === t)).find(Boolean);
      if (pick && it.id) map[it.id] = pick.url;
    }
  } catch {}
  return map;
}

function scanEpic() {
  if (process.platform !== 'win32') return [];
  const dir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
  const out = [], imgs = epicImages();
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.item')); } catch { return out; }
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (!j.DisplayName || !j.InstallLocation || !j.LaunchExecutable) continue;
      if (j.AppCategories && !j.AppCategories.includes('games')) continue;
      const exe = path.join(j.InstallLocation, j.LaunchExecutable);
      if (!fs.existsSync(exe)) continue;
      out.push({ id: 'epic:' + (j.AppName || f), name: j.DisplayName, source: 'epic', exe, artUrl: imgs[j.CatalogItemId] });
    } catch {}
  }
  return out;
}

/* ---------- GOG ---------- */
function scanGog() {
  return new Promise(res => {
    if (process.platform !== 'win32') return res([]);
    execFile('reg', ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games', '/s'], { maxBuffer: 1e7 }, (e, out) => {
      if (e) return res([]);
      const games = []; let cur = null;
      for (const line of out.split(/\r?\n/)) {
        if (/^HKEY_/.test(line)) {
          cur = /GOG\.com\\Games\\[^\\]+$/.test(line.trim()) ? {} : null;
          if (cur) games.push(cur);
          continue;
        }
        const m = cur && /^\s+(\w+)\s+REG_\w+\s+(.*)$/.exec(line);
        if (m) cur[m[1]] = m[2].trim();
      }
      res(games.filter(g => g.gameName && g.exe && fs.existsSync(g.exe))
        .map(g => ({ id: 'gog:' + (g.gameID || g.gameName), name: g.gameName, source: 'gog', exe: g.exe })));
    });
  });
}

/* ---------- Cover art (online) ---------- */
const norm = s => s.toLowerCase().replace(/[\u2122\u00ae\u00a9]/g, '').replace(/[^a-z0-9]/g, '');
const header = id => `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`;
// Returns a Steam app id string, '0' for "no match", or null on network failure (not cached).
async function findArtId(name) {
  try {
    const r = await fetch('https://store.steampowered.com/api/storesearch/?l=english&cc=us&term=' + encodeURIComponent(name),
      { signal: AbortSignal.timeout(6000) });
    const items = (await r.json()).items || [];
    const n = norm(name);
    const hit = items.find(i => norm(i.name) === n) ||
      items.find(i => { const x = norm(i.name); return x.length >= 4 && (x.startsWith(n) || n.startsWith(x)); });
    return hit ? String(hit.id) : '0';
  } catch { return null; }
}

/* ---------- Library ---------- */
let raw = [], cache = [];
function decorate() {
  const s = loadStore();
  cache = raw.map(g => {
    const art = g.steamId || (s.art[norm(g.name)] && s.art[norm(g.name)] !== '0' ? s.art[norm(g.name)] : null);
    return { ...g, fav: s.favs.includes(g.id), img: g.artUrl || (art ? header(art) : null) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return cache;
}
async function buildLibrary() {
  const s = loadStore();
  const scanned = [...await scanSteam(), ...scanEpic(), ...await scanGog()].filter(g => !s.hidden.includes(g.id));
  raw = [...scanned, ...s.manual.map(m => ({ ...m, source: 'manual' }))];
  return decorate();
}

ipcMain.handle('games:list', buildLibrary);

// Looks up cover art online for games that have no Steam ID, then returns the updated list.
ipcMain.handle('games:art', async () => {
  const s = loadStore();
  const todo = raw.filter(g => !g.steamId && !g.artUrl && s.art[norm(g.name)] === undefined);
  let changed = false;
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map(async g => {
      const id = await findArtId(g.name);
      if (id !== null) { s.art[norm(g.name)] = id; changed = true; }
    }));
  }
  if (changed) saveStore(s);
  return decorate();
});

ipcMain.handle('games:launch', (_, id) => {
  const g = cache.find(x => x.id === id);
  if (!g) return { ok: false, error: 'Game not found. Try refreshing.' };
  try {
    if (g.exe) {
      if (!fs.existsSync(g.exe)) return { ok: false, error: 'The game file is missing: ' + g.exe };
      spawn(g.exe, [], { detached: true, stdio: 'ignore', cwd: path.dirname(g.exe) }).unref();
    } else if (g.steamId) {
      shell.openExternal(`steam://rungameid/${g.steamId}`);
    } else return { ok: false, error: 'No file or Steam ID set for this game.' };
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('games:add', (_, g) => {
  const s = loadStore();
  const name = String(g.name || '').trim();
  const steamId = String(g.steamId || '').replace(/\D/g, '');
  const exe = String(g.exe || '').trim();
  if (!name || (!exe && !steamId)) return { ok: false, error: 'Add a name and either a game file or a Steam ID.' };
  s.manual.push({ id: 'manual:' + crypto.randomUUID(), name, steamId: steamId || undefined, exe: exe || undefined });
  saveStore(s);
  return { ok: true };
});

ipcMain.handle('games:remove', (_, id) => {
  const s = loadStore();
  if (id.startsWith('manual:')) s.manual = s.manual.filter(m => m.id !== id);
  else if (!s.hidden.includes(id)) s.hidden.push(id);
  s.favs = s.favs.filter(f => f !== id);
  saveStore(s);
  return { ok: true };
});

ipcMain.handle('games:fav', (_, id) => {
  const s = loadStore();
  s.favs = s.favs.includes(id) ? s.favs.filter(f => f !== id) : [...s.favs, id];
  saveStore(s);
  return { ok: true };
});

ipcMain.handle('dialog:exe', async () => {
  const filters = process.platform === 'win32' ? [{ name: 'Programs', extensions: ['exe', 'lnk', 'bat'] }] : [];
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('sys:name', () => os.hostname().replace(/\.local$/i, ''));

ipcMain.on('win:min', e => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('win:max', e => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.isMaximized() ? w.unmaximize() : w.maximize();
});
ipcMain.on('win:close', e => BrowserWindow.fromWebContents(e.sender)?.close());

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 740, minWidth: 760, minHeight: 540,
    frame: false, backgroundColor: '#18142b', show: false, title: 'RigStash',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile('index.html');
  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
