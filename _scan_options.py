import json, re
p = r"d:\Works\Private\BizTrack\biztrack-v2\backend\src\seeds\seed.js"
text = open(p, encoding="utf-8").read()
m = re.search(r"PACKAGE_OPTIONS_JSON = '(\{.*?\})'", text)
print("found", bool(m))
if not m:
    raise SystemExit(1)
data = json.loads(m.group(1))
print("top", list(data)[:20])

def walk(o):
    if isinstance(o, dict):
        if "fields" in o and isinstance(o["fields"], list):
            print(o.get("id"), [f.get("key") for f in o["fields"]])
        for v in o.values():
            walk(v)
    elif isinstance(o, list):
        for v in o:
            walk(v)
walk(data)
