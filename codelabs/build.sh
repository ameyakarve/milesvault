#!/usr/bin/env bash
# Build the MilesVault codelabs into public/learn (served at milesvault.com/learn).
# Re-run after editing any codelabs/<id>/index.md. Requires `claat` (go install
# github.com/googlecodelabs/tools/claat@latest) — override path with CLAAT=.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CLAAT="${CLAAT:-$HOME/go/bin/claat}"
TMPL="$ROOT/_tmpl/milesvault.html"
OUT="$ROOT/../public/learn"

# Order matters: this is the series order shown on the landing page.
LABS=(getting-started ledger-foundations opening-balances modelling-rewards redemptions-and-tools capture-at-scale)

echo "→ building ${#LABS[@]} codelabs into $OUT"
rm -rf "$OUT"
mkdir -p "$OUT/assets"
cp "$ROOT/../public/logo.svg" "$OUT/assets/logo.svg"

for id in "${LABS[@]}"; do
  ( cd "$ROOT/$id" && "$CLAAT" export -f "$TMPL" -o "$OUT" index.md >/dev/null )
  echo "  ✓ $id"
done

# Generate the branded landing page from each lab's codelab.json.
LABS_JSON="$(printf '%s\n' "${LABS[@]}" | node -e '
const fs=require("fs");
const ids=require("fs").readFileSync(0,"utf8").trim().split("\n");
const out="'"$OUT"'";
const labs=ids.map(id=>{const j=JSON.parse(fs.readFileSync(`${out}/${id}/codelab.json`,"utf8"));return {id,title:j.title,summary:j.summary||"",duration:j.duration||0};});
process.stdout.write(JSON.stringify(labs));
')"

export OUT LABS_JSON
node -e '
const fs=require("fs");
const labs=JSON.parse(process.env.LABS_JSON);
const out=process.env.OUT;
const cards=labs.map((l,i)=>`      <a class="card" href="./${l.id}/">
        <span class="num">${i+1}</span>
        <span class="body">
          <span class="title">${l.title.replace(/^Lab \d+ · /,"")}</span>
          <span class="summary">${l.summary}</span>
          <span class="meta">${l.duration} min</span>
        </span>
        <span class="arrow">→</span>
      </a>`).join("\n");
const html=`<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#4d6e60" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#131417" media="(prefers-color-scheme: dark)">
<title>Learn · MilesVault</title>
<link rel="icon" href="./assets/logo.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>
  :root{color-scheme:light dark;--accent:#4d6e60;--page:#f5f5f2;--card:#fff;--text:#1c1c1c;--muted:#5f5f5f;--border:#e6e6e2}
  @media (prefers-color-scheme:dark){:root{--accent:#93b8a5;--page:#131417;--card:#1c1e22;--text:#e7e7e3;--muted:#9a9a96;--border:#2c2f34}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--page);color:var(--text);font-family:Inter,system-ui,sans-serif;line-height:1.5}
  .wrap{max-width:720px;margin:0 auto;padding:64px 20px 96px}
  .brand{display:flex;align-items:center;gap:10px;margin-bottom:40px}
  .brand img{width:30px;height:30px}
  .brand span{font-weight:600;font-size:18px;letter-spacing:-.01em}
  h1{font-size:30px;letter-spacing:-.02em;margin:0 0 8px}
  .lede{color:var(--muted);font-size:16px;margin:0 0 36px;max-width:60ch}
  .card{display:flex;align-items:center;gap:16px;padding:18px 18px;margin:10px 0;background:var(--card);border:1px solid var(--border);border-radius:12px;text-decoration:none;color:inherit;transition:border-color .15s,transform .15s}
  .card:hover{border-color:var(--accent);transform:translateY(-1px)}
  .num{flex:0 0 auto;width:30px;height:30px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px}
  @media (prefers-color-scheme:dark){.num{color:#10231b}}
  .body{display:flex;flex-direction:column;gap:3px;flex:1 1 auto;min-width:0}
  .title{font-weight:600;font-size:16px}
  .summary{color:var(--muted);font-size:13.5px}
  .meta{color:var(--muted);font-size:12px;margin-top:2px}
  .arrow{color:var(--muted);flex:0 0 auto;font-size:18px}
  footer{margin-top:48px;color:var(--muted);font-size:13px}
  footer a{color:var(--accent)}
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand"><img src="./assets/logo.svg" alt=""><span>MilesVault</span></div>
    <h1>Learn MilesVault</h1>
    <p class="lede">MilesVault is an operating system for your points and miles. These hands-on labs take you from signing in to writing your own ledger — and putting every point to work. Start at the top.</p>
${cards}
    <footer>Questions? Ask in <strong>#general</strong> on Discord, or open <a href="https://milesvault.com">MilesVault</a>.</footer>
  </div>
</body>
</html>`;
fs.writeFileSync(`${out}/index.html`, html);
'
echo "  ✓ index.html (landing)"
echo "→ done. Preview: $OUT"
