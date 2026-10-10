-- Run from the repository root:
-- /Applications/Aseprite.app/Contents/MacOS/aseprite -b --script art-source/bunny-solflare-20261010/create.lua
-- Drawn with Aseprite's native image API. No resampling of the game sprite.
local root = app.fs.currentPath
local out = root .. "/art-source/bunny-solflare-20261010/"
local rgba = app.pixelColor.rgba
local colors = {
  outline = rgba(2, 5, 10, 255),       -- Solflare's official icon: #02050A
  fur = rgba(37, 40, 46, 255),
  yellow = rgba(255, 239, 70, 255),    -- Solflare's official icon: #FFEF46
  gold = rgba(211, 187, 36, 255),
  shade = rgba(149, 129, 27, 255),
  light = rgba(255, 252, 206, 255),
}
local originalColors = {
  outline = rgba(47, 47, 46, 255),
  fur = rgba(196, 195, 184, 255),
  highlight = rgba(230, 232, 234, 255),
  pink = rgba(247, 143, 159, 255),
  shadow = rgba(133, 132, 119, 255),
  light = rgba(241, 240, 253, 255),
}
local darkMap = {
  [originalColors.outline] = colors.outline,
  [originalColors.fur] = colors.fur,
}
local accentMap = {
  [originalColors.highlight] = colors.yellow,
  [originalColors.pink] = colors.gold,
  [originalColors.shadow] = colors.shade,
  [originalColors.light] = colors.light,
}
local sheet = Sprite{fromFile=root .. "/godot/assets/bunnies/bunny-white.png"}
app.command.ChangePixelFormat{ui=false, format="rgb"}
assert(sheet.width == 256 and sheet.height == 256 and sheet.colorMode == ColorMode.RGB)
local original = Image(sheet)
local dark = Image(256, 256, ColorMode.RGB)
local accents = Image(256, 256, ColorMode.RGB)
local changed = 0
for p in original:pixels() do
  local replacement = darkMap[p()]
  if replacement then dark:drawPixel(p.x, p.y, replacement) end
  replacement = accentMap[p()]
  if replacement then accents:drawPixel(p.x, p.y, replacement) end
  if darkMap[p()] or accentMap[p()] then changed = changed + 1 end
end
local function paletteFor(sprite)
  local palette = Palette(7)
  palette:setColor(0, Color{r=0,g=0,b=0,a=0})
  for i, key in ipairs({"outline", "fur", "shade", "gold", "yellow", "light"}) do
    local c = colors[key]
    palette:setColor(i, Color{r=app.pixelColor.rgbaR(c),g=app.pixelColor.rgbaG(c),b=app.pixelColor.rgbaB(c),a=255})
  end
  sprite:setPalette(palette)
end
sheet.layers[1].name = "Source - bunny blanc"
sheet.layers[1].isEditable = false
local furLayer = sheet:newLayer()
furLayer.name = "Solflare - pelage noir"
sheet:newCel(furLayer, 1, dark, Point(0, 0))
local accentLayer = sheet:newLayer()
accentLayer.name = "Solflare - jaune solaire"
sheet:newCel(accentLayer, 1, accents, Point(0, 0))
sheet.gridBounds = Rectangle(0, 0, 32, 32)
sheet.data = "Bunny Solflare. Jaune #FFEF46 et noir #02050A du logo officiel. Grille 8x8 de 32x32, silhouette et alpha d'origine preserves."
paletteFor(sheet)
sheet:saveAs(out .. "bunny-solflare-sheet.aseprite")
local composite = Image(sheet)
composite:saveAs(out .. "bunny-solflare.png")
-- Verify every pixel against the source silhouette before exporting animation.
for p in original:pixels() do
  assert(app.pixelColor.rgbaA(p()) == app.pixelColor.rgbaA(composite:getPixel(p.x,p.y)), "Alpha changed")
end

local animation = Sprite(32, 32, ColorMode.RGB)
local base = animation.layers[1]
base.name = "Source - bunny blanc"
local fur = animation:newLayer()
fur.name = furLayer.name
local accent = animation:newLayer()
accent.name = accentLayer.name
for index=0,63 do
  local frame = index + 1
  if index > 0 then animation:newEmptyFrame(frame) end
  animation.frames[frame].duration = 0.125
  local rect = Rectangle((index % 8)*32, math.floor(index/8)*32, 32, 32)
  animation:newCel(base, frame, Image(original,rect), Point(0,0))
  animation:newCel(fur, frame, Image(dark,rect), Point(0,0))
  animation:newCel(accent, frame, Image(accents,rect), Point(0,0))
end
base.isEditable = false
local tags = {
  {"idle",0,7,8}, {"move",8,15,12}, {"eat",16,23,8},
  {"sleep",32,39,4}, {"happy",40,47,10},
  {"damage",48,52,12}, {"death",56,61,8},
}
for _, def in ipairs(tags) do
  local tag = animation:newTag(def[2]+1,def[3]+1)
  tag.name = def[1]
  tag.color = Color{r=255,g=239,b=70,a=255}
  for index=def[2],def[3] do
    animation.frames[index+1].duration = math.floor(1000/def[4]+0.5)/1000
  end
end
paletteFor(animation)
animation.data = sheet.data .. " Cadences HomeRabbit.ANIMS; damage borne a IslandRabbit.LAST_PAINTED (52)."
animation:saveAs(out .. "bunny-solflare-animation.aseprite")

-- A neutral preview background makes the black contour readable.
-- The actual spritesheet export above keeps its original transparency.
local preview = Sprite(40,32,ColorMode.RGB)
preview.layers[1].name = "Bunny Solflare - apercu"
local previewImage = Image(40,32,ColorMode.RGB)
previewImage:clear(rgba(78,89,97,255))
local pose = Image(composite,Rectangle(0,0,32,32))
previewImage:drawImage(pose,Point(6,-9))
preview:newCel(preview.layers[1],1,previewImage,Point(0,0))
app.activeSprite = preview
app.command.SpriteSize{ui=false,width=640,height=512,method="nearest"}
preview:saveAs(out .. "bunny-solflare-preview.png")
preview:close()
app.activeSprite = animation
print("Solflare: " .. changed .. " pixels recolores. Alpha identique sur 65536 pixels; 64 frames, 7 tags, 3 calques.")
