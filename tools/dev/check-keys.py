#!/usr/bin/env python3
"""Reports every t('key') used in frontend/src that is missing from lang/en.json or lang/sw.json.
usage: python3 tools/dev/check-keys.py            (report)
       python3 tools/dev/check-keys.py add 'key=English|Kiswahili' ...   (adds keys to both files)"""
import json, re, glob, sys, os
root = os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'src')
fe, fs = os.path.join(root, 'lang', 'en.json'), os.path.join(root, 'lang', 'sw.json')
en, sw = json.load(open(fe)), json.load(open(fs))
if len(sys.argv) > 1 and sys.argv[1] == 'add':
    for a in sys.argv[2:]:
        k, v = a.split('=', 1); e, s = v.split('|', 1); en.setdefault(k, e); sw.setdefault(k, s)
    json.dump(en, open(fe, 'w'), ensure_ascii=False, indent=2); json.dump(sw, open(fs, 'w'), ensure_ascii=False, indent=2); print('added', len(sys.argv) - 2); sys.exit()
used = {}
for f in glob.glob(root + '/**/*.js*', recursive=True):
    if '/lang/' in f: continue
    for k in re.findall(r"\bt\(\s*['\"]([a-z0-9_&.]+)['\"]", open(f, encoding='utf-8', errors='replace').read()): used.setdefault(k, set()).add(os.path.relpath(f, root))
miss = {k: v for k, v in used.items() if k not in en or k not in sw}
for k in sorted(miss): print(f"{k:40} {'EN ' if k not in en else '   '}{'SW ' if k not in sw else '   '} {sorted(miss[k])[0]}")
print(f'{len(miss)} missing of {len(used)} keys used')
