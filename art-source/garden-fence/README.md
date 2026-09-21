# Garden fence — visual proposal

`concept-v1.png` is a concept sheet, not a production sprite atlas. Generated with the built-in image_gen tool.

References: the user's fence and garden screenshots, `public/assets/terrain-iso/tilemap-flat.png`, and `public/assets/buildings/house-1.png`.

Direction: low ochre wooden posts, two rails, dark outlines, two isometric diagonals, corners and an entrance. A possible cosmetic purchase; no price, gameplay effect, or purchase flow is implemented.

Before runtime integration, prepare transparent sprites with consistent pixel density, ground anchors and exact 2:1 alignment. Place segments at the actual generated field boundary and depth-sort with plants and actors; keep the entrance traversable.

## Generation prompt

## Storybook module

`public/assets/deco/garden-fence/segment-v2.png` is the transparent prototype used by `Burrow/Garden fence`. The user reduced the generated v1 from 1536×1024 to 192×128; the story's foot anchors and span are divided by eight to retain the same footprint. Only this sprite is loaded by the story; v1 and the concept sheet are references, not runtime dependencies. The fence is not yet integrated into gameplay. Built-in image_gen supplied v1; the story mirrors the sprite and aligns its two post feet to the game's 44×24 grid. This is a visual prototype, with no purchasing or collision behavior. Mirroring also mirrors lighting; independently painted reverse-facing sprites remain a production refinement.

Module prompt:

Use case: background-extraction. Reference is our approved garden fence concept. Output ONE isolated fence segment only, like the top-left module in the reference, on genuinely transparent alpha background. Two identical short square wood posts joined by two slender parallel rails, upper-left post to lower-right post in exact 2:1 isometric slope (horizontal distance twice vertical distance between post feet). Golden ochre wood, dark navy-brown pixel outlines, same design as reference. No ground, no shadow outside sprite, no grass, no other modules, no text, no checkerboard drawn in pixels. Crisp low-resolution game pixel art with consistent chunky square pixel clusters, nearest neighbor enlarged. Full object in frame with generous transparent margins. Both posts same height and width; two rails attach correctly. Single segment, ready to use as a sprite.

## Original concept prompt

Use case: stylized-concept. Create a pixel-art wooden garden fence concept sheet for Rabbit Royale. Input 1 is fence shape inspiration: low wooden posts with TWO horizontal rails. Input 2 is the actual carrot garden and game style to match. Input 3 is actual isometric terrain atlas: follow its 2:1 diamond projection. Input 4 actual house sprite: match its golden ochre wood, brown midtones, dark blue-brown outlines, crisp pixel clusters. Output one coherent sheet on plain muted blue-grey background, no text, no UI. Upper half: well-separated modular sprites, a straight fence section along each of the two isometric diagonals, a corner, an end post, and a small gate. Same physical scale and thickness throughout, no plants attached to modules, two rails per segment, squat posts, highlights upper-left, dark outlines, crisp deliberately low resolution pixel art enlarged nearest-neighbor, no smooth painting. Lower half: larger assembled example of a small diamond-shaped carrot patch enclosed by that SAME low fence, an opening on the near side, twelve green leafy orange carrots inside, pale yellow tilled soil, narrow green grass border, actual blue-roof house to the right similar to input 2 and 4. Fence low enough to leave carrots visible. Garden and fence follow same 2:1 isometric axes, front fence properly in front of carrots and back fence behind. This is an art proposal sheet, no shop interface, no text, no watermark. Prioritize the actual game's rugged pixel style over the smoother fence inspiration.
