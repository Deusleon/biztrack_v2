import re, sys, io, json
sys.path.insert(0,'/home/claude/guide')
from labels import apply
from content import CH as CH16
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, NextPageTemplate, Flowable, KeepTogether, CondPageBreak)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.fonts import addMapping
D='/usr/share/fonts/truetype/crosextra/'
for n,f in (('Carlito','Carlito-Regular'),('Carlito-Bold','Carlito-Bold'),('Carlito-Italic','Carlito-Italic'),('Carlito-BoldItalic','Carlito-BoldItalic')):
    pdfmetrics.registerFont(TTFont(n,D+f+'.ttf'))
addMapping('Carlito',0,0,'Carlito'); addMapping('Carlito',1,0,'Carlito-Bold'); addMapping('Carlito',0,1,'Carlito-Italic'); addMapping('Carlito',1,1,'Carlito-BoldItalic')
import os
MONO='Courier'
for cand in ('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',):
    if os.path.exists(cand): pdfmetrics.registerFont(TTFont('DejaVuMono',cand)); MONO='DejaVuMono'
W,H=A4
TEAL=colors.Color(10/255,152/255,157/255); NAVY=colors.Color(0.0235,0.2314,0.4667); GREY=colors.Color(.45,.47,.5); LINE=colors.Color(.8,.82,.84); DARK=colors.Color(.13,.15,.18)
LOGO='/home/claude/brand/full.png'; WM='/home/claude/brand/watermark.png'; ICON='/home/claude/v2/frontend/public/brand-emblem.png'
BODY=ParagraphStyle('b',fontName='Carlito',fontSize=10.5,leading=14.5,spaceAfter=6,textColor=DARK)
H2=ParagraphStyle('h2',parent=BODY,fontName='Carlito-Bold',fontSize=15,leading=19,textColor=TEAL,spaceBefore=12,spaceAfter=6,keepWithNext=1)
HB=ParagraphStyle('hb',parent=H2,fontSize=20,leading=24,spaceBefore=0)
LI=ParagraphStyle('li',parent=BODY,leftIndent=26,bulletIndent=6,spaceAfter=3,bulletFontName='Carlito-Bold',bulletFontSize=10.5,bulletColor=TEAL)
CELL=ParagraphStyle('c',parent=BODY,fontSize=9.5,leading=12.5,spaceAfter=0)
CELLH=ParagraphStyle('ch',parent=CELL,fontName='Carlito-Bold',textColor=colors.white)
T={'en':dict(chapter='CHAPTER',path='PATH',perm='PERMISSION',note='NOTE',tip='TIP',warn='WARNING',hdr='BizTrack User Guide',ed='Version 2 · November 2026 Edition',page='Page',
 cov_sub='Modern Business & Point-of-Sale Management System',cov_title='USER GUIDE',cov_ver='VERSION 2',cov_tag='How to Use BizTrack to Run Your Business Day to Day',cov_prep='Prepared for BizTrack business owners and users',
 about='About This Guide',contents='Contents',quick='Quick Reference: Where to Find Things',
 qh=['Menu','Pages']),
 'sw':dict(chapter='SURA YA',path='NJIA',perm='RUHUSA',note='KUMBUKA',tip='KIDOKEZO',warn='ONYO',hdr='BizTrack Muongozo wa Mtumiaji',ed='Toleo la Pili (Version 2) · Novemba 2026',page='Ukurasa',
 cov_sub='Mfumo wa Kisasa wa Usimamizi wa Biashara na Mauzo (POS)',cov_title='MUONGOZO WA MTUMIAJI',cov_ver='TOLEO LA 2 (VERSION 2)',cov_tag='Jinsi ya Kutumia BizTrack Kuendesha Biashara Yako Siku kwa Siku',cov_prep='Imeandaliwa kwa ajili ya wamiliki na watumiaji wa BizTrack',
 about='Kuhusu Muongozo Huu',contents='Yaliyomo',quick='Rejea ya Haraka: Mahali pa Kupata Vitu',
 qh=['Menyu','Kurasa'])}
