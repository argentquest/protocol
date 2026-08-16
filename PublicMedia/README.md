# Downloaded open media sources

This directory preserves extracted third-party source media considered for Path
Protocol themes. Runtime-ready selections are copied into
`public/media/themes`; files here are authoring material and are not served by
the application. Original ZIP archives are intentionally not duplicated in the
repository after extraction; their source URLs and verified SHA-256 values
remain in the provenance ledger below.

Every downloaded pack below is published under Creative Commons Zero 1.0
(CC0). The original license files included by publishers remain beside the
extracted media where provided.

| Source archive | Publisher | Source page | Verified SHA-256 |
|---|---|---|---|
| `kenney_sci-fi-rts.zip` | Kenney | <https://kenney.nl/assets/sci-fi-rts> | `093cb6adbd5aa3ae49da1c91ca3045251656df254c11903b3bfa8594a7a160ea` |
| `unlucky-studio-complete-spaceship-art.zip` | Unlucky Studio | <https://opengameart.org/content/complete-spaceship-game-art-pack> | `cccd4b2dd5b8fc193447eb1066f46ce704c5e4acee18a0707c174725990c3144` |
| `kenney_puzzle-pack-2.zip` | Kenney | <https://kenney.nl/assets/puzzle-pack-2> | `f1c4c33621007bbddc0df6cbccbc1992a9cf519b803d79f91a4fae8dcb26e277` |
| `free-sci-fi-platformer.zip` | pzUH / GameArt2D | <https://opengameart.org/content/free-sci-fi-platformer-game-tileset> | `05a19dbcc7d9630fb7a70c492ab2838b17d7b2e09a7da55fefc156e193bad3ea` |
| `sbs_2d-planets-large.zip` | Screaming Brain Studios | <https://opengameart.org/content/2d-planet-pack-2> | `5f18263c0b9656fc6e46b2ed938b41673f092248cb4213a2da01299596eff406` |
| `sbs_2d-planets-medium.zip` | Screaming Brain Studios | <https://opengameart.org/content/2d-planet-pack-2> | `699732ec3f65119d7fb02ded40549f2000eced0dd487b6535e84a81c8fd03d30` |
| `sbs_2d-planets-small.zip` | Screaming Brain Studios | <https://opengameart.org/content/2d-planet-pack-2> | `2196f58e84a554cc071dc0b261d2c14997202665bf0b0ed463cd2ace3e9be083` |
| `kenney_ui-pack-sci-fi.zip` | Kenney | <https://kenney.nl/assets/ui-pack-sci-fi> | `4ae5a4949b71ba6c08bfb4d4708b3880915782f7deae7bc5872e1d56f0a668af` |

The verified extraction contains 2,416 PNG files, 387 SVG files, and publisher
source/support files. Archives were checked for unsafe traversal paths before
extraction and then removed from the repository to keep public clones smaller.

## Theme Builder catalog

`catalog.json` is the allowlist and provenance index for media shown in the
Theme Workshop. Files outside its named top-level collections are not exposed.
The catalog itself is read-only: choosing an asset copies a validated version
into `data/themes/<theme-id>/media`, so a published theme is self-contained.

Supported image inputs are PNG, JPEG, and compatible SVG. JPEG is normalized to
PNG. Supported audio inputs are WAV, OGG, MP3, AIF, and AIFF. Audio is normalized
to a stereo 44.1 kHz 16-bit PCM WAV master with WebM/Opus and MP3 runtime files.
Every catalog collection must declare a license and source URL.
