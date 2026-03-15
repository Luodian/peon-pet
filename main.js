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
let sessionPanel;
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
  const fallback = { 'borders.png': 'orc-borders.png', 'bg.png': 'bg-pixel.png', 'dock-icon.png': 'dock-icon.png' };

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
const PAUSED_FILE = path.join(os.homedir(), '.claude', 'hooks', 'peon-ping', '.paused');
// Session tracking file (written by session-hook.py)
const SESSIONS_FILE = path.join(os.homedir(), '.config', 'peon-pet', 'sessions.json');

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

ipcMain.handle('get-show-sessions', () => {
  return loadPetConfig().showSessions ?? false;
});

ipcMain.handle('toggle-sessions-panel', () => {
  const cfg = loadPetConfig();
  const show = !(cfg.showSessions ?? false);
  cfg.showSessions = show;
  savePetConfig(cfg);
  if (show) {
    openSessionPanel();
  } else {
    closeSessionPanel();
  }
  return show;
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
        const ppCfg = path.join(os.homedir(), '.claude', 'hooks', 'peon-ping', 'config.json');
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
    { label: 'Sessions', submenu: buildSessionMenuItems() },
    { type: 'separator' },
    { label: (loadPetConfig().showSessions ?? false) ? '✓ Sessions Panel' : '  Sessions Panel', click() {
      const c = loadPetConfig();
      const show = !(c.showSessions ?? false);
      c.showSessions = show;
      savePetConfig(c);
      if (show) openSessionPanel(); else closeSessionPanel();
    }},
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

function readSessionsFile() {
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function formatTimeAgo(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function buildSessionMenuItems() {
  const sessions = readSessionsFile();
  const now = Date.now() / 1000;
  const items = [];

  // Categorise sessions
  const running = [];  // active within last 2 min
  const idle = [];     // 2 min – 1 hr ago
  const ended = [];    // ended or > 1 hr since last event

  for (const [id, s] of Object.entries(sessions)) {
    const age = now - (s.last_event_at || 0);
    const label = s.project || path.basename(s.cwd || '') || id.slice(0, 8);
    const typeTag = s.type === 'subagent' ? ' (agent)' : '';
    const entry = { id, label, typeTag, age, ...s };

    if (s.ended) {
      ended.push(entry);
    } else if (age < 120) {
      running.push(entry);
    } else if (age < 3600) {
      idle.push(entry);
    } else {
      ended.push(entry);
    }
  }

  if (running.length === 0 && idle.length === 0 && ended.length === 0) {
    return [{ label: 'No sessions', enabled: false }];
  }

  if (running.length > 0) {
    items.push({ label: '— Running —', enabled: false });
    for (const s of running.sort((a, b) => a.age - b.age)) {
      items.push({
        label: `🟢 ${s.label}${s.typeTag}  ${formatTimeAgo(s.age * 1000)}`,
        enabled: false,
      });
    }
  }

  if (idle.length > 0) {
    if (items.length > 0) items.push({ type: 'separator' });
    items.push({ label: '— Idle —', enabled: false });
    for (const s of idle.sort((a, b) => a.age - b.age)) {
      items.push({
        label: `🟡 ${s.label}${s.typeTag}  ${formatTimeAgo(s.age * 1000)}`,
        enabled: false,
      });
    }
  }

  if (ended.length > 0) {
    if (items.length > 0) items.push({ type: 'separator' });
    items.push({ label: '— Ended —', enabled: false });
    for (const s of ended.sort((a, b) => a.age - b.age).slice(0, 10)) {
      items.push({
        label: `⚫ ${s.label}${s.typeTag}  ${formatTimeAgo(s.age * 1000)}`,
        enabled: false,
      });
    }
  }

  return items;
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
      pushSessionsToPanel();
    }

    const anim = EVENT_TO_ANIM[event];
    if (anim && win && !win.isDestroyed()) {
      win.webContents.send('peon-event', { anim, event });
    }
  }, 200);

  // Periodically refresh the sessions panel so "time ago" stays current
  setInterval(() => pushSessionsToPanel(), 5000);

  // Also poll sessions file for sub-agent activity (keeps pet awake)
  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const sessions = readSessionsFile();
    const now = Date.now() / 1000;
    const hasActive = Object.values(sessions).some(
      s => !s.ended && (now - (s.last_event_at || 0)) < 120
    );
    if (hasActive) {
      // Touch the tracker to keep sessions warm (prevents pet from sleeping)
      // Find any session_id from the sessions file that's active
      for (const [id, s] of Object.entries(sessions)) {
        if (!s.ended && (now - (s.last_event_at || 0)) < 120 && isValidSessionId(id)) {
          tracker.update(id, Date.now());
          if (s.cwd) sessionCwds.set(id, s.cwd);
        }
      }
      const sessStates = buildSessionStates(tracker.entries(), Date.now(), HOT_MS, WARM_MS, 10);
      const sessionsWithCwd = sessStates.map(ss => ({
        ...ss,
        cwd: sessionCwds.get(ss.id) || null,
      }));
      win.webContents.send('session-update', { sessions: sessionsWithCwd });
      pushSessionsToPanel();
    }
  }, 1000);
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

const PANEL_WIDTH = 200;
const PANEL_GAP = -1; // overlap by 1px so borders merge

function getSessionPanelBounds() {
  if (!win || win.isDestroyed()) return { x: 100, y: 100, h: 150 };
  const [wx, wy] = win.getPosition();
  const [ww, wh] = win.getSize();
  return { x: wx + ww + PANEL_GAP, y: wy, h: wh };
}

function openSessionPanel() {
  if (sessionPanel && !sessionPanel.isDestroyed()) {
    sessionPanel.show();
    return;
  }
  const bounds = getSessionPanelBounds();
  sessionPanel = new BrowserWindow({
    width: PANEL_WIDTH,
    height: bounds.h,
    x: bounds.x,
    y: bounds.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-panel.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  sessionPanel.setIgnoreMouseEvents(true);
  sessionPanel.loadFile('renderer/sessions-panel.html');
  sessionPanel.webContents.once('did-finish-load', () => {
    pushSessionsToPanel();
  });
  sessionPanel.on('closed', () => { sessionPanel = null; });
}

function closeSessionPanel() {
  if (sessionPanel && !sessionPanel.isDestroyed()) {
    sessionPanel.close();
    sessionPanel = null;
  }
}

function repositionPanel() {
  if (!sessionPanel || sessionPanel.isDestroyed()) return;
  const bounds = getSessionPanelBounds();
  sessionPanel.setBounds({ x: bounds.x, y: bounds.y, width: PANEL_WIDTH, height: bounds.h });
}

function pushSessionsToPanel() {
  if (!sessionPanel || sessionPanel.isDestroyed()) return;
  const sessions = readSessionsFile();
  sessionPanel.webContents.send('sessions-data', { sessions });
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

  // Keep sessions panel positioned to the right when pet is dragged
  win.on('move', repositionPanel);
  win.on('resize', repositionPanel);

  if (process.platform === 'darwin') {
    const iconPath = path.join(__dirname, 'renderer', 'assets', 'dock-icon.png');
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
    // Open sessions panel if previously enabled
    if (loadPetConfig().showSessions) {
      openSessionPanel();
    }
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
