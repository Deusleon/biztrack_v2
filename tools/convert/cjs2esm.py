#!/usr/bin/env python3
"""Mechanical CommonJS -> ESM converter for the BizTrack backend (no logic changes)."""
import os, re, sys, json

SRC = sys.argv[1]; DST = sys.argv[2]
SKIP_DIRS = {'node_modules', 'DB', 'tests', 'scripts', 'certs', 'docs', 'locales'}
files = []
for root, dirs, fs in os.walk(SRC):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for f in fs:
        if f.endswith('.js') and not f.endswith('.zip'):
            files.append(os.path.join(root, f))

def read(p): return open(p, encoding='utf-8').read().replace('\r\n', '\n').replace('\r', '\n')

src = {p: read(p) for p in files}
rel = lambda p: os.path.relpath(p, SRC).replace(os.sep, '/')

# --- 1) export style of every module -------------------------------------------------
style = {}
for p, s in src.items():
    body = re.sub(r'//.*', '', s)
    has_complex = False
    mo = re.search(r'^[ \t]*module\.exports\s*=\s*\{([\s\S]*?)^\};?\s*$|^[ \t]*module\.exports\s*=\s*\{([^{}]*)\};?', body, re.M)
    def simple(inner):
        parts = [x.strip() for x in re.split(r',', inner) if x.strip()]
        return all(re.match(r'^\w+(\s*:\s*\w+)?$', x) for x in parts)
    has_obj = None
    if mo:
        inner = mo.group(1) if mo.group(1) is not None else mo.group(2)
        if '{' not in inner and '(' not in inner and simple(inner): has_obj = mo
        else: has_complex = True
    has_def = re.search(r'^[ \t]*module\.exports\s*=\s*(?!\{)[^;\n]+', body, re.M) or has_complex
    has_named = re.search(r'^exports\.\w+\s*=', body, re.M)
    if has_def and not has_obj and not has_named: style[p] = 'default'
    elif has_complex and has_named: style[p] = 'mixed'
    elif has_obj or has_named: style[p] = 'named' if not (has_obj and has_named) else 'mixed'
    elif has_def: style[p] = 'default'
    else: style[p] = 'none'

def resolve(frm, spec):
    base = os.path.normpath(os.path.join(os.path.dirname(frm), spec))
    for c in (base, base + '.js', os.path.join(base, 'index.js')):
        if c in src: return c
    return None

report = {'mixed': [p for p, v in style.items() if v == 'mixed'], 'inline': [], 'unresolved': []}

def esm_spec(frm, spec, target):
    r = os.path.relpath(target, os.path.dirname(frm)).replace(os.sep, '/')
    if not r.startswith('.'): r = './' + r
    if rel(target) == 'config/db.js': pass
    return r

