import os,re,sys,json
from html.parser import HTMLParser
from urllib.parse import urlparse,unquote
root=sys.argv[1]
pages=[]
for dp,dn,fn in os.walk(root):
    if '.git' in dp: continue
    for f in fn:
        if f.endswith('.html'): pages.append(os.path.relpath(os.path.join(dp,f),root))
class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.ids=set(); s.links=[]
    def handle_starttag(s,t,a):
        a=dict(a)
        for k in ('id','name') if t=='a' else ('id',):
            if a.get(k): s.ids.add(a[k])
        for k in ('href','src'):
            v=a.get(k)
            if v and not (k=='src' and t=='script' and v.startswith('http')): s.links.append((t,k,v))
info={}
for p in pages:
    x=P(); x.feed(open(os.path.join(root,p),encoding='utf-8').read()); info[p]=x
broken=[];banch=[];total=0;atotal=0
for p,x in sorted(info.items()):
    for t,k,v in x.links:
        u=urlparse(v)
        if u.scheme or v.startswith('//') or v.startswith('mailto:') or v.startswith('tel:') or v.startswith('javascript:') or v.startswith('data:'): continue
        total+=1
        path=unquote(u.path); frag=unquote(u.fragment)
        if path=='' : tgt=p
        else:
            tgt=os.path.normpath(os.path.join(os.path.dirname(p),path)) if not path.startswith('/') else path.lstrip('/')
            if tgt.startswith('wanko-affiliate-guide/'): tgt=tgt[len('wanko-affiliate-guide/'):]
            if os.path.isdir(os.path.join(root,tgt)): tgt=os.path.join(tgt,'index.html')
            if not os.path.exists(os.path.join(root,tgt)):
                broken.append((p,v)); continue
        if frag and tgt.endswith('.html'):
            atotal+=1
            if frag not in info.get(os.path.normpath(tgt),P()).ids: banch.append((p,v))
print(json.dumps({'pages':len(pages),'internal_links':total,'anchor_links':atotal,'broken_files':len(broken),'broken_anchors':len(banch),'broken_file_list':broken[:50],'broken_anchor_list':banch[:80]},ensure_ascii=False,indent=1))
from collections import Counter
print(Counter(p for p,v in banch)); print(Counter(v for p,v in banch).most_common(20))
