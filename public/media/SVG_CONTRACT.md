# Path Protocol vector SVG contract

Every V2 vector media file must:

- Use lowercase `.svg` filenames registered by `mediaId`.
- Use `viewBox="0 0 100 100"`.
- Keep the canvas background transparent.
- Center the visible artwork around `(50, 50)`.
- Keep important artwork within the viewbox.
- Contain its own literal colors, gradients, strokes, and opacity.
- Use basic SVG shapes, paths, gradients, and clip paths supported by PixiJS
  vector parsing.
- Avoid dependencies on application CSS or other SVG files.

Vector-mode files must not contain:

- `text`, `image`, `filter`, `pattern`, `foreignObject`, `script`, `use`, or
  embedded style elements.
- Blur or drop-shadow filters.
- External links or network references.
- Embedded bitmap or base64 data.
- CSS custom properties.
- Animation elements.
- A non-transparent full-canvas background.

Collision geometry and dimensions always come from level JSON. Artwork bounds
are presentation only.

Rectangular media registered with `sizing: "stretch"` may scale independently
to configured width and height. Media registered with `sizing: "contain"` must
preserve aspect ratio.
