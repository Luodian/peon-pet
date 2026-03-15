const panel = document.getElementById('panel');

function formatTimeAgo(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function render(sessions) {
  if (!sessions || Object.keys(sessions).length === 0) {
    panel.innerHTML = '<div class="empty">No sessions</div>';
    return;
  }

  const now = Date.now() / 1000;
  const running = [];
  const idle = [];
  const ended = [];

  for (const [id, s] of Object.entries(sessions)) {
    const age = now - (s.last_event_at || 0);
    const label = s.project || (s.cwd ? s.cwd.split('/').filter(Boolean).pop() : id.slice(0, 8));
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

  let html = '';

  if (running.length > 0) {
    html += '<div class="section-label">Running</div>';
    for (const s of running.sort((a, b) => a.age - b.age)) {
      html += `<div class="session-row">
        <span class="dot running"></span>
        <span class="session-name">${esc(s.label)}${esc(s.typeTag)}</span>
        <span class="session-time">${formatTimeAgo(s.age * 1000)}</span>
      </div>`;
    }
  }

  if (idle.length > 0) {
    html += '<div class="section-label">Idle</div>';
    for (const s of idle.sort((a, b) => a.age - b.age)) {
      html += `<div class="session-row">
        <span class="dot idle"></span>
        <span class="session-name">${esc(s.label)}${esc(s.typeTag)}</span>
        <span class="session-time">${formatTimeAgo(s.age * 1000)}</span>
      </div>`;
    }
  }

  if (ended.length > 0) {
    html += '<div class="section-label">Ended</div>';
    for (const s of ended.sort((a, b) => a.age - b.age).slice(0, 10)) {
      html += `<div class="session-row">
        <span class="dot ended"></span>
        <span class="session-name">${esc(s.label)}${esc(s.typeTag)}</span>
        <span class="session-time">${formatTimeAgo(s.age * 1000)}</span>
      </div>`;
    }
  }

  if (html === '') {
    html = '<div class="empty">No sessions</div>';
  }

  panel.innerHTML = html;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

window.panelBridge.onSessionsData((data) => {
  render(data.sessions);
});
