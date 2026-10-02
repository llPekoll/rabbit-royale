-- Run from the repository root with Aseprite --batch --script <this file>.
-- Palette replacement only: no resampling, drawing, trimming, or packing.
local root = app.fs.currentPath
local out = root .. "/art-source/bunny-carrot-20261002/"
local source = root .. "/godot/assets/bunnies/bunny-white.png"
local exported = root .. "/godot/assets/bunnies/bunny-carrot.png"
local rgba = app.pixelColor.rgba
local replacements = {
  [rgba(241, 240, 253, 255)] = rgba(255, 244, 218, 255),
  [rgba(47, 47, 46, 255)] = rgba(79, 40, 17, 255),
  [rgba(196, 195, 184, 255)] = rgba(225, 100, 24, 255),
  [rgba(230, 232, 234, 255)] = rgba(255, 157, 49, 255),
  [rgba(247, 143, 159, 255)] = rgba(108, 193, 50, 255),
  [rgba(133, 132, 119, 255)] = rgba(157, 57, 17, 255),
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
-- Tint the ear fur green around the upper pink ear pixels, leaving the face orange.
for frame = 0, 63 do
  local ox, oy = (frame % 8) * 32, math.floor(frame / 8) * 32
  local firstPink = 32
  for y = 0, 31 do
    for x = 0, 31 do
      if original:getPixel(ox+x, oy+y) == rgba(247, 143, 159, 255) then
        firstPink = math.min(firstPink, y)
      end
    end
  end
  for y = firstPink, math.min(firstPink+2, 31) do
    for x = 0, 31 do
      if original:getPixel(ox+x, oy+y) == rgba(247, 143, 159, 255) then
        for dy = -1, 1 do
          for dx = -1, 1 do
            local px, py = x+dx, y+dy
            if px >= 0 and px < 32 and py >= 0 and py < 32 then
              local color = original:getPixel(ox+px, oy+py)
              if color == rgba(230, 232, 234, 255) then
                overlay:drawPixel(ox+px, oy+py, rgba(144, 213, 67, 255))
              end
            end
          end
        end
      end
    end
  end
end
sheet.layers[1].name = "Original - lapin blanc (verrouille)"
sheet.layers[1].isEditable = false
local tint = sheet:newLayer()
tint.name = "Carotte - recoloration"
sheet:newCel(tint, 1, overlay, Point(0, 0))
sheet.gridBounds = Rectangle(0, 0, 32, 32)
sheet.data = "Source: bunny-white.png. Grille 8x8, cases 32x32. Recoloration uniquement."
sheet:saveAs(out .. "bunny-carrot-sheet.aseprite")
local composite = Image(sheet)
composite:saveAs(exported)

-- Editable animation companion, preserving all 64 slots in row-major order.
local animation = Sprite(32, 32, ColorMode.RGB)
local base = animation.layers[1]
base.name = "Original - lapin blanc (verrouille)"
local colorLayer = animation:newLayer()
colorLayer.name = "Carotte - recoloration"
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
animation:saveAs(out .. "bunny-carrot-animation.aseprite")
print("Carotte: " .. changed .. " pixels recolores; planche 256x256; 64 cases de 32x32; 2 calques.")