counter = [0]
def convert(p, s):
    out_imports = []
    uses_dirname = bool(re.search(r'\b__dirname\b|\b__filename\b', s))

    def local_import(kind, name, spec):
        t = resolve(p, spec)
        if not t:
            report['unresolved'].append((rel(p), spec)); return None
        sp = esm_spec(p, spec, t)
        st = style[t]
        if kind == 'ns':
            if st == 'default': return f"import {name} from '{sp}';"
            return f"import * as {name} from '{sp}';"
        # destructure
        names = [x.strip() for x in name.split(',') if x.strip()]
        items = []
        for n in names:
            m = re.match(r'(\w+)\s*:\s*(\w+)$', n)
            items.append(f"{m.group(1)} as {m.group(2)}" if m else n)
        if st == 'default':
            counter[0] += 1; tmp = f"_m{counter[0]}"
            return f"import {tmp} from '{sp}';\nconst {{ {name} }} = {tmp};"
        return f"import {{ {', '.join(items)} }} from '{sp}';"

    def pkg_import(kind, name, spec):
        if kind == 'ns':
            counter[0] += 1; tmp = f"_n{counter[0]}"
            return f"import * as {tmp} from '{spec}';\nconst {name} = {tmp}.default ?? {tmp};"
        counter[0] += 1; tmp = f"_p{counter[0]}"
        return f"import * as {tmp} from '{spec}';\nconst {{ {name} }} = {tmp}.default ?? {tmp};"

    # dotenv
    s = re.sub(r"^\s*require\(['\"]dotenv['\"]\)\.config\(\);?\s*$", "import 'dotenv/config';", s, flags=re.M)
    # const X = require('..').prop;   (rare) -> keep as const via namespace
    def prop_req(m):
        decl, name, spec, prop = m.groups()
        counter[0] += 1; tmp = f"_r{counter[0]}"
        if spec.startswith('.'):
            t = resolve(p, spec)
            if not t: return m.group(0)
            return f"import * as {tmp} from '{esm_spec(p, spec, t)}';\n{decl} {name} = {tmp}.{prop};"
        return f"import {tmp} from '{spec}';\n{decl} {name} = {tmp}.{prop};"
    s = re.sub(r"^(const|let|var)\s+(\w+)\s*=\s*require\(['\"]([^'\"]+)['\"]\)\.(\w+);?\s*$", prop_req, s, flags=re.M)
    # const { a, b: c } = require('x');
    def d_req(m):
        names, spec = m.group(1), m.group(2)
        if spec.endswith('.json'): return m.group(0)
        r = local_import('d', names, spec) if spec.startswith('.') else pkg_import('d', names, spec)
        return r if r else m.group(0)
    s = re.sub(r"^(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(['\"]([^'\"]+)['\"]\);?\s*$", d_req, s, flags=re.M)
    # const X = require('x');
    def n_req(m):
        name, spec = m.group(1), m.group(2)
        if spec.endswith('.json'):
            return f"import {name} from '{spec}' with {{ type: 'json' }};"
        if spec.startswith('.'):
            r = local_import('ns', name, spec); return r if r else m.group(0)
        if spec in ('fs', 'path', 'os', 'crypto', 'http', 'https', 'zlib', 'util', 'stream', 'child_process', 'events', 'url', 'buffer', 'readline', 'querystring'):
            return f"import {name} from '{spec}';"
        return pkg_import('ns', name, spec)
    s = re.sub(r"^(?:const|let|var)\s+(\w+)\s*=\s*require\(['\"]([^'\"]+)['\"]\);?\s*$", n_req, s, flags=re.M)
    # bare: require('x');
    s = re.sub(r"^\s*require\(['\"]([^'\"]+)['\"]\);?\s*$", lambda m: f"import '{m.group(1)}';", s, flags=re.M)

    # remaining require( -> report
    left = [i + 1 for i, l in enumerate(s.split('\n')) if re.search(r'\brequire\(', l) and not l.strip().startswith('//') and not l.strip().startswith('*')]
    if left: report['inline'].append((rel(p), left))

    # --- exports ---
    def mod_obj(m):
        inner = m.group(1)
        parts = [x.strip() for x in re.split(r',', inner.strip().rstrip(',')) if x.strip()]
        exp = []
        for x in parts:
            mm = re.match(r'^(\w+)$', x)
            if mm: exp.append(x); continue
            mm = re.match(r'^(\w+)\s*:\s*(\w+)$', x)
            if mm: exp.append(f"{mm.group(2)} as {mm.group(1)}"); continue
            report.setdefault('complex_exports', []).append((rel(p), x[:60])); return m.group(0)
        return f"export {{ {', '.join(exp)} }};"
    if style[p] == 'named':
        s = re.sub(r"^[ \t]*module\.exports\s*=\s*\{([^{}]*)\};?\s*$", mod_obj, s, flags=re.M)
        s = re.sub(r"^[ \t]*module\.exports\s*=\s*exports;?\s*$", "", s, flags=re.M)
        # names already bound at top level (imports, function declarations, consts)
        bound = set()
        for mm in re.finditer(r"^import\s+(?:\*\s+as\s+)?(\w+)\s+from", s, re.M): bound.add(mm.group(1))
        for mm in re.finditer(r"^import\s*\{([^}]*)\}\s*from", s, re.M):
            for n in mm.group(1).split(','):
                n = n.strip().split(' as ')[-1].strip()
                if n: bound.add(n)
        for mm in re.finditer(r"^(?:async\s+)?function\s+(\w+)", s, re.M): bound.add(mm.group(1))
        for mm in re.finditer(r"^(?:const|let|var)\s+(\w+)\s*=", s, re.M): bound.add(mm.group(1))
        for mm in re.finditer(r"^(?:const|let|var)\s*\{([^}]*)\}\s*=", s, re.M):
            for n in mm.group(1).split(','):
                n = n.strip().split(':')[-1].strip()
                if n: bound.add(n)
        tail = []
        def exp_assign(m):
            name = m.group(1)
            rest_line = s[m.end():s.index('\n', m.end())]
            if re.match(r"^" + re.escape(name) + r";?\s*$", rest_line):   # exports.x = x;
                tail.append(f"export {{ {name} }};"); return "// (re-export) "
            if name in bound:
                tail.append(f"export {{ _exp_{name} as {name} }};"); return f"const _exp_{name} = "
            return f"export const {name} = "
        s = re.sub(r"^exports\.(\w+)\s*=\s*", exp_assign, s, flags=re.M)
        s = s.rstrip('\n') + '\n' + '\n'.join(tail) + '\n'
    else:
        s = re.sub(r"^[ \t]*module\.exports\s*=\s*function\b", "export default function", s, flags=re.M)
        s = re.sub(r"^[ \t]*module\.exports\s*=\s*\{", "export default {", s, flags=re.M)
        s = re.sub(r"^[ \t]*module\.exports\s*=\s*([^{\n][^\n]*?);?\s*$", r"export default \1;", s, flags=re.M)

    if uses_dirname:
        hdr = "import { fileURLToPath as _ftu } from 'url';\nimport _path from 'path';\nconst __filename = _ftu(import.meta.url);\nconst __dirname = _path.dirname(__filename);\n"
        s = hdr + s
    return s

for p, s in src.items():
    out = convert(p, s)
    # imports must precede code for readability; ESM hoists them anyway.
    dst = os.path.join(DST, rel(p))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, 'w', encoding='utf-8').write(out)

json.dump(report, open('/tmp/convert_report.json', 'w'), indent=1)
print(json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in report.items()}))
