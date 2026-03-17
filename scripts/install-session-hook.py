#!/usr/bin/env python3
"""Install peon-pet session hooks for Claude Code and Codex.

Adds session-hook.py alongside existing Claude Code hooks and installs a
Codex hooks.json entry, enabling the `codex_hooks` feature with a minimal
config.toml edit.
Safe to run multiple times — it updates older peon-pet entries in place.
"""
import json
from pathlib import Path

CLAUDE_SETTINGS_FILE = Path.home() / '.claude' / 'settings.json'
CODEX_CONFIG_DIR = Path.home() / '.codex'
CODEX_CONFIG_FILE = CODEX_CONFIG_DIR / 'config.toml'
CODEX_HOOKS_FILE = CODEX_CONFIG_DIR / 'hooks.json'
HOOK_SCRIPT = Path(__file__).resolve().parent / 'session-hook.py'
HOOK_MARKER = str(HOOK_SCRIPT)

CLAUDE_COMMAND = f'python3 {HOOK_SCRIPT} --client claude-code'
CODEX_COMMAND = f'python3 {HOOK_SCRIPT} --client codex'

CLAUDE_HOOK_ENTRY = {
    'type': 'command',
    'command': CLAUDE_COMMAND,
    'timeout': 5,
    'async': True,
}

CODEX_HOOK_ENTRY = {
    'type': 'command',
    'command': CODEX_COMMAND,
    'timeout': 5,
}

CLAUDE_EVENTS = [
    'SessionStart', 'SessionEnd', 'SubagentStart',
    'UserPromptSubmit', 'Stop', 'Notification',
    'PermissionRequest', 'PostToolUseFailure', 'PreCompact',
]

CODEX_EVENTS = ['SessionStart', 'Stop']


def load_json(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text())


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + '\n')


def find_existing_hook(event_groups):
    for group in event_groups:
        for hook in group.get('hooks', []):
            if HOOK_MARKER in hook.get('command', ''):
                return hook
    return None


def upsert_event_hook(event_groups, entry, default_group):
    existing = find_existing_hook(event_groups)
    if existing is not None:
        if existing == entry:
            return 'already'
        existing.clear()
        existing.update(entry)
        return 'updated'

    if not event_groups:
        event_groups.append(default_group(entry))
        return 'created'

    event_groups[0].setdefault('hooks', []).append(entry.copy())
    return 'added'


def default_claude_group(entry):
    return {'matcher': '', 'hooks': [entry.copy()]}


def default_codex_group(event, entry):
    group = {'hooks': [entry.copy()]}
    if event == 'SessionStart':
        group['matcher'] = ''
    return group


def install_claude_hooks():
    settings = load_json(CLAUDE_SETTINGS_FILE, {})
    hooks = settings.setdefault('hooks', {})
    changed = False

    print('Claude Code:')
    for event in CLAUDE_EVENTS:
        event_groups = hooks.setdefault(event, [])
        result = upsert_event_hook(event_groups, CLAUDE_HOOK_ENTRY.copy(), default_claude_group)
        changed = changed or result != 'already'
        marker = {
            'already': '✓',
            'updated': '↺',
            'created': '+',
            'added': '+',
        }[result]
        suffix = {
            'already': 'already installed',
            'updated': 'updated',
            'created': 'new',
            'added': 'added',
        }[result]
        print(f'  {marker} {event} ({suffix})')

    if changed:
        write_json(CLAUDE_SETTINGS_FILE, settings)


def install_codex_hooks():
    hooks_config = load_json(CODEX_HOOKS_FILE, {'hooks': {}})
    hooks = hooks_config.setdefault('hooks', {})
    changed = False

    print('Codex:')
    for event in CODEX_EVENTS:
        event_groups = hooks.setdefault(event, [])
        result = upsert_event_hook(
            event_groups,
            CODEX_HOOK_ENTRY.copy(),
            lambda entry, event_name=event: default_codex_group(event_name, entry),
        )
        changed = changed or result != 'already'
        marker = {
            'already': '✓',
            'updated': '↺',
            'created': '+',
            'added': '+',
        }[result]
        suffix = {
            'already': 'already installed',
            'updated': 'updated',
            'created': 'new',
            'added': 'added',
        }[result]
        print(f'  {marker} {event} ({suffix})')

    if changed:
        write_json(CODEX_HOOKS_FILE, hooks_config)


def enable_codex_hooks_feature():
    CODEX_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if CODEX_CONFIG_FILE.exists():
        original = CODEX_CONFIG_FILE.read_text()
    else:
        original = ''

    updated, changed = upsert_toml_bool(original, 'features', 'codex_hooks', 'true')
    if changed:
        CODEX_CONFIG_FILE.write_text(updated)
        print('  ✓ codex_hooks feature enabled')
    else:
        print('  ✓ codex_hooks feature already enabled')
    return True


def upsert_toml_bool(text, section, key, value):
    lines = text.splitlines()
    section_header = f'[{section}]'
    in_section = False

    for index, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('[') and stripped.endswith(']'):
            if in_section:
                lines.insert(index, f'{key} = {value}')
                return normalize_toml_lines(lines, text), True
            in_section = stripped == section_header
            continue
        if in_section and stripped.startswith(f'{key} ='):
            replacement = f'{key} = {value}'
            if stripped == replacement:
                return text if text.endswith('\n') or not text else text, False
            indent = line[:len(line) - len(line.lstrip())]
            lines[index] = f'{indent}{replacement}'
            return normalize_toml_lines(lines, text), True

    if in_section:
        lines.append(f'{key} = {value}')
        return normalize_toml_lines(lines, text), True

    if lines:
        lines.extend(['', section_header, f'{key} = {value}'])
    else:
        lines.extend([section_header, f'{key} = {value}'])
    return normalize_toml_lines(lines, text), True


def normalize_toml_lines(lines, original_text):
    normalized = '\n'.join(lines)
    if original_text.endswith('\n') or normalized:
        normalized += '\n'
    return normalized


def main():
    install_claude_hooks()
    install_codex_hooks()
    enable_codex_hooks_feature()
    print('\nDone — peon-pet session hooks are installed for Claude Code and Codex.')


if __name__ == '__main__':
    main()
