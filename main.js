const { app, BrowserWindow, screen, Menu, protocol, net, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  isValidSessionId,
  createSessionTracker,
  buildSessionStates,
  EVENT_TO_ANIM,
} = require('./lib/session-tracker');

let win;
let petVisible = true;

const CHARACTERS = {
  'sleeping-orc': {
    label: 'Sleeping Orc',
    atlas: 'orc-sprite-atlas.png',
    cols: 6, rows: 6,
    needsChromaKey: false,
    anims: {
      sleeping:  { row: 0, frames: 6, fps: 3,  loop: true  },
      waking:    { row: 1, frames: 6, fps: 2,  loop: false, loops: 1 },
      typing:    { row: 2, frames: 6, fps: 8,  loop: true  },
      alarmed:   { row: 3, frames: 6, fps: 8,  loop: false },
      celebrate: { row: 4, frames: 6, fps: 8,  loop: false },
      annoyed:   { row: 5, frames: 6, fps: 8,  loop: false },
    },
  },
  'laptop-guy': {
    label: 'Laptop Guy',
    atlas: 'laptop-guy-atlas.png',
    cols: 6, rows: 4,
    needsChromaKey: false,
    anims: {
      sleeping:  { row: 0, frames: 6, fps: 3,  loop: true  },
      waking:    { row: 1, frames: 6, fps: 4,  loop: false, loops: 1 },
      typing:    { row: 2, frames: 6, fps: 6,  loop: true  },
      alarmed:   { row: 3, frames: 6, fps: 6,  loop: false },
      celebrate: { row: 1, frames: 6, fps: 6,  loop: false },
      annoyed:   { row: 3, frames: 6, fps: 8,  loop: false },
    },
  },
  'standing-orc': {
    label: 'Standing Orc',
    atlas: 'orc-atlas.png',
    cols: 10, rows: 6,
    needsChromaKey: true,
    anims: {
      sleeping:  { row: 0, frames: 10, fps: 3,  loop: true  },
      waking:    { row: 4, frames: 10, fps: 6,  loop: false, loops: 1 },
      typing:    { row: 3, frames: 10, fps: 8,  loop: true  },
      alarmed:   { row: 5, frames: 9,  fps: 8,  loop: false },
      celebrate: { row: 2, frames: 10, fps: 8,  loop: false },
      annoyed:   { row: 1, frames: 10, fps: 6,  loop: false },
    },
  },
  'gemini-cat': {
    label: 'Mimi',
    atlas: 'Gemini_Generated_Image_4tsnjt4tsnjt4tsn.png',
    cols: 6, rows: 6,
    needsChromaKey: false,
    anims: {
      sleeping:  { row: 0, frames: 6, fps: 3,  loop: true  },
      waking:    { row: 1, frames: 6, fps: 4,  loop: false, loops: 1 },
      typing:    { row: 2, frames: 6, fps: 8,  loop: true  },
      alarmed:   { row: 3, frames: 6, fps: 8,  loop: false },
      celebrate: { row: 4, frames: 6, fps: 8,  loop: false },
      annoyed:   { row: 5, frames: 6, fps: 8,  loop: false },
    },
  },
};

const CONFIG_FILE = path.join(os.homedir(), '.config', 'peon-pet', 'config.json');

function loadPetConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch { return {}; }
}

function savePetConfig(cfg) {
  const dir = path.dirname(CONFIG_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

function getActiveCharId() {
  return loadPetConfig().character || 'laptop-guy';
}

function registerCharacterProtocol() {
  const assetsDir = path.join(__dirname, 'renderer', 'assets');
  const fallback = { 'borders.png': 'orc-borders.png', 'bg.png': 'bg-pixel.png', 'dock-icon.png': 'orc-dock-icon.png' };

  protocol.handle('peon-asset', async (request) => {
    const filename = new URL(request.url).hostname;
    let filePath;
    if (filename === 'sprite-atlas.png') {
      const charId = getActiveCharId();
      const charDef = CHARACTERS[charId] || CHARACTERS['laptop-guy'];
      filePath = path.join(assetsDir, charDef.atlas);
    } else {
      filePath = path.join(assetsDir, fallback[filename] || filename);
    }
    const res = await net.fetch('file://' + filePath);
    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': 'no-store',
      },
    });
  });
}

