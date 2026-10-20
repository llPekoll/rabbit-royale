-- From the repository root:
-- /Applications/Aseprite.app/Contents/MacOS/aseprite -b --script art-source/bunny-octobre-rose-20261018/create.lua
-- All artwork, layers, animation and previews are drawn/exported by Aseprite.
local root = app.fs.currentPath
local out = root .. "/art-source/bunny-octobre-rose-20261018/"
local rgba = app.pixelColor.rgba
local pc = app.pixelColor
local colors = {
  ink = rgba(65, 35, 53, 255),
  fur = rgba(233, 169, 193, 255),
  blush = rgba(255, 211, 228, 255),
  shade = rgba(183, 104, 145, 255),
  cream = rgba(255, 243, 247, 255),
  ear = rgba(229, 79, 145, 255),
  ribbon = rgba(210, 35, 111, 255),
  fold = rgba(157, 28, 85, 255),
  satin = rgba(255, 117, 172, 255),
}
local source = {
  ink = rgba(47, 47, 46, 255),
  fur = rgba(196, 195, 184, 255),
  light = rgba(230, 232, 234, 255),
  pink = rgba(247, 143, 159, 255),
  shade = rgba(133, 132, 119, 255),
  white = rgba(241, 240, 253, 255),
}
local replace = {
  [source.ink] = colors.ink,
  [source.fur] = colors.fur,
  [source.light] = colors.blush,
  [source.pink] = colors.ear,
  [source.shade] = colors.shade,
  [source.white] = colors.cream,
}
local sheet = Sprite{fromFile=root .. "/godot/assets/bunnies/bunny-white.png"}
app.command.ChangePixelFormat{ui=false, format="rgb"}
assert(sheet.width == 256 and sheet.height == 256 and sheet.colorMode == ColorMode.RGB)
local original = Image(sheet)
local fur = Image(256, 256, ColorMode.RGB)
local tips = Image(256, 256, ColorMode.RGB)
local ribbon = Image(256, 256, ColorMode.RGB)
for p in original:pixels() do
  if replace[p()] then fur:drawPixel(p.x, p.y, replace[p()]) end
  -- The pale paws and tail retain the source's lighting and front/back order.
  if p() == source.light and p.y % 32 >= 28 then
    tips:drawPixel(p.x, p.y, colors.cream)
  end
end

-- A loop with an open centre, a shaded crossover and two separate tails.
-- The smaller pattern is redrawn for the crouched poses, not resampled.
local patterns = {
  full = {".HH.", "R..R", ".DR.", ".RD.", "R..R", "R..R"},
  small = {".H.", "R.R", ".D.", "R.R", "R.R"},
  short = {".H.", "R.R", ".D.", "R.R"},
}
local paint = {H=colors.satin, R=colors.ribbon, D=colors.fold}
-- Zero-based atlas slots. Positions follow the torso, not the bounding box.
local poses = {
  [0]={12,24,"full"}, {12,24,"full"}, {13,23,"full"}, {12,24,"full"},
  {12,24,"full"}, {11,25,"small"}, {10,26,"small"}, {11,25,"small"},
  {12,24,"full"}, {12,23,"short"}, {13,23,"short"}, {11,24,"short"},
  {12,24,"full"}, {12,23,"short"}, {13,23,"short"}, {11,24,"short"},
}
for i=16,31 do poses[i]={11,25,"small"} end
for i=32,39 do poses[i]={11,25,"short"} end
poses[34]={10,25,"short"}
poses[35]={10,25,"short"}
poses[36]={10,25,"short"}
poses[40]={11,25,"small"}
poses[41]={11,26,"short"}
poses[42]={12,22,"small"}
poses[43]={12,21,"small"}
poses[44]={12,22,"small"}
poses[45]={11,26,"short"}
poses[46]={11,25,"small"}
poses[47]={11,25,"small"}
poses[48]={12,24,"full"}
poses[49]={15,21,"small"}
poses[50]={15,22,"small"}
poses[51]={11,25,"small"}
poses[52]={11,25,"small"}
poses[56]={12,24,"full"}
poses[57]={14,22,"small"}
poses[58]={14,25,"short",1}
poses[59]={15,27,"short",1}
poses[60]={15,27,"short",1}
poses[61]={15,27,"short",1}

local ribbonCounts = {}
for index=0,63 do
  local pose = poses[index]
  local count = 0
  if pose then
    local ox,oy=(index%8)*32,math.floor(index/8)*32
    local pattern=patterns[pose[3]]
    for y,row in ipairs(pattern) do
      for x=1,#row do
        local color=paint[row:sub(x,x)]
        if color then
          local px,py=x-1,y-1
          if pose[4] then px,py=#pattern-y,x-1 end
          px,py=ox+pose[1]+px,oy+pose[2]+py
          -- Original paws, outlines, muzzle and empty cells occlude the badge.
          if original:getPixel(px,py) == source.fur then
            ribbon:drawPixel(px,py,color)
            count=count+1
          end
        end
      end
    end
  end
  ribbonCounts[index]=count
  if pose then assert(count >= 5,"Ribbon lost in frame " .. index) end
