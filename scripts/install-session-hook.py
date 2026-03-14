#!/usr/bin/env python3
"""Add peon-pet session-hook to Claude Code settings.json.

Adds session-hook.py alongside existing peon-ping hooks for all events.
Safe to run multiple times — skips if already installed.
"""
import json, sys
from pathlib import Path

SETTINGS_FILE = Path.home() / '.claude' / 'settings.json'
HOOK_SCRIPT = Path(__file__).resolve().parent / 'session-hook.py'

HOOK_ENTRY = {
    'type': 'command',
    'command': f'python3 {HOOK_SCRIPT}',
    'timeout': 5,
    'async': True,
}

# All Claude Code hook events we want to track
EVENTS = [
    'SessionStart', 'SessionEnd', 'SubagentStart',
    'UserPromptSubmit', 'Stop', 'Notification',
    'PermissionRequest', 'PostToolUseFailure', 'PreCompact',
]

def main():
    settings = json.loads(SETTINGS_FILE.read_text())
    hooks = settings.setdefault('hooks', {})
    marker = str(HOOK_SCRIPT)
    changed = False

    for event in EVENTS:
        event_hooks = hooks.get(event, [])
        if not event_hooks:
            # No existing hooks for this event — create a new entry
            event_hooks = [{'matcher': '', 'hooks': [HOOK_ENTRY.copy()]}]
            hooks[event] = event_hooks
            changed = True
            print(f'  + {event} (new)')
            continue

        # Check if session-hook is already in the first matcher group
        group = event_hooks[0]
        group_hooks = group.get('hooks', [])
        already = any(marker in h.get('command', '') for h in group_hooks)
        if already:
            print(f'  ✓ {event} (already installed)')
            continue

        group_hooks.append(HOOK_ENTRY.copy())
        changed = True
        print(f'  + {event}')

    if changed:
        SETTINGS_FILE.write_text(json.dumps(settings, indent=2) + '\n')
        print('\nDone — session-hook installed.')
    else:
        print('\nNo changes needed — all hooks already installed.')

if __name__ == '__main__':
    main()
