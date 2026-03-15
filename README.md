# Peon Pet

A desktop buddy that reacts to your [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions in real time. Built with Electron + Three.js.

<div align="center">
<video src="https://github.com/PeonPing/peon-pet/raw/master/docs/demo.mp4" autoplay loop muted playsinline width="480"></video>
</div>

> **Note:** If the video doesn't render above, see [docs/demo.mp4](docs/demo.mp4) directly.

The pet sits in the corner of your screen, floats over all windows, and watches your coding sessions. When you submit a prompt it starts typing. When a task completes it celebrates. When something breaks it panics.

## Features

- **Live reactions** to Claude Code events (typing, celebrating, alarmed, annoyed)
- **Session tracking** with glowing status dots (up to 10 concurrent sessions)
- **4 selectable characters** with hot-swap (no restart needed)
- **Sessions sidebar** showing running/idle/ended sessions with time-ago
- **Sound integration** with [Peon-Ping](https://peonping.com) for audio feedback
- **Right-click menu** for character, volume, sessions panel, and visibility controls
- **Auto-start** via macOS LaunchAgent (optional)
- **Resizable** window, always-on-top, click-through with hover tooltips
- **Sub-agent awareness** tracks spawned agents as separate sessions

## How It Works

Peon Pet reads a state file written by [Peon-Ping](https://peonping.com) hooks. When Claude Code fires events (prompt submit, task complete, permission request, etc.), the hook writes to `~/.claude/hooks/peon-ping/.state.json`. Peon Pet polls this file at 200ms intervals and triggers the matching animation.

A separate Python hook (`scripts/session-hook.py`) tracks session lifecycle across main sessions and sub-agents, writing to `~/.config/peon-pet/sessions.json`.

```
Claude Code event
  -> peon-ping hook writes .state.json
  -> peon-pet polls, triggers animation + session dot update
```

### Event-to-Animation Map

| Claude Code Event | Animation | Visual Effect |
|---|---|---|
| `SessionStart` | Waking | Blue flash |
| `UserPromptSubmit` | Typing | Loops while active |
| `Stop` (task complete) | Celebrate | Gold flash + particle burst |
| `PermissionRequest` | Alarmed | Red flash |
| `PostToolUseFailure` | Annoyed | Orange flash |
| `PreCompact` | Alarmed | Red flash |

### Session Dot States

Up to 10 dots appear above the character, one per tracked session:

| State | Condition | Appearance |
|---|---|---|
| **Hot** | Event within last 30s | Bright green, pulsing |
| **Warm** | Last event 30s-2min ago | Dim green, static |
| **Gone** | Ended or >10min idle | Removed |

Hover a dot to see the project folder and status.

## Quick Start

```bash
git clone https://github.com/PeonPing/peon-pet.git
cd peon-pet
npm install
npm start
```

Right-click the pet or its dock icon for controls.

### Requirements

- macOS (Linux/Windows untested)
- Node.js 18+
- [Peon-Ping](https://peonping.com) installed and running

### Auto-Start at Login

```bash
./install.sh    # install LaunchAgent
./uninstall.sh  # remove it
```

Logs go to `/tmp/peon-pet.log`. The LaunchAgent restarts the pet if it quits.

## Characters

| Character | Description |
|---|---|
| **Sleeping Orc** | Pixel art orc at a desk, snoring while idle |
| **Laptop Guy** | Programmer hunched over a laptop (default) |
| **Standing Orc** | Full-body orc with chroma-key background |
| **Mimi** | AI-generated cat character |

Switch characters from the right-click menu. The change is instant (no reload).

## Controls

Right-click the pet or dock icon to access:

- **Sound On/Off** -- toggle Peon-Ping audio
- **Volume** -- 10% to 100% in steps
- **Character** -- switch between available characters
- **Sessions** -- view tracked sessions list
- **Sessions Panel** -- toggle inline sidebar showing session details
- **Hide/Show Pet** -- toggle visibility without quitting
- **Quit** -- exit completely

## Configuration

Settings persist in `~/.config/peon-pet/config.json`:

```json
{
  "character": "laptop-guy",
  "volume": 0.3,
  "showSessions": false,
  "window": { "w": 150, "h": 150, "x": 1770, "y": 850 }
}
```

## Session Hook Setup

To enable full session tracking (including sub-agents), install the session hook:

```bash
python3 scripts/install-session-hook.py
```

Or manually add `scripts/session-hook.py` as a Claude Code hook for all events. The hook writes session state to `~/.config/peon-pet/sessions.json`.

## Development

```bash
npm run dev       # start with DevTools detached
npm test          # run 63 Jest tests
npm test:watch    # watch mode
```

### Simulate Events

Trigger an animation without a real Claude Code session:

```bash
python3 -c "
import json, time, os, uuid
f = os.path.expanduser('~/.claude/hooks/peon-ping/.state.json')
try: state = json.load(open(f))
except: state = {}
state['last_active'] = {
  'session_id': str(uuid.uuid4()),
  'timestamp': time.time(),
  'event': 'Stop'
}
json.dump(state, open(f, 'w'))
"
```

Valid events: `SessionStart`, `SessionEnd`, `Stop`, `UserPromptSubmit`, `PermissionRequest`, `PostToolUseFailure`, `PreCompact`

### Sprite Atlas Format

Each character uses a PNG sprite sheet (6 columns x 6 rows, 512x512px per frame = 3072x3072px total). See [CONTRIBUTING.md](CONTRIBUTING.md) for the full spec and [docs/sprite-atlas-prompt.md](docs/sprite-atlas-prompt.md) for AI generation prompts.

| Row | Animation | Behavior |
|---|---|---|
| 0 | Sleeping | Loops continuously while idle |
| 1 | Waking | Plays once on session start |
| 2 | Typing | Loops while any session is active |
| 3 | Alarmed | Plays 3x on permission/compact events |
| 4 | Celebrate | Plays 3x with particle burst on task complete |
| 5 | Annoyed | Plays 3x on tool failures |

## Tech Stack

- **Electron 40** -- desktop window management
- **Three.js r183** -- WebGL rendering with custom GLSL shaders
- **Node Canvas** -- dock icon generation (dev dependency)
- **Jest 29** -- test suite
- **Python 3** -- session tracking hook

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to submit custom characters.

## License

MIT
