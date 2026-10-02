-- Run from the repository root with Aseprite --batch --script <this file>.
-- Fur recoloring and white spots only: no resampling, trimming, or packing.
local root = app.fs.currentPath
local out = root .. "/art-source/bunny-noir-violet-20261002/"
local source = root .. "/godot/assets/bunnies/bunny-white.png"
local exported = root .. "/godot/assets/bunnies/bunny-noir-violet.png"
local rgba = app.pixelColor.rgba
local replacements = {
  [rgba(241, 240, 253, 255)] = rgba(255, 255, 255, 255),
  [rgba(47, 47, 46, 255)] = rgba(12, 12, 15, 255),
  [rgba(196, 195, 184, 255)] = rgba(33, 31, 40, 255),
  [rgba(230, 232, 234, 255)] = rgba(48, 45, 59, 255),
  [rgba(247, 143, 159, 255)] = rgba(154, 112, 255, 255),
  [rgba(133, 132, 119, 255)] = rgba(24, 22, 30, 255),
}

local sheet = Sprite{fromFile=source}
assert(sheet.width == 256 and sheet.height == 256)
app.command.ChangePixelFormat{ui=false, format="rgb"}
assert(sheet.colorMode == ColorMode.RGB)
local original = Image(sheet)
local overlay = Image(256, 256, ColorMode.RGB)
local changed = 0
for pixel in original:pixels() do
  local replacement = replacements[pixel()]
  if replacement then
    overlay:drawPixel(pixel.x, pixel.y, replacement)
    changed = changed + 1
  end
end
-- One small white patch follows the body (mid-tone fur), not the ears.
-- All marks stay inside existing fur pixels: contours and alpha never change.
local spotColors = {
  [rgba(196, 195, 184, 255)] = rgba(227, 221, 239, 255),
  [rgba(230, 232, 234, 255)] = rgba(255, 255, 255, 255),
  [rgba(133, 132, 119, 255)] = rgba(176, 163, 200, 255),
}
for frame = 0, 63 do
  local ox, oy = (frame % 8) * 32, math.floor(frame / 8) * 32
  local left, top, right, bottom = 32, 32, -1, -1
  for y = 0, 31 do
    for x = 0, 31 do
      if original:getPixel(ox+x, oy+y) == rgba(196, 195, 184, 255) then
        left, top = math.min(left, x), math.min(top, y)
        right, bottom = math.max(right, x), math.max(bottom, y)
      end
    end
  end
  if right >= left then
    local w, h = right-left, bottom-top
    local ax, ay = left+math.floor(w*0.28+0.5), top+math.floor(h*0.38+0.5)
    for y = top, bottom do
      for x = left, right do
        local small = (x == ax or x == ax+1) and (y == ay or y == ay+1)
        local color = spotColors[original:getPixel(ox+x, oy+y)]
        if color and small then overlay:drawPixel(ox+x, oy+y, color) end
      end
    end
  end
end
sheet.layers[1].name = "Original - lapin blanc (verrouille)"
sheet.layers[1].isEditable = false
local tint = sheet:newLayer()
tint.name = "Indie Games on Solana - pelage noir et taches blanches"
sheet:newCel(tint, 1, overlay, Point(0, 0))
sheet.gridBounds = Rectangle(0, 0, 32, 32)
sheet.data = "Source: bunny-white.png. Grille 8x8, cases 32x32. Recoloration uniquement."
sheet:saveAs(out .. "indie-games-on-solana-sheet.aseprite")
local composite = Image(sheet)
composite:saveAs(exported)

-- Editable animation companion, preserving all 64 slots in row-major order.
local animation = Sprite(32, 32, ColorMode.RGB)
local base = animation.layers[1]
base.name = "Original - lapin blanc (verrouille)"
local colorLayer = animation:newLayer()
colorLayer.name = "Indie Games on Solana - pelage noir et taches blanches"
for index = 0, 63 do
  local frame = index + 1
  if index > 0 then animation:newEmptyFrame(frame) end
  animation.frames[frame].duration = 0.125
  local rect = Rectangle((index % 8) * 32, math.floor(index / 8) * 32, 32, 32)
  animation:newCel(base, frame, Image(original, rect), Point(0, 0))
  animation:newCel(colorLayer, frame, Image(overlay, rect), Point(0, 0))
end
base.isEditable = false
local definitions = {
  {"idle", 0, 7, 8},
  {"move", 8, 15, 12},
  {"eat", 16, 23, 8},
  {"sleep", 32, 39, 4},
  {"happy", 40, 47, 10},
  {"damage", 48, 52, 12},
  {"death", 56, 61, 8},
}
for _, definition in ipairs(definitions) do
  local tag = animation:newTag(definition[2] + 1, definition[3] + 1)
  tag.name = definition[1]
  for index = definition[2], definition[3] do
    animation.frames[index + 1].duration = math.floor(1000 / definition[4] + 0.5) / 1000
  end
end
animation.data = "Indices et cadences de HomeRabbit.ANIMS; damage arrete a IslandRabbit.LAST_PAINTED (52)."
animation:saveAs(out .. "indie-games-on-solana-animation.aseprite")
print("Indie Games on Solana: " .. changed .. " pixels recolores; planche 256x256; 64 cases de 32x32; 2 calques.")