// Path to peon-ping state file
const STATE_FILE = path.join(os.homedir(), '.claude', 'hooks', 'peon-ping', '.state.json');
const PAUSED_FILE = path.join(os.homedir(), '.config', 'opencode', 'peon-ping', '.paused');

ipcMain.handle('get-sound-state', () => !fs.existsSync(PAUSED_FILE));
ipcMain.handle('toggle-sound', () => {
  const paused = fs.existsSync(PAUSED_FILE);
  if (paused) {
    fs.unlinkSync(PAUSED_FILE);
  } else {
    fs.writeFileSync(PAUSED_FILE, '');
  }
  return !paused;
});

ipcMain.handle('get-character-config', () => {
  const charId = getActiveCharId();
  const charDef = CHARACTERS[charId] || CHARACTERS['laptop-guy'];
  return { charId, ...charDef };
});

ipcMain.handle('get-volume', () => {
  const cfg = loadPetConfig();
  return cfg.volume ?? 0.3;
});

ipcMain.on('show-context-menu', () => {
  if (!win || win.isDestroyed()) return;
  const cfg = loadPetConfig();
  const currentChar = cfg.character || 'laptop-guy';
  const currentVol = cfg.volume ?? 0.3;
  const soundOn = !fs.existsSync(PAUSED_FILE);

  const charItems = Object.entries(CHARACTERS).map(([id, def]) => ({
    label: `${currentChar === id ? '● ' : '   '}${def.label}`,
    click() {
      const c = loadPetConfig();
      c.character = id;
      savePetConfig(c);
      if (win && !win.isDestroyed()) {
        win.webContents.send('switch-character', { charId: id, ...CHARACTERS[id], cacheBust: Date.now() });
      }
    },
  }));

  const volSteps = [0.1, 0.2, 0.3, 0.5, 0.7, 1.0];
  const volItems = volSteps.map(v => ({
    label: `${Math.abs(currentVol - v) < 0.01 ? '● ' : '   '}${Math.round(v * 100)}%`,
    click() {
      const c = loadPetConfig();
      c.volume = v;
      savePetConfig(c);
      try {
        const ppCfg = path.join(os.homedir(), '.config', 'opencode', 'peon-ping', 'config.json');
        const pp = JSON.parse(fs.readFileSync(ppCfg, 'utf8'));
        pp.volume = v;
        fs.writeFileSync(ppCfg, JSON.stringify(pp, null, 2));
      } catch {}
    },
  }));

  const template = [
    { label: soundOn ? '🔊 Sound On' : '🔇 Sound Off', click() {
      const paused = fs.existsSync(PAUSED_FILE);
      if (paused) fs.unlinkSync(PAUSED_FILE);
      else fs.writeFileSync(PAUSED_FILE, '');
    }},
    { type: 'separator' },
    { label: 'Volume', submenu: volItems },
    { type: 'separator' },
    { label: 'Character', submenu: charItems },
    { type: 'separator' },
    { label: petVisible ? 'Hide Pet' : 'Show Pet', click() {
      if (!win || win.isDestroyed()) return;
      if (petVisible) win.hide(); else win.show();
      petVisible = !petVisible;
      if (process.platform === 'darwin') app.dock.setMenu(buildDockMenu());
    }},
    { label: 'Quit', click() { app.quit(); } },
  ];

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: win });
});

let lastTimestamp = 0;

const tracker = createSessionTracker();
const sessionCwds = new Map();  // session_id → cwd string
const SESSION_PRUNE_MS = 10 * 60 * 1000;  // 10min — prune cold sessions
const HOT_MS  = 120 * 1000;      // 120s — actively working right now
const WARM_MS = 2 * 60 * 1000;   // 2min — session open but idle