ABOUT={'en':"""BizTrack helps you run your whole business from one place — sales, purchases, stock, expenses, customers, staff, SMS and reports — for a single store or many.

This guide is written for everyday users: the owner, a manager, a cashier or an accountant. It explains each screen step by step, using the same names you see on the screen. It does not cover technical operation (servers, databases, code).

## How to read the boxes

> NOTE: Useful information to remember.
> WARNING: Something that can cause data loss or mistakes — read carefully.
> TIP: A faster or better way of doing things.

## What’s New in Version 2

This edition describes BizTrack Version 2 and replaces the October 2026 edition. Every screen was checked again, and the guide now covers:

- A faster start, and lists that become easy-to-read cards on a phone (Chapter 4 and 5).
- BizTrack as an installable app that tells you when a new version is ready (section 1.9).
- Safer sign-in, with a short pause after repeated wrong passwords (section 1.2).
- A dashboard for every role, including roles without the money figures (section 1.5).
- Barcode printing, delivery notes, approval of sales returns, and goods inspection when receiving stock (Chapters 2 to 5).
- Receipts that print straight to the printer through QZ Tray, from every place a receipt can be printed (section 4.4).
- Reports with the usual columns, a Total row, charts, and exports to PDF, Excel and CSV (Chapter 7).
- Integrations — your own email mailbox, SMS gateways and Google Drive backup (section 11.10).
- Friendly error cards instead of blank screens (Chapter 15).
- A summary of all of this in Chapter 16.""",
'sw':"""BizTrack inakusaidia kuendesha biashara yako yote mahali pamoja — mauzo, manunuzi, hisa, matumizi, wateja, wafanyakazi, SMS na ripoti — kwa duka moja au maduka mengi.

Muongozo huu umeandikwa kwa watumiaji wa kila siku: mmiliki, meneja, mhudumu au mhasibu. Unaeleza kila skrini hatua kwa hatua, kwa majina yale yale unayoyaona kwenye skrini. Hauelezi uendeshaji wa kiufundi (seva, hifadhidata, msimbo).

## Jinsi ya Kusoma Visanduku

> NOTE: Taarifa muhimu ya kukumbuka.
> WARNING: Kitu kinachoweza kusababisha upotevu wa data au makosa — soma kwa makini.
> TIP: Njia ya haraka au bora ya kufanya mambo.

## Mapya katika Toleo la 2

Toleo hili linaeleza BizTrack Toleo la 2 na linachukua nafasi ya toleo la Oktoba 2026. Kila skrini ilikaguliwa upya, na muongozo sasa unahusu:

- Kufunguka kwa haraka zaidi, na orodha zinazogeuka kuwa kadi rahisi kusoma kwenye simu (Sura ya 4 na 5).
- BizTrack kama programu inayosakinishwa inayokujulisha toleo jipya likiwa tayari (sehemu ya 1.9).
- Kuingia salama zaidi, kukiwa na kusimama kwa muda mfupi baada ya nenosiri kukosewa mara nyingi (sehemu ya 1.2).
- Dashibodi kwa kila jukumu, ikiwemo majukumu yasiyo na takwimu za fedha (sehemu ya 1.5).
- Kuchapa barcode, hati za kupeleka bidhaa, kuidhinisha marejesho ya mauzo, na ukaguzi wa bidhaa wakati wa kupokea hisa (Sura ya 2 hadi 5).
- Risiti zinazochapishwa moja kwa moja kwenye printa kupitia QZ Tray, kutoka kila mahali risiti inapoweza kuchapishwa (sehemu ya 4.4).
- Ripoti zenye safu za kawaida, safu ya Jumla, michoro, na kuhamisha kwa PDF, Excel na CSV (Sura ya 7).
- Uunganishaji — kisanduku chako cha barua pepe, malango ya SMS na nakala rudufu ya Google Drive (sehemu ya 11.10).
- Kadi za hitilafu zenye urafiki badala ya skrini tupu (Sura ya 15).
- Muhtasari wa haya yote katika Sura ya 16."""}
QUICK={'en':[('Sales','Invoice • Pending Orders • Sales History • Sales Returns • Debits • Customers'),('Purchases','Purchase Orders • Goods Received • Suppliers • Supplier Invoices • Supplier Payments • Supplier Returns'),('Inventory','Products • Current Stock • Current Stock Value • Stock Value History • Price List • Stock Adjustment • Stock Count • Stock Transfer • Import / Export'),('Categories','Product Categories • Price Categories'),('Reports','Sales Reports • Day Report • Purchases Reports • Expenses Reports • Profit Reports • Net Profit Report • Inventory Reports'),('Expenses','Expenses'),('Users','Users • Roles • Permissions'),('Stores','Stores'),('Messaging','Recently Sent • All Contacts • Groups • Templates • Account & Top-up'),('Settings','Configurations • Uploads • Bulk Operations • Integrations • Security • Tools • Notifications • Appearance'),('Subscription','Subscription'),('BizTrack AI','BizTrack AI'),('User Guide','User Guide')]}
def esc(s):
    s=re.sub(r'&(?!amp;|lt;|gt;|#\d+;)', '&amp;', s)
    return s.replace('<m>',f'<font face="{MONO}">').replace('</m>','</font>')
