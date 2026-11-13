import json,re
EN=json.load(open('/home/claude/v2/frontend/src/lang/en.json',encoding='utf-8'))
SW=json.load(open('/home/claude/v2/frontend/src/lang/sw.json',encoding='utf-8'))
_idx={}
for k,v in EN.items():
    if isinstance(v,str): _idx.setdefault(v.strip().lower(),[]).append(k)
def key_for(label):
    ks=_idx.get(label.strip().lower())
    if not ks: return None
    ks=sorted(ks,key=lambda k:(k.startswith('ui_')==False and 0 or 1,len(k)))  # prefer plain keys
    for k in ks:
        if k in SW: return k
    return ks[0]
def resolve(label,lang):
    k=key_for(label)
    if k is None: return None
    return (EN if lang=='en' else SW).get(k,EN[k])
def apply(md,lang,warn):
    def rep(m):
        lab=m.group(1); r=resolve(lab,lang)
        if r is None: warn.add(lab); return f'<b>{lab}</b>'
        return f'<b>{r}</b>'
    return re.sub(r'\[\[(.+?)\]\]',rep,md)
if __name__=='__main__':
    import sys
    md=open(sys.argv[1],encoding='utf-8').read(); w=set(); apply(md,'en',w)
    print(len(w),'unmatched:',sorted(w))