function readStateFile() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function startPolling() {
  setInterval(() => {
    const state = readStateFile();
    if (!state || !state.last_active) return;

    const { timestamp, event, session_id, cwd } = state.last_active;
    if (timestamp === lastTimestamp) return;
    lastTimestamp = timestamp;

    const now = Date.now();

    if (isValidSessionId(session_id)) {
      if (event === 'SessionEnd') {
        tracker.remove(session_id);
        sessionCwds.delete(session_id);
      } else {
        // On SessionStart, deduplicate: if exactly one other session was seen
        // within the last 5s, it's likely the same window transitioning to a
        // resumed session (e.g. /resume in Claude Code) — replace it.
        if (event === 'SessionStart') {
          const existing = tracker.entries();
          const isNew = !existing.some(([id]) => id === session_id);
          if (isNew && existing.length === 1) {
            const [oldId, oldTime] = existing[0];
            if ((now - oldTime) < 5000) {
              tracker.remove(oldId);
            }
          }
        }
        tracker.update(session_id, now);
        if (cwd) sessionCwds.set(session_id, cwd);
      }
      tracker.prune(now - SESSION_PRUNE_MS);
      // Keep sessionCwds in sync with tracker
      for (const id of sessionCwds.keys()) {
        if (!tracker.entries().some(([sid]) => sid === id)) sessionCwds.delete(id);
      }
    }

    if (win && !win.isDestroyed()) {
      const sessions = buildSessionStates(tracker.entries(), now, HOT_MS, WARM_MS, 10);
      const sessionsWithCwd = sessions.map(s => ({
        ...s,
        cwd: sessionCwds.get(s.id) || null,
      }));
      win.webContents.send('session-update', { sessions: sessionsWithCwd });
    }

    const anim = EVENT_TO_ANIM[event];
    if (anim && win && !win.isDestroyed()) {
      win.webContents.send('peon-event', { anim, event });
    }
  }, 200);
}

// Poll cursor position to enable mouse events only when hovering the window.
// This lets the renderer receive mousemove for tooltips while keeping click-through.
function startMouseTracking() {
  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const { x: cx, y: cy } = screen.getCursorScreenPoint();
    const [wx, wy] = win.getPosition();
    const [ww, wh] = win.getSize();
    const inside = cx >= wx && cx <= wx + ww && cy >= wy && cy <= wy + wh;
    win.setIgnoreMouseEvents(!inside);
  }, 50);
}

function buildDockMenu() {
  return Menu.buildFromTemplate([
    {
      label: petVisible ? 'Hide Pet' : 'Show Pet',
      click() {
        if (!win || win.isDestroyed()) return;
        if (petVisible) {
          win.hide();
        } else {
          win.show();
        }
        petVisible = !petVisible;
        app.dock.setMenu(buildDockMenu());
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click() {
        app.quit();
      },
    },
  ]);
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const saved = loadPetConfig().window;

  win = new BrowserWindow({
    width:  saved?.w || 150,
    height: saved?.h || 150,
    x: saved?.x ?? (width - 170),
    y: saved?.y ?? (height - 170),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    focusable: false,
    movable: true,
    minWidth: 80,
    minHeight: 80,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setIgnoreMouseEvents(true);

  win.loadFile('renderer/index.html');

  if (process.platform === 'darwin') {
    const cfg = loadPetConfig();
    const char = cfg.character || 'orc';
    const customIcon = path.join(app.getPath('userData'), 'characters', char, 'dock-icon.png');
    const iconPath = (char !== 'orc' && fs.existsSync(customIcon))
      ? customIcon
      : path.join(__dirname, 'renderer', 'assets', 'orc-dock-icon.png');
    app.dock.setIcon(iconPath);
    app.dock.setMenu(buildDockMenu());
  }

  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  // Start polling once window is ready
  win.webContents.once('did-finish-load', () => {
    startPolling();
    startMouseTracking();
  });
}

app.setName('Peon Pet');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    registerCharacterProtocol();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
