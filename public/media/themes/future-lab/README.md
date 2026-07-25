# Future Lab overrides

Future Lab currently inherits every visual and audio element from the complete
default media library.

Add only individual overrides using the registered category and filename. A
missing override uses the corresponding default. An invalid override also uses
the default and produces a development-only diagnostic.

Theme audio WAV masters belong in `audio/source/`. The media preparation command
generates missing WebM and MP3 files without overwriting existing conversions.
