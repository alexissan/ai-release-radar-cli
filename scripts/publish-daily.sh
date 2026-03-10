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
  echo '```text'
  cat daily/latest.txt
  echo '```'
} > daily/latest.md
cat > site/index.html <<HTML
<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>AI Release Radar — Daily</title>
<style>body{font-family:ui-monospace,Menlo,monospace;max-width:900px;margin:40px auto;padding:0 16px;line-height:1.4}pre{white-space:pre-wrap;background:#111;color:#eee;padding:16px;border-radius:8px}a{color:#0a66c2}</style>
</head><body>
<h1>AI Release Radar — Daily Output</h1>
<p>Generated: ${TS}</p>
<p><a href="https://github.com/alexissan/ai-release-radar-cli">GitHub Repo</a> · <a href="https://github.com/alexissan/ai-release-radar-cli/blob/main/daily/latest.md">Raw latest.md</a></p>
<pre>$(sed 's/&/\&amp;/g;s/</\&lt;/g;s/>/\&gt;/g' daily/latest.txt)</pre>
</body></html>
HTML