end

local layerNames={"Source - lapin blanc (verrouille)","Pelage - rose poudre",
  "Pattes et queue - creme", "Ruban rose - pose par pose"}
local images={original,fur,tips,ribbon}
sheet.layers[1].name=layerNames[1]
sheet.layers[1].isEditable=false
for i=2,4 do
  local layer=sheet:newLayer()
  layer.name=layerNames[i]
  sheet:newCel(layer,1,images[i],Point(0,0))
end
local function setPalette(sprite)
  local palette=Palette(10)
  palette:setColor(0,Color{r=0,g=0,b=0,a=0})
  for i,key in ipairs({"ink","shade","fur","blush","cream","ear","fold","ribbon","satin"}) do
    local c=colors[key]
    palette:setColor(i,Color{r=pc.rgbaR(c),g=pc.rgbaG(c),b=pc.rgbaB(c),a=255})
  end
  sprite:setPalette(palette)
end
sheet.gridBounds=Rectangle(0,0,32,32)
sheet.data="Octobre rose - sensibilisation au cancer du sein. Pelage rose poudre, pattes creme et ruban rose. Atlas 8x8, 32x32 par case. Source et alpha d'origine preserves."
setPalette(sheet)
sheet:saveAs(out .. "bunny-octobre-rose-sheet.aseprite")
local composite=Image(sheet)
composite:saveAs(out .. "bunny-octobre-rose.png")
for p in original:pixels() do
  assert(pc.rgbaA(p())==pc.rgbaA(composite:getPixel(p.x,p.y)),"Alpha changed")
end

local animation=Sprite(32,32,ColorMode.RGB)
local layers={animation.layers[1]}
for i=2,4 do layers[i]=animation:newLayer() end
for i,layer in ipairs(layers) do layer.name=layerNames[i] end
for index=0,63 do
  local frame=index+1
  if index>0 then animation:newEmptyFrame(frame) end
  animation.frames[frame].duration=0.125
  local rect=Rectangle((index%8)*32,math.floor(index/8)*32,32,32)
  for i,layer in ipairs(layers) do
    animation:newCel(layer,frame,Image(images[i],rect),Point(0,0))
  end
end
layers[1].isEditable=false
local tags={
  {"idle",0,7,8}, {"move",8,15,12}, {"eat",16,23,8},
  {"sleep",32,39,4}, {"happy",40,47,10},
  {"damage",48,52,12}, {"death",56,61,8},
}
for _,def in ipairs(tags) do
  local tag=animation:newTag(def[2]+1,def[3]+1)
  tag.name=def[1]
  tag.color=Color{r=229,g=79,b=145,a=255}
  for index=def[2],def[3] do
    animation.frames[index+1].duration=math.floor(1000/def[4]+0.5)/1000
  end
end
animation.data=sheet.data .. " Cadences HomeRabbit.ANIMS; damage 48..52 suivant IslandRabbit.LAST_PAINTED."
setPalette(animation)
app.activeSprite=animation
app.activeFrame=animation.frames[1]
animation:saveAs(out .. "bunny-octobre-rose-animation.aseprite")

-- Pixel-perfect preview: one source pixel always becomes a square of pixels.
local preview=Sprite(40,32,ColorMode.RGB)
local previewImage=Image(40,32,ColorMode.RGB)
previewImage:clear(rgba(255,241,247,255))
previewImage:drawImage(Image(composite,Rectangle(0,0,32,32)),Point(5,-9))
preview:newCel(preview.layers[1],1,previewImage,Point(0,0))
app.activeSprite=preview
app.command.SpriteSize{ui=false,width=640,height=512,method="nearest"}
preview:saveAs(out .. "bunny-octobre-rose-preview.png")
preview:close()

local contact=Sprite(256,256,ColorMode.RGB)
local contactImage=Image(256,256,ColorMode.RGB)
contactImage:clear(rgba(255,241,247,255))
contactImage:drawImage(composite,Point(0,0))
contact:newCel(contact.layers[1],1,contactImage,Point(0,0))
app.activeSprite=contact
app.command.SpriteSize{ui=false,width=1024,height=1024,method="nearest"}
contact:saveAs(out .. "bunny-octobre-rose-poses.png")
contact:close()
app.activeSprite=animation
print("Octobre rose: 256x256; 64 cases de 32x32; 7 tags; 4 calques; alpha identique sur les 65536 pixels.")
for _,def in ipairs(tags) do
  local minimum=100
  for i=def[2],def[3] do minimum=math.min(minimum,ribbonCounts[i]) end
  print(def[1] .. ": ruban visible, minimum " .. minimum .. " pixels par pose")
end
