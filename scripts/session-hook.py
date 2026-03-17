#!/usr/bin/env python3
"""Lightweight session hook for peon-pet session tracking.

Captures Claude Code and Codex hook events, then writes normalized session
metadata to sessions.json. Runs alongside peon-ping — it does NOT play sounds,
only tracks session state.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

SESSIONS_FILE = Path.home() / '.config' / 'peon-pet' / 'sessions.json'
MAX_AGE_HOURS = 2  # prune sessions older than 2 hours
CLIENT_TITLES = {
    'claude-code': 'Claude Code',
    'codex': 'Codex',
}
CLAUDE_SUBAGENT_SOURCES = {'subagent', 'task'}
CODEX_SESSION_START_SOURCES = {'startup', 'resume', 'clear'}


def parse_args():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--client', choices=sorted(CLIENT_TITLES))
    return parser.parse_args()


def detect_client(event_data, forced_client=None):
    if forced_client:
        return forced_client

    source = event_data.get('source', '')
    if source in CODEX_SESSION_START_SOURCES:
        return 'codex'
    if event_data.get('stop_hook_active') is not None:
        return 'codex'
    if event_data.get('workspace_roots') or event_data.get('conversation_id'):
        return 'claude-code'
    return 'claude-code'


def display_name(session_id, cwd):
    project = os.path.basename(cwd) if cwd else ''
    return project or session_id[:8], project


def build_title(name, client, session_type):
    client_title = CLIENT_TITLES.get(client, client or 'Unknown')
    if session_type == 'subagent':
        return f'{name} ({client_title} agent)'
    return f'{name} ({client_title})'


def main():
    args = parse_args()

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
    client = detect_client(event_data, args.client)

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
    sessions = {
        key: value
        for key, value in sessions.items()
        if value.get('last_event_at', 0) > cutoff
    }

    is_subagent = source in CLAUDE_SUBAGENT_SOURCES
    session_type = 'subagent' if is_subagent else 'main'
    name, project = display_name(session_id, cwd)

    if session_id in sessions:
        session = sessions[session_id]
        if cwd:
            session['cwd'] = cwd
            session['project'] = project
        session['client'] = client
        session['type'] = (
            'subagent'
            if session.get('type') == 'subagent' or is_subagent
            else 'main'
        )
        session['title'] = build_title(
            session.get('project') or name,
            session['client'],
            session['type'],
        )
        session['last_event_at'] = now
        session['last_event'] = event
        if event == 'SessionEnd':
            session['ended'] = True
            session['ended_at'] = now
    else:
        sessions[session_id] = {
            'type': session_type,
            'client': client,
            'cwd': cwd,
            'project': project,
            'title': build_title(name, client, session_type),
            'started_at': now,
            'last_event_at': now,
            'last_event': event,
            'ended': False,
            'ended_at': None,
        }

    tmp = str(SESSIONS_FILE) + '.tmp'
    with open(tmp, 'w') as handle:
        json.dump(sessions, handle, indent=2)
    os.replace(tmp, str(SESSIONS_FILE))


if __name__ == '__main__':
    main()
