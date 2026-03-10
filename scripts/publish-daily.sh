#!/usr/bin/env bash
set -euo pipefail
mkdir -p daily site
TS="$(date -u +"%Y-%m-%d %H:%M UTC")"
node dist/cli.js today > daily/latest.txt || true
{
  echo "# AI Release Radar — Latest"
  echo
  echo "Generated: ${TS}"
  echo
  cat daily/latest.txt
} > daily/latest.md

python3 - <<'PY'
from pathlib import Path
import html, re

repo = "https://github.com/alexissan/ai-release-radar-cli"
raw = f"{repo}/blob/main/daily/latest.md"
ts = Path("daily/latest.md").read_text().splitlines()[2].replace("Generated: ", "")
text = Path("daily/latest.txt").read_text()

url_re = re.compile(r'https?://[^\s)]+')

def linkify(line: str) -> str:
    out = []
    last = 0
    for m in url_re.finditer(line):
        out.append(html.escape(line[last:m.start()]))
        url = m.group(0)
        out.append(f'<a href="{html.escape(url)}" target="_blank" rel="noopener">{html.escape(url)}</a>')
        last = m.end()
    out.append(html.escape(line[last:]))
    return ''.join(out)

lines = text.splitlines()
# Hide fallback diagnostics on public page for cleaner UX.
clean_lines = []
skip = False
for ln in lines:
    if ln.strip() == 'Fallback status':
        skip = True
        continue
    if skip:
        continue
    clean_lines.append(ln)

rendered = []
for ln in clean_lines:
    if re.match(r'^\d\)\s', ln):
        rendered.append(f'<h2>{html.escape(ln)}</h2>')
    elif ln.startswith('- '):
        rendered.append(f'<p class="bullet">• {linkify(ln[2:])}</p>')
    elif ln.strip() == '':
        rendered.append('<div class="spacer"></div>')
    else:
        rendered.append(f'<p>{linkify(ln)}</p>')

html_out = f'''<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>AI Release Radar — Daily</title>
  <style>
    :root {{ --bg:#0b1020; --card:#131a2b; --text:#e9eefc; --muted:#9fb0d5; --accent:#7cc4ff; }}
    body {{ margin:0; background:linear-gradient(180deg,#0b1020,#121a2e); color:var(--text); font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }}
    .wrap {{ max-width:900px; margin:40px auto; padding:0 16px; }}
    .card {{ background:var(--card); border:1px solid #233250; border-radius:14px; padding:22px; box-shadow:0 10px 30px rgba(0,0,0,.25); }}
    h1 {{ margin:0 0 8px; font-size:1.6rem; }}
    h2 {{ margin:18px 0 8px; font-size:1.05rem; color:#cfe0ff; }}
    p {{ margin:6px 0; line-height:1.45; }}
    .bullet {{ padding-left:2px; }}
    .meta {{ color:var(--muted); font-size:.95rem; }}
    .links {{ margin:12px 0 16px; }}
    a {{ color:var(--accent); text-decoration:none; }}
    a:hover {{ text-decoration:underline; }}
    .spacer {{ height:8px; }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>AI Release Radar — Daily Output</h1>
      <p class="meta">Generated: {html.escape(ts)}</p>
      <p class="links"><a href="{repo}" target="_blank" rel="noopener">GitHub Repo</a> · <a href="{raw}" target="_blank" rel="noopener">Raw latest.md</a></p>
      {''.join(rendered)}
    </div>
  </div>
</body>
</html>'''

Path("site/index.html").write_text(html_out)
PY
