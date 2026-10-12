"""
Builds client/src/assets/fonts/Bangers-Tectonic.woff2: Bangers (the comic theme's lettering, themes/comic/font.ts) with
a bar across its 7, which otherwise reads as a 1 (its short top arm leans at the same angle as the 1's flag). Bangers
has no alternate 7 to switch on, so the glyph itself is changed. Everything else is Google Fonts' Bangers as served.

Bangers is under the SIL Open Font License 1.1 (OFL.txt beside the font), which allows modified versions and reserves
no font name, so it keeps the name Bangers and every use of it gets the new 7.

Run with fontTools and brotli (pip install fonttools brotli), from the repo root:
    python client/scripts/patch-bangers.py Bangers-Regular.ttf client/src/assets/fonts/Bangers-Tectonic.woff2
The source is Google Fonts' TTF (https://fonts.googleapis.com/css2?family=Bangers, fetched with a user agent too old
for woff2, gives its URL); this was built from v25.
"""

import sys

from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

# Bangers' lean: how far its strokes move right per unit up (the 7's stem runs from (29, 9) to (228, 556)).
SLANT = 0.36
# The bar across the 7, in font units (1000 to the em): from y 300 to 400, its bottom edge from x 20 to 395. Long and
# heavy enough to show at the 13px the board's smallest lettering is drawn at.
SEVEN_BAR = (300, 400, 20, 395)


def signed_area(points):
    return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(points, points[1:] + points[:1])) / 2


def add_bar(font, glyph_name, y0, y1, x_left, x_right):
    """Adds a parallelogram from y0 to y1, its bottom edge from x_left to x_right, leaning with the font."""
    glyphs = font.getGlyphSet()
    outline = RecordingPen()
    glyphs[glyph_name].draw(outline)
    first_contour = [args[-1] for op, args in outline.value if op in ("moveTo", "lineTo", "qCurveTo", "curveTo")]
    rise = SLANT * (y1 - y0)
    bar = [(x_left, y0), (x_left + rise, y1), (x_right + rise, y1), (x_right, y0)]
    # Wound the same way as the glyph's own outline, so the overlap fills rather than cancelling out.
    if (signed_area(bar) > 0) != (signed_area(first_contour) > 0):
        bar.reverse()
    pen = TTGlyphPen(glyphs)
    outline.replay(pen)
    pen.moveTo(bar[0])
    for point in bar[1:]:
        pen.lineTo(point)
    pen.closePath()
    glyf = font["glyf"]
    glyf[glyph_name] = pen.glyph()
    glyf[glyph_name].recalcBounds(glyf)


def main(source, out):
    font = TTFont(source)
    add_bar(font, font.getBestCmap()[ord("7")], *SEVEN_BAR)
    font.flavor = "woff2"
    font.save(out)


if __name__ == "__main__":
    main(*sys.argv[1:3])
