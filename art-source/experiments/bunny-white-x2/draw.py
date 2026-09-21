from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import json
OUT=Path(__file__).parent
SRC=Path('public/assets/bunnies/Bunny Sprite Sheet - White.png')
source=Image.open(SRC).convert('RGBA')
C={'ink':'#303443','deep':'#737887','shade':'#a8acb0','mid':'#d3d3c8','light':'#f0eedc','shine':'#fff9e8','pink':'#dc8c9a','pinklight':'#f6b8b1','nose':'#b96980'}
frames=[]
for i,dy in enumerate([0,-2,-4,-2,0,2,4,2]):
 im=Image.new('RGBA',(64,64)); d=ImageDraw.Draw(im)
 def p(points,c): d.polygon(points,fill=C.get(c,c))
 def r(box,c): d.rectangle(box,fill=C.get(c,c))
 # Fixed feet anchor. The original eight-pose breath drives head and shoulders.
 s=max(0,dy//2); h=dy
 # Round tail behind haunch.
 p([(17,54),(21,52),(24,54),(24,60),(21,62),(17,61),(15,58)],'ink')
 p([(17,55),(21,54),(23,56),(22,59),(18,60),(16,58)],'mid')
 r((17,55,19,57),'shine')
 # Body, shaded on lower/right edges.
 p([(25,47+h//2),(35+s,46+h//2),(40+s,49+h//2),(43+s,54),(43+s,61),(40+s,63),(22,63),(20,61),(20,56),(22,51+h//2)],'ink')
 p([(25,49+h//2),(35+s,48+h//2),(39+s,51),(41+s,55),(41+s,60),(38,61),(23,61),(22,58),(23,53)],'shade')
 p([(25,49+h//2),(33,48+h//2),(37,51),(37,57),(33,60),(23,60),(22,57)],'mid')
 p([(25,50+h//2),(30,49+h//2),(32,52),(30,56),(24,56),(23,54)],'light')
 # Two ears with asymmetrical silhouette and single-pixel rim light.
 p([(25,45+h),(23,40+h),(23,36+h),(24,35+h),(28,35+h),(30,38+h),(30,44+h)],'ink')
 p([(25,42+h),(24,38+h),(25,36+h),(27,36+h),(29,40+h),(29,44+h)],'light')
 p([(26,38+h),(27,38+h),(28,41+h),(28,44+h),(26,43+h)],'pink')
 r((26,38+h,26,40+h),'pinklight')
 p([(33,44+h),(33,38+h),(35,35+h),(39,35+h),(40,37+h),(39,42+h),(38,46+h)],'ink')
 p([(35,44+h),(35,39+h),(36,36+h),(38,36+h),(38,41+h),(37,45+h)],'light')
 p([(36,39+h),(37,38+h),(37,42+h),(36,44+h)],'pink')
 # Cheeks and muzzle, turned slightly right like source.
 p([(25,43+h),(28,42+h),(35,42+h),(39,44+h),(40,47+h),(43+s,48+h),(44+s,51+h),(42+s,54+h),(37,56+h),(29,55+h),(24,52+h),(23,48+h)],'ink')
 p([(26,44+h),(30,43+h),(35,43+h),(38,45+h),(39,48+h),(42+s,49+h),(42+s,52+h),(37,54+h),(29,53+h),(25,51+h),(24,48+h)],'mid')
 p([(26,44+h),(30,43+h),(34,43+h),(37,45+h),(37,49+h),(34,51+h),(28,51+h),(25,49+h)],'light')
 r((27,44+h,30,44+h),'shine')
 # Eye sockets, tiny eye catchlight, softly lit muzzle.
 r((32,46+h,34,48+h),'ink'); r((32,46+h,32,46+h),'shine')
 p([(38,49+h),(41+s,49+h),(42+s,50+h),(41+s,52+h),(37,52+h),(36,51+h)],'shine')
 r((40+s,49+h,42+s,49+h),'nose'); r((40+s,50+h,41+s,50+h),'pink')
 r((37,53+h,39,53+h),'shade')
 r((28,50+h,29,50+h),'pinklight')
 # Front paw and haunch feet stay planted across every frame.
 p([(37+s,55+h//3),(40+s,55+h//3),(41+s,61),(39+s,62),(36+s,62),(36+s,60)],'deep')
 p([(37+s,55+h//3),(39+s,55+h//3),(39+s,60),(40+s,61),(37+s,61)],'light')
 p([(25,59),(28,58),(31,59),(32,61),(31,62),(23,62),(23,61)],'light')
 r((24,60,27,60),'shine'); r((29,62,31,62),'shade')
 frames.append(im)
sheet=Image.new('RGBA',(512,64))
for i,f in enumerate(frames): sheet.paste(f,(i*64,0))
sheet.save(OUT/'idle-redrawn-x2.png')
source.resize((512,512),Image.Resampling.NEAREST).save(OUT/'original-sheet-x2.png')
# Comparison sheet on opaque background for easy viewing.
board=Image.new('RGB',(1080,510),'#202633'); d=ImageDraw.Draw(board)
d.text((24,20),'WHITE BUNNY / IDLE STUDY 01',fill='#fff1d5')
d.text((24,50),'ORIGINAL x2                         REDRAW x2',fill='#b6c1d0')
orig=source.crop((0,0,32,32)).resize((64,64),Image.Resampling.NEAREST)
for x,im in [(50,orig),(360,frames[0])]:
 enlarged=im.resize((256,256),Image.Resampling.NEAREST); board.paste(enlarged,(x,30),enlarged)
d.text((24,310),'8 FRAMES / 8 FPS / 64 x 64 / NEAREST NEIGHBOR',fill='#b6c1d0')
for i,f in enumerate(frames):
 big=f.resize((128,128),Image.Resampling.NEAREST); board.paste(big,(24+i*128,335),big)
board.save(OUT/'comparison.png')
anim=[]
for i,f in enumerate(frames):
 canvas=Image.new('RGB',(640,320),'#202633'); dd=ImageDraw.Draw(canvas)
 dd.text((30,18),'ORIGINAL x2',fill='#fff1d5'); dd.text((350,18),'REDRAW x2',fill='#fff1d5')
 a=source.crop((i*32,0,(i+1)*32,32)).resize((256,256),Image.Resampling.NEAREST)
 b=f.resize((256,256),Image.Resampling.NEAREST)
 canvas.paste(a,(24,30),a); canvas.paste(b,(344,30),b); anim.append(canvas)
anim[0].save(OUT/'comparison-animated.gif',save_all=True,append_images=anim[1:],duration=125,loop=0,disposal=2)
(OUT/'idle.json').write_text(json.dumps({'cell':[64,64],'frames':8,'fps':8,'loop':True,'source':str(SRC),'note':'Hand-defined pixel polygons. Idle study only; original assets untouched.'},indent=2)+'\n')
# Native Aseprite file: one editable pixel layer, eight compressed cels, 125 ms each.
import struct as st, zlib
u16=lambda n: st.pack('<H',n)
u32=lambda n: st.pack('<I',n)
string=lambda s:u16(len(s.encode()))+s.encode()
def chunk(kind,data): return u32(len(data)+6)+u16(kind)+data
layer=chunk(0x2004,u16(1)+u16(0)+u16(0)+u16(0)+u16(0)+u16(0)+bytes([255])+bytes(3)+string('White bunny - redraw'))
records=[]
for i,im in enumerate(frames):
 cel=chunk(0x2005,u16(0)+st.pack('<hh',0,0)+bytes([255])+u16(2)+st.pack('<h',0)+bytes(5)+u16(64)+u16(64)+zlib.compress(im.tobytes()))
 chunks=([layer] if i==0 else [])+[cel]
 payload=b''.join(chunks)
 records.append(u32(16+len(payload))+u16(0xF1FA)+u16(len(chunks))+u16(125)+bytes(2)+u32(0)+payload)
body=b''.join(records)
header=u32(128+len(body))+u16(0xA5E0)+u16(8)+u16(64)+u16(64)+u16(32)+u32(1)+u16(125)+bytes(8)+bytes([0])+bytes(3)+u16(0)+bytes([1,1])+st.pack('<hhHH',0,0,0,0)+bytes(84)
assert len(header)==128
(OUT/'bunny-white-idle-x2.aseprite').write_bytes(header+body)
(OUT/'preview.html').write_text('''<!doctype html><meta charset="utf-8"><title>Bunny idle — étude 01</title><style>body{margin:40px;background:#202633;color:#f0eedc;font:16px system-ui}section{display:flex;gap:40px}.sprite{width:256px;height:256px;background-size:2048px 256px;image-rendering:pixelated;animation:idle 1s steps(8) infinite}.old{background-image:url(original-sheet-x2.png);background-size:2048px 2048px}.new{background-image:url(idle-redrawn-x2.png)}@keyframes idle{to{background-position-x:-2048px}}button{padding:10px;margin-top:20px}body.paused .sprite{animation-play-state:paused}</style><h1>Lapin blanc · première passe</h1><p>8 poses · 8 images/s · cellules 64 × 64 · affichage ×4 sans lissage</p><section><article><h2>Original doublé</h2><div class="sprite old"></div></article><article><h2>Redessiné</h2><div class="sprite new"></div></article></section><button onclick="document.body.classList.toggle('paused')">Pause / lecture</button><p>Contours bleu ardoise, fourrure crème, ombres froides. Essai sur l’idle uniquement.</p>''')
# Verify the exported animation structure and lossless transparency.
assert sheet.size==(512,64)
assert all(set(f.getchannel('A').getdata()) <= {0,255} for f in frames)
assert Image.open(OUT/'comparison-animated.gif').n_frames==8
pos=128
raw=(OUT/'bunny-white-idle-x2.aseprite').read_bytes()
for expected in frames:
 size,magic,count,duration=st.unpack_from('<IHHH',raw,pos)
 assert magic==0xF1FA and duration==125
 cp=pos+16
 for _ in range(count):
  cs,ct=st.unpack_from('<IH',raw,cp)
  if ct==0x2005: assert zlib.decompress(raw[cp+26:cp+cs])==expected.tobytes()
  cp+=cs
 assert cp==pos+size
 pos+=size
assert pos==len(raw)
print('Verified: 8 frames, 125 ms, binary alpha, native Aseprite cels round-trip.')
