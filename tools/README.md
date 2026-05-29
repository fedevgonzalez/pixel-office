# Layout tools — LLM/human-friendly editing of `layout.json`

The engine reads a **flat** layout: parallel arrays (`tiles[]`, `tileColors[]`,
`tileThemes[]`, `zones[]`) indexed `row*cols+col`, plus `furniture[]` / `pets[]`
/ `background`. That's efficient for the renderer/pathfinder but painful to edit
by hand or with an LLM — you must compute exact indices and keep four arrays in
lockstep, and the grid is invisible in JSON.

These tools add a **source format** that round-trips losslessly to/from the
engine format. The engine and `layout.json` on disk are unchanged; you author
the readable form and compile it.

## Source format

```jsonc
{
  "format": "pixel-office-source@1",
  "size": { "cols": 20, "rows": 17 },
  "legend": {                                   // one entry per distinct tile kind
    "#": { "tile": "WALL" },
    ".": { "tile": "FLOOR_5", "color": { "h": 220, "s": 40, "b": -30, "c": 10, "colorize": true } },
    "g": { "tile": "FLOOR_5", "color": { "h": 116, "s": 50, "b": -20, "c": 8, "colorize": true }, "zone": "play" },
    "~": { "tile": "VOID" }
  },
  "map": [                                       // the grid, one string per row — you SEE it
    "####################",
    "#..................#",
    "...",
    "########ggg#########",                      //  ← doorway to the yard
    "~~~gggggggggggggg~~~"                        //  ← open-air grass, void edges
  ],
  "furniture": [ { "type": "desk", "at": [1, 1], "uid": "..." } ],
  "pets":      [ { "species": "cat", "name": "Dexter", "sex": "m", "at": [4, 15], "...": "..." } ],
  "background": { "theme": "suburban" },
  "version": 1
}
```

- **`map`** is the picture: row = string, column = char. Place a grass tile by
  typing `g` at the right `(x,y)`. No index math.
- **`legend`** collapses the four parallel arrays into one entry per glyph:
  tile **by name** (`WALL`, `FLOOR_1`..`FLOOR_7`, `VOID`), optional `color`
  (HSL `FloorColor`), optional `theme`, optional `zone` (`focus` | `play`).
- **`furniture`/`pets`** use `at: [col,row]`. `type`/`zone`/`tile` are validated
  by name — an unknown value is a **hard error**, not a silent vanish.

## CLI

```sh
node tools/layout-tool.mjs decompile <layout.json> [out.source.json]   # flat → readable
node tools/layout-tool.mjs compile   <source.json> [out.layout.json]   # readable → flat
node tools/layout-tool.mjs check     <source.json>                     # validate only
node tools/layout-tool.mjs roundtrip <layout.json>                     # assert lossless
```

### Editing the kiosk layout over SSH

```sh
scp homeserver:~/.pixel-office/layout.json .
node tools/layout-tool.mjs decompile layout.json layout.source.json
$EDITOR layout.source.json          # edit the ASCII map / furniture / pets
node tools/layout-tool.mjs compile layout.source.json layout.json
scp layout.json homeserver:~/.pixel-office/layout.json
```

## Tests

```sh
node tools/layout-format.test.mjs   # round-trip + validation; also checks the
                                    # community gallery layouts if checked out
```

## Why a compile layer (not a native format change)

The flat arrays are read on hot paths (`officeState`, `renderer`, `findPath`
via `row*cols+col`), and the server, the narration bridge, and the community
gallery all treat `layout.json` as that flat blob. Changing the native format
would touch all of them and the wire protocol at once. The compile layer
confines everything to two pure functions in `layout-format.mjs`, keeps the
on-disk format byte-compatible (`version: 1`), and still gives an LLM/human the
readable form to author and edit. Round-trip is verified lossless against the
live kiosk layout and all community gallery layouts.
