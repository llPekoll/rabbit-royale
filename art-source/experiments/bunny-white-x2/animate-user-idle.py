"""Animate the user's Layer 1 without repainting its palette or facial features."""
from pathlib import Path
from PIL import Image, ImageDraw
import struct as st
import zlib, hashlib

ROOT=Path(__file__).parent
OUT=ROOT/'idle-from-user'
OUT.mkdir(exist_ok=True)
source=ROOT/'bunny-white-idle-x2.aseprite'
raw=source.read_bytes()
source_hash=hashlib.sha256(raw).hexdigest()
w,h=st.unpack_from('<HH',raw,8)
assert (w,h)==(64,64)
count=st.unpack_from('<H',raw,134)[0]
pos=144
reference=None
for _ in range(count):
 size,kind=st.unpack_from('<IH',raw,pos)
 data=raw[pos+6:pos+size]
 if kind==0x2005:
  layer,x,y,opacity,encoding=st.unpack_from('<HhhBH',data)
  if layer==1:
   assert encoding==2 and opacity==255
   cw,ch=st.unpack_from('<HH',data,16)
   reference=Image.new('RGBA',(64,64))
   reference.paste(Image.frombytes('RGBA',(cw,ch),zlib.decompress(data[20:])),(x,y))
 pos+=size
assert reference is not None
reference.save(OUT/'user-reference.png')
frames=[]
# Rigid head/ears/face translation; breathing is absorbed in the torso.
# Feet, floor outline and tail stay on the exact pixels of the reference.
for offset in [0,-1,-2,-1,0,1,2,1]:
 frame=Image.new('RGBA',(64,64))
 for y in range(64):
  if y<=53+offset: sy=y-offset
  elif y<61: sy=54+((y-(54+offset))*7)//(7-offset)
  else: sy=y
  for x in range(64):
   fixed_tail=(x<=20 and y>=56)
   pixel=reference.getpixel((x,y if fixed_tail else sy)) if fixed_tail or 0<=sy<64 else (0,0,0,0)
   frame.putpixel((x,y),pixel)
 frames.append(frame)
assert frames[0].tobytes()==reference.tobytes()
sheet=Image.new('RGBA',(512,64))
for i,f in enumerate(frames): sheet.paste(f,(i*64,0))
sheet.save(OUT/'idle.png')
# Aseprite, one editable layer, one idle tag, lossless cels.
u16=lambda n:st.pack('<H',n)
u32=lambda n:st.pack('<I',n)
def string(t): return u16(len(t.encode()))+t.encode()
def chunk(t,b): return u32(len(b)+6)+u16(t)+b
layer=chunk(0x2004,u16(3)+bytes(10)+bytes([255])+bytes(3)+string('Layer 1'))
tag=chunk(0x2018,u16(1)+bytes(8)+u16(0)+u16(7)+bytes([0])+u16(0)+bytes(6)+bytes([247,143,159])+bytes(1)+string('idle'))
records=[]
for i,f in enumerate(frames):
 cel=chunk(0x2005,u16(0)+st.pack('<hh',0,0)+bytes([255])+u16(2)+bytes(7)+u16(64)+u16(64)+zlib.compress(f.tobytes()))
 chunks=([layer,tag] if i==0 else [])+[cel]
 data=b''.join(chunks)
 records.append(u32(len(data)+16)+u16(0xF1FA)+u16(len(chunks))+u16(125)+bytes(6)+data)
body=b''.join(records)
header=u32(128+len(body))+u16(0xA5E0)+u16(8)+u16(64)+u16(64)+u16(32)+u32(1)+u16(125)+bytes(8)+bytes(1)+bytes(3)+u16(0)+bytes([1,1])+bytes(8)+bytes(84)
(OUT/'bunny-white-idle.aseprite').write_bytes(header+body)
# Contact sheet and synchronized fixed-reference / animated comparison.
bg='#4c6971'
board=Image.new('RGB',(1056,180),bg)
d=ImageDraw.Draw(board); d.text((16,10),'IDLE / 8 FRAMES / 8 FPS — YOUR DRAWING, SUBTLE BREATH',fill='white')
for i,f in enumerate(frames):
 big=f.resize((128,128),Image.Resampling.NEAREST); board.paste(big,(16+i*128,30),big)
board.save(OUT/'poses.png')
previews=[]
for f in frames:
 canvas=Image.new('RGB',(640,360),bg); d=ImageDraw.Draw(canvas)
 d.text((32,22),'YOUR FRAME / UNCHANGED',fill='white'); d.text((352,22),'IDLE / 8 FPS',fill='white')
 for x,im in [(32,reference),(352,f)]:
  zoom=im.resize((256,256),Image.Resampling.NEAREST); canvas.paste(zoom,(x,60),zoom)
 previews.append(canvas)
previews[0].save(OUT/'preview.gif',save_all=True,append_images=previews[1:],duration=125,loop=0,disposal=2)
(OUT/'preview.html').write_text('''<!doctype html><meta charset="utf-8"><title>Idle du lapin</title><style>body{background:#4c6971;color:white;font:16px system-ui;margin:40px}main{display:flex;gap:64px}.sprite{width:320px;height:320px;image-rendering:pixelated;background-image:url(idle.png);background-size:2560px 320px}.animated{animation:idle 1s steps(8) infinite}@keyframes idle{to{background-position-x:-2560px}}button{padding:10px;margin:20px 8px 0 0}</style><h1>Ton dessin · idle</h1><p>8 poses à 8 images/s. Première pose conservée pixel pour pixel.</p><main><section><h2>Ta pose</h2><div class="sprite"></div></section><section><h2>Animation</h2><div class="sprite animated" id="bunny"></div></section></main><button onclick="bunny.style.animationPlayState=bunny.style.animationPlayState==='paused'?'running':'paused'">Pause / lecture</button>''')
(OUT/'README.md').write_text('''# Idle depuis le dessin utilisateur\n\nSource : `../bunny-white-idle-x2.aseprite`, première frame du `Layer 1`.\nLa première pose est conservée pixel pour pixel. 8 frames, 125 ms chacune.\nRespiration verticale de 2 pixels maximum ; visage et oreilles déplacés ensemble sans redessin. Pieds et queue fixes. Palette originale conservée.\n\n`bunny-white-idle.aseprite` : animation éditable.\n`idle.png` : spritesheet 512 × 64.\n`preview.html` / `preview.gif` : comparaison avec la pose de référence.\n''')
# Validate every native cel and its duration, palette, anchors and source preservation.
result=(OUT/'bunny-white-idle.aseprite').read_bytes(); pos=128
palette=set(reference.getdata())
for f in frames:
 size,magic,n,duration=st.unpack_from('<IHHH',result,pos)
 assert magic==0xF1FA and duration==125
 cp=pos+16
 for _ in range(n):
  cs,ct=st.unpack_from('<IH',result,cp)
  if ct==0x2005: assert zlib.decompress(result[cp+26:cp+cs])==f.tobytes()
  cp+=cs
 assert cp==pos+size
 assert set(f.getdata())<=palette|{(0,0,0,0)}
 assert f.crop((0,61,64,64)).tobytes()==reference.crop((0,61,64,64)).tobytes()
 pos+=size
assert pos==len(result)
assert hashlib.sha256(source.read_bytes()).hexdigest()==source_hash
assert Image.open(OUT/'preview.gif').n_frames==8
print('Verified: unchanged source and first pose; 8 lossless Aseprite cels; 125 ms; original palette; fixed feet.')