def label_menu(lst):
    return lst
class Heading(Paragraph):
    pass
class Band(Table): pass
class TocLine(Flowable):
    def __init__(s,num,text,page,level): Flowable.__init__(s); s.num,s.text,s.page,s.level=num,text,page,level; s.h=17 if level==0 else 12.8
    def wrap(s,aw,ah): s.aw=aw; return aw,s.h
    def draw(s):
        c=s.canv; lv=s.level
        if lv==0:
            c.setFont('Carlito-Bold',12); c.setFillColor(TEAL); c.drawString(0,3,s.num); c.setFillColor(NAVY); c.drawString(24,3,s.text)
            w=c.stringWidth(s.text,'Carlito-Bold',12)+24; fn,fs=('Carlito-Bold',12)
        else:
            c.setFont('Carlito',9); c.setFillColor(DARK); c.drawString(24,2.5,s.num); c.drawString(50,2.5,s.text)
            w=c.stringWidth(s.text,'Carlito',9)+50; fn,fs=('Carlito',9)
        dw=c.stringWidth('.',fn,fs); end=s.aw-28; n=max(int((end-w-6)/dw),3)
        c.setFillColor(GREY); c.setFont(fn,fs); c.drawString(w+4,2.5 if lv else 3,'.'*n)
        c.setFillColor(NAVY if lv==0 else DARK); c.setFont('Carlito-Bold',12 if lv==0 else 9); c.drawRightString(s.aw,2.5 if lv else 3,str(s.page))
    def split(s,aw,ah): return []
def box(kind,text,lang):
    L=T[lang]; label=L[kind]
    colr={'note':colors.Color(.89,.94,.98),'tip':colors.Color(.89,.97,.93),'warn':colors.Color(.99,.93,.89)}[kind]
    bar={'note':colors.Color(.2,.45,.75),'tip':colors.Color(.1,.6,.35),'warn':colors.Color(.85,.4,.1)}[kind]
    t=Table([[Paragraph(f'<b>{label}</b>',ParagraphStyle('l',parent=CELL,textColor=bar)),Paragraph(esc(text),CELL)]],colWidths=[26*2.8346,None])
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colr),('LINEBEFORE',(0,0),(0,-1),3,bar),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
    return [t,Spacer(1,8)]
def pill(label,text,lang,mono=False):
    st=ParagraphStyle('pl',parent=CELL,fontName='Carlito-Bold',fontSize=8.5,textColor=colors.white)
    tx=ParagraphStyle('pt',parent=CELL,fontName=MONO if mono else 'Carlito-Bold',fontSize=9 if mono else 10,textColor=GREY if mono else NAVY)
    t=Table([[Paragraph(label,st),Paragraph(esc(text) if not mono else text.replace('&','&amp;'),tx)]],colWidths=[62,None],hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(0,0),TEAL if not mono else GREY),('BACKGROUND',(1,0),(1,0),colors.Color(.94,.96,.98)),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3)]))
    return [t,Spacer(1,6)]
def band(num,title,lang,w):
    L=T[lang]
    n=Paragraph(f'<font size="36" color="white"><b>{num}</b></font>',ParagraphStyle('n',fontName='Carlito-Bold',alignment=1,leading=40))
    tt=[Paragraph(f'<font size="10" color="#7FD6D9"><b>{L["chapter"]} {num}</b></font>',ParagraphStyle('s',fontName='Carlito-Bold',leading=13)),Paragraph(f'<font size="22" color="white"><b>{esc(title)}</b></font>',ParagraphStyle('t',fontName='Carlito-Bold',leading=27))]
    b=Band([[n,tt]],colWidths=[62,w-62]); 
    b.setStyle(TableStyle([('BACKGROUND',(0,0),(0,0),TEAL),('BACKGROUND',(1,0),(1,0),NAVY),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),12),('BOTTOMPADDING',(0,0),(-1,-1),12),('LEFTPADDING',(1,0),(1,0),16)]))
    b.is_band=True; b.chap=num; b.title=title; return b
