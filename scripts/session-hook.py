#!/usr/bin/env python3
"""Lightweight Claude Code hook for peon-pet session tracking.

Captures ALL events (including sub-agents) and writes to sessions.json.
Runs alongside peon-ping — does NOT play sounds, only tracks session state.
"""
import json, sys, os, time
from pathlib import Path

SESSIONS_FILE = Path.home() / '.config' / 'peon-pet' / 'sessions.json'
MAX_AGE_HOURS = 2  # prune sessions older than 2 hours

def main():
    try:
        event_data = json.load(sys.stdin)
    except Exception:
        return

    event = event_data.get('hook_event_name', '')
    session_id = (event_data.get('session_id', '')
                  or event_data.get('conversation_id', ''))
    cwd = event_data.get('cwd', '')
    roots = event_data.get('workspace_roots', [])
    if not cwd and roots:
        cwd = roots[0]
    source = event_data.get('source', '')

    if not session_id:
        return

    # Ensure directory exists
    SESSIONS_FILE.parent.mkdir(parents=True, exist_ok=True)

    # Load existing sessions
    try:
        sessions = json.loads(SESSIONS_FILE.read_text())
    except Exception:
        sessions = {}

    now = time.time()

    # Prune old sessions
    cutoff = now - MAX_AGE_HOURS * 3600
    sessions = {k: v for k, v in sessions.items()
                if v.get('last_event_at', 0) > cutoff}

    # Determine session type
    is_subagent = source in ('subagent', 'task')

    # Update or create session entry
    if session_id in sessions:
        s = sessions[session_id]
        s['last_event_at'] = now
        s['last_event'] = event
        if cwd and not s.get('cwd'):
            s['cwd'] = cwd
            s['project'] = os.path.basename(cwd)
        if event in ('SessionEnd',):
            s['ended'] = True
            s['ended_at'] = now
    else:
        sessions[session_id] = {
            'type': 'subagent' if is_subagent else 'main',
            'cwd': cwd,
            'project': os.path.basename(cwd) if cwd else '',
            'started_at': now,
            'last_event_at': now,
            'last_event': event,
            'ended': False,
            'ended_at': None,
        }

    # Write atomically
    tmp = str(SESSIONS_FILE) + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(sessions, f, indent=2)
    os.replace(tmp, str(SESSIONS_FILE))

if __name__ == '__main__':
    main()
