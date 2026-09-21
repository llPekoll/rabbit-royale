"""Second-row study: source jump poses refined on the user's seven-colour grid."""
from pathlib import Path
from PIL import Image,ImageDraw
import struct as st,zlib,hashlib
ROOT=Path(__file__).parent
OUT=ROOT/'jump-from-user'; OUT.mkdir(exist_ok=True)
ref=Image.open(ROOT/'idle-from-user/user-reference.png').convert('RGBA')
src=Image.open('public/assets/bunnies/Bunny Sprite Sheet - White.png').convert('RGBA')
INK=(47,47,46,255); WHITE=(230,232,234,255); PINK=(247,143,159,255); DEEP=(180,78,96,255); SHADE=(133,132,119,255); BODY=(196,195,184,255); CLEAR=(0,0,0,0)
# Edge-aware integer reconstruction resolves staircase corners at the new grid.
def edge2(im):
 out=Image.new('RGBA',(64,64))
 def at(x,y):
  c=im.getpixel((max(0,min(31,x)),max(0,min(31,y))))
  return c if c[3] else CLEAR
 for y in range(32):
  for x in range(32):
   e,b,d,f,h=at(x,y),at(x,y-1),at(x-1,y),at(x+1,y),at(x,y+1)
   vals=[e]*4
   if b!=h and d!=f: vals=[d if d==b else e,f if b==f else e,d if d==h else e,f if h==f else e]
   for (dx,dy),c in zip([(0,0),(1,0),(0,1),(1,1)],vals): out.putpixel((x*2+dx,y*2+dy),c)
 return out
poses=[ref]
for i in (1,2,3):
 im=edge2(src.crop((i*32,32,i*32+32,64)))
 d=ImageDraw.Draw(im)
 # Refine each ear independently, keeping the source's upright / swept poses.
 if i==1:
  d.polygon([(23,35),(26,35),(28,38),(29,41),(27,43),(25,40),(23,38)],fill=WHITE)
  d.polygon([(25,38),(26,38),(28,41),(28,43),(27,43),(25,40)],fill=PINK)
  d.line([(26,40),(27,42)],fill=DEEP)
  d.polygon([(35,35),(37,35),(39,38),(39,42),(37,43),(36,40),(35,38)],fill=WHITE)
  d.polygon([(37,38),(38,38),(38,43),(37,43)],fill=PINK)
  d.line([(37,41),(37,43)],fill=DEEP)
 elif i==2:
  # Ears flattened by the stretched airborne pose; retain the pink inner folds.
  d.line([(25,38),(28,38)],fill=PINK)
  d.line([(26,39),(29,39)],fill=DEEP)
  d.point((37,38),fill=PINK); d.point((37,39),fill=DEEP)
 elif i==3:
  d.polygon([(23,39),(26,39),(27,42),(29,45),(29,47),(27,46),(25,43),(23,42)],fill=WHITE)
  d.polygon([(25,42),(26,42),(28,45),(28,47),(27,46)],fill=PINK)
  d.line([(26,44),(27,46)],fill=DEEP)
  d.polygon([(35,39),(37,39),(39,42),(39,46),(37,47),(36,44),(35,42)],fill=WHITE)
  d.rectangle((37,42,38,46),fill=PINK);d.line([(37,45),(37,47)],fill=DEEP)
 # Single darker pixel at the lower-left of the nose, matching user's pose.
 nose={1:(38,45),2:(38,43),3:(38,51)}[i]
 if im.getpixel(nose)==PINK: im.putpixel(nose,DEEP)
 poses.append(im)
frames=poses*2
sheet=Image.new('RGBA',(512,64))
for i,f in enumerate(frames):sheet.paste(f,(64*i,0))
sheet.save(OUT/'jump.png')
# Native editable animation, 12 fps as configured for move in the game.
u16=lambda v:st.pack('<H',v)
u32=lambda v:st.pack('<I',v)
def string(v):return u16(len(v.encode()))+v.encode()
def chunk(t,d):return u32(len(d)+6)+u16(t)+d
layer=chunk(0x2004,u16(3)+bytes(10)+bytes([255])+bytes(3)+string('Layer 1'))
tag=chunk(0x2018,u16(1)+bytes(8)+u16(0)+u16(7)+bytes(1)+u16(0)+bytes(6)+bytes([247,143,159])+bytes(1)+string('jump'))
records=[]
for i,f in enumerate(frames):
 cel=chunk(0x2005,u16(0)+bytes(4)+bytes([255])+u16(2)+bytes(7)+u16(64)+u16(64)+zlib.compress(f.tobytes()))
 chunks=([layer,tag] if i==0 else [])+[cel];payload=b''.join(chunks)
 records.append(u32(16+len(payload))+u16(0xF1FA)+u16(len(chunks))+u16(83)+bytes(6)+payload)