def md_to_flow(md,lang,w,warn):
    md=apply(md,lang,warn)
    out=[]; L=T[lang]; lines=md.split('\n'); i=0; first=True
    while i<len(lines):
        ln=lines[i].rstrip()
        if not ln.strip() or ln=='@@PAGE': i+=1; continue
        if ln.startswith('@@CH '):
            num=ln[5:].strip(); title=lines[i+1][8:].strip(); i+=2
            if not first: out.append(PageBreak())
            first=False
            out.append(band(num,title,lang,w)); out.append(Spacer(1,12)); continue
        if ln.startswith('## '):
            txt=ln[3:].strip(); m=re.match(r'^(\d+\.\d+)\s+(.*)$',txt)
            h=Heading(esc(txt),H2); h.toc=(1,m.group(1),m.group(2)) if m else None; out.append(h); i+=1; continue
        if ln.startswith('PATH: '): out+=pill(L['path'],ln[6:],lang); i+=1; continue
        if ln.startswith('PERM: '): out+=pill(L['perm'],ln[6:],lang,mono=True); i+=1; continue
        if ln.startswith('> '):
            m=re.match(r'^> (NOTE|TIP|WARNING): (.*)$',ln); k={'NOTE':'note','TIP':'tip','WARNING':'warn'}[m.group(1)]
            out+=box(k,m.group(2),lang); i+=1; continue
        if ln.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].startswith('|'):
                cells=[c.strip() for c in lines[i].strip().strip('|').split(' | ')]; rows.append(cells); i+=1
            ncol=max(len(r) for r in rows); rows=[r+['']*(ncol-len(r)) for r in rows]
            data=[[Paragraph(esc(c),CELLH if ri==0 else CELL) for c in r] for ri,r in enumerate(rows)]
            cw=[w*0.34,w*0.66] if ncol==2 else None
            t=Table(data,colWidths=cw,repeatRows=1)
            t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),TEAL),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.Color(.96,.97,.98)]),('GRID',(0,0),(-1,-1),.4,LINE),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6)]))
            out+=[t,Spacer(1,8)]; continue
        m=re.match(r'^(\d+)\. (.*)$',ln)
        if m: out.append(Paragraph(esc(m.group(2)),LI,bulletText=f'{m.group(1)}.')); i+=1; continue
        if ln.startswith('- '): out.append(Paragraph(esc(ln[2:]),LI,bulletText='•')); i+=1; continue
        out.append(Paragraph(esc(ln),BODY)); i+=1
    return out
def ch16_md(lang):
    c=CH16[lang]; num=c['chapter'].split()[0]; title=c['chapter'][len(num):].strip()
    s=f'@@CH {num}\n@@TITLE {title}\n\n'
    for kind,val in c['blocks']:
        if kind=='h2': s+=f'## {val}\n\n'
        elif kind=='p': s+=val+'\n\n'
        elif kind=='ul': s+='\n'.join('- '+x for x in val)+'\n\n'
        elif kind in ('note','tip','warn'): s+=f'> {dict(note="NOTE",tip="TIP",warn="WARNING")[kind]}: {val}\n\n'
        elif kind=='table': s+='\n'.join('| '+' | '.join(r)+' |' for r in val)+'\n\n'
    return s
class Doc(BaseDocTemplate):
    def __init__(s,*a,**k): BaseDocTemplate.__init__(s,*a,**k); s.entries=[]
    def afterFlowable(s,f):
        if getattr(f,'is_band',False): s.entries.append((0,f.chap,f.title,s.page-1))
        elif isinstance(f,Heading) and getattr(f,'toc',None): lv,num,txt=f.toc; s.entries.append((1,num,txt,s.page-1))
