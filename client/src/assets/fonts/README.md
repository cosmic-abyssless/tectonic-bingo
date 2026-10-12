# Fonts

`Bangers-Tectonic.woff2`: [Bangers](https://github.com/googlefonts/bangers), the comic theme's lettering, as Google
Fonts serves it (v25), with a bar across its 7: Bangers' 7 has a short top arm that leans at the same angle as its 1's
flag, so the two read alike, and the font has no alternate 7 to switch on. Built by `client/scripts/patch-bangers.py`
(which says how to run it). Under the SIL Open Font License 1.1 (`Bangers-OFL.txt`), which allows modified versions
and reserves no name, so it keeps the name Bangers.

`RuneScape-Bold-12.woff2`: Old School RuneScape's in-game "Bold 12" font (b12_full), from
[RuneStar/fonts](https://github.com/RuneStar/fonts) (commit c07e142), released there as public domain under CC0 1.0
(`RuneScape-Bold-12.LICENSE.txt`). Built from that repo's `data/RuneScape/RuneScape-Bold-12.json` with its `build.py`
(fontTools, without the FontForge clean-up pass), then saved as WOFF2.

A bitmap font drawn as pixel squares on a 16-unit em: it is crisp at 16px and whole multiples of it (32px, 48px). It
is only for Wrapped's name captions (`font-osrs`, see `core/wrapped/OsrsCaption.tsx`), never for the app's UI text.
RuneScape is a registered trademark of Jagex Ltd.