body=b''.join(records)
header=u32(128+len(body))+u16(0xA5E0)+u16(8)+u16(64)+u16(64)+u16(32)+u32(1)+u16(83)+bytes(8)+bytes(4)+u16(0)+bytes([1,1])+bytes(8)+bytes(84)
assert len(header)==128
(OUT/'bunny-white-jump.aseprite').write_bytes(header+body)
board=Image.new('RGB',(1056,350),'#4c6971'); d=ImageDraw.Draw(board)
d.text((16,12),'ORIGINAL / SECOND ROW',fill='white')
d.text((16,182),'JUMP STUDY / USER PALETTE AND REST POSE',fill='white')
for i,f in enumerate(frames):
 a=src.crop((32*i,32,32*i+32,64)).resize((128,128),Image.Resampling.NEAREST)
 b=f.resize((128,128),Image.Resampling.NEAREST)
 board.paste(a,(16+128*i,32),a);board.paste(b,(16+128*i,202),b)
board.save(OUT/'poses.png')
previews=[]
for i,f in enumerate(frames):
 canvas=Image.new('RGB',(640,350),'#4c6971'); d=ImageDraw.Draw(canvas)
 d.text((32,20),'ORIGINAL JUMP',fill='white');d.text((352,20),'NEW JUMP',fill='white')
 for x,im in [(32,src.crop((32*i,32,32*i+32,64))),(352,f)]:
  im=im.resize((256,256),Image.Resampling.NEAREST);canvas.paste(im,(x,60),im)
 previews.append(canvas)
for name,duration in [('preview.gif',80),('preview-slow.gif',160)]:
 previews[0].save(OUT/name,save_all=True,append_images=previews[1:],duration=duration,loop=0,disposal=2)
(OUT/'preview.html').write_text('''<!doctype html><meta charset="utf-8"><title>Lapin · jump</title><style>body{background:#4c6971;color:white;font:16px system-ui;margin:40px}main{display:flex;gap:48px}.sprite{width:320px;height:320px;background-size:2560px 320px;background-image:url(jump.png);image-rendering:pixelated;animation:jump .666667s steps(8) infinite}@keyframes jump{to{background-position-x:-2560px}}button{padding:12px;margin:20px 8px 0 0}</style><h1>Jump · deuxième ligne</h1><p>8 poses · 12 images/s · 64 × 64</p><main><div class="sprite" id="bunny"></div></main><button onclick="bunny.style.animationPlayState=bunny.style.animationPlayState==='paused'?'running':'paused'">Pause / lecture</button><button onclick="bunny.style.animationDuration=bunny.style.animationDuration==='1.33333s'?'.666667s':'1.33333s'">Ralentir ×2</button><p><a href="preview.gif">Comparatif animé avec l’original</a></p>''')
# Combined rows make the idle-to-jump relationship easy to inspect.
combined=Image.new('RGBA',(512,128));combined.paste(Image.open(ROOT/'idle-from-user/idle.png'),(0,0));combined.paste(sheet,(0,64));combined.save(OUT/'idle-and-jump.png')
assert frames[0].tobytes()==ref.tobytes()
assert all(set(f.getdata())<=set(ref.getdata())|{CLEAR} for f in frames)
assert all(set(f.getchannel('A').getdata())<={0,255} for f in frames)
raw=(OUT/'bunny-white-jump.aseprite').read_bytes(); pos=128
for f in frames:
 size,magic,n,dur=st.unpack_from('<IHHH',raw,pos); assert magic==0xF1FA and dur==83
 cp=pos+16
 for _ in range(n):
  cs,ct=st.unpack_from('<IH',raw,cp)
  if ct==0x2005: assert zlib.decompress(raw[cp+26:cp+cs])==f.tobytes()
  cp+=cs
 assert cp==pos+size; pos+=size
assert pos==len(raw)
print('Verified 8 native cels, original palette, binary alpha, user rest pose unchanged.')