def build(lang,out,entries=None):
    L=T[lang]; warn=set()
    fw=W-2*20*2.8346
    cover_state={}
    def draw_cover(cv,doc):
        lw=270; img=ImageReader(LOGO); iw,ih=img.getSize(); lh=lw*ih/iw
        block=lh+16+14+40+118+3+40+16+18   # whole block height
        top=(H+block)/2                    # centred on the page
        y=top-lh; cv.drawImage(img,(W-lw)/2,y,width=lw,height=lh,mask='auto')
        cv.setFillColor(TEAL); cv.setFont('Carlito',11); cv.drawCentredString(W/2,y-16,L['cov_sub'])
        bt=y-16-40; bb=bt-118
        cv.setFillColor(NAVY); cv.rect(57,bb,482,118,stroke=0,fill=1); cv.setFillColor(TEAL); cv.rect(57,bb-3,482,3,stroke=0,fill=1)
        def spaced(yy,text,font,size,sp,col):
            wd=cv.stringWidth(text,font,size)+sp*len(text); t=cv.beginText(); t.setFont(font,size); t.setCharSpace(sp); t.setFillColor(col); t.setTextOrigin(W/2-wd/2,yy); t.textOut(text); t.setCharSpace(0); cv.drawText(t); cv._charSpace=0
        spaced(bt-52,L['cov_title'],'Carlito-Bold',34,3,colors.white)
        spaced(bt-72,L['cov_ver'],'Carlito-Bold',13,2.5,colors.Color(.55,.86,.88))
        cv.setFillColor(colors.Color(.88,.92,.97)); cv.setFont('Carlito-Italic',11); cv.drawCentredString(W/2,bt-96,L['cov_tag'])
        cv.setFillColor(NAVY); cv.setFont('Carlito-Bold',12); cv.drawCentredString(W/2,bb-3-40,L['ed'])
        cv.setFillColor(GREY); cv.setFont('Carlito',10); cv.drawCentredString(W/2,bb-3-40-16,L['cov_prep'])
    def body_page(cv,doc):
        cv.saveState()
        wm=ImageReader(WM); iw,ih=wm.getSize(); ww=400; wh=ww*ih/iw
        cv.drawImage(wm,(W-ww)/2,(H-wh)/2,width=ww,height=wh,mask='auto')
        cv.drawImage(ICON,57,H-48,width=26,height=26*631/878,mask='auto')
        cv.setFont('Carlito-Bold',11); cv.setFillColor(NAVY); cv.drawString(88,H-40,'BizTrack')
        cv.setFont('Carlito',9); cv.setFillColor(GREY); cv.drawRightString(W-57,H-39,L['hdr'])
        cv.setStrokeColor(LINE); cv.setLineWidth(.5); cv.line(57,H-52,W-57,H-52); cv.line(57,40,W-57,40)
        cv.setFont('Carlito',8.5); cv.drawString(57,28,L['ed'])
        cv.setFont('Carlito-Bold',9.5); cv.setFillColor(NAVY); cv.drawRightString(W-57,28,f"{L['page']} {doc.page-1}")
        cv.restoreState()
    doc=Doc(out,pagesize=A4,leftMargin=57,rightMargin=57,topMargin=70,bottomMargin=56,title=('BizTrack User Guide — Version 2' if lang=='en' else 'BizTrack Muongozo wa Mtumiaji — Toleo la 2'),author='BizTrack',subject='Version 2')
    fr=Frame(57,56,W-114,H-126,id='f',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id='cover',frames=[Frame(0,0,W,H,id='c')],onPage=draw_cover),PageTemplate(id='body',frames=[fr],onPage=body_page)])
    S=[NextPageTemplate('body'),PageBreak()]
    # About
    S.append(Paragraph(L['about'],HB)); S+=md_to_flow(ABOUT[lang],lang,fw,warn)
    S.append(PageBreak())
    # Contents
    S.append(Paragraph(L['contents'],HB)); S.append(Spacer(1,6))
    src=open(f'/home/claude/guide/src/v2_{lang}.md',encoding='utf-8').read()
    c16=ch16_md(lang)
    if not entries:
        entries=[]; cur=None
        for chunk in (src,c16):
            ls=chunk.split('\n')
            for k,l in enumerate(ls):
                if l.startswith('@@CH '): entries.append((0,l[5:].strip(),ls[k+1][8:].strip(),'00'))
                m=re.match(r'^## (\d+\.\d+)\s+(.*)$',l.strip())
                if m: entries.append((1,m.group(1),m.group(2),'00'))
    for lv,num,txt,pg in entries: S.append(TocLine(num,txt,pg,lv))
    S.append(PageBreak())
    body=md_to_flow(src,lang,fw,warn)+[PageBreak()]+md_to_flow(c16,lang,fw,warn)
    S+=body
    S+=[PageBreak(),Paragraph(L['quick'],HB),Spacer(1,6)]
    q=[[Paragraph(f'<b>{L["qh"][0]}</b>',CELLH),Paragraph(f'<b>{L["qh"][1]}</b>',CELLH)]]
    for menu,pages in QUICK['en']:
        m=apply(f'[[{menu}]]',lang,warn); ps=' • '.join(apply(f'[[{p.strip()}]]',lang,warn) for p in pages.split(' • '))
        q.append([Paragraph(m,CELL),Paragraph(esc(ps),CELL)])
    t=Table(q,colWidths=[fw*0.24,fw*0.76],repeatRows=1)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),TEAL),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.Color(.96,.97,.98)]),('GRID',(0,0),(-1,-1),.4,LINE),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    S.append(t)
    return doc,S,warn
if __name__=='__main__':
    for lang in ('en','sw'):
        out=f'/home/claude/guide/guide_{lang}.pdf'
        doc,S,warn=build(lang,out); doc.build(S)
        ents=doc.entries
        doc,S,warn=build(lang,out,ents); doc.build(S)
        print(lang,len(ents),'toc entries; unmatched labels:',sorted(warn))
