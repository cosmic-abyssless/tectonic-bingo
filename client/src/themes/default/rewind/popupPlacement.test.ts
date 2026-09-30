import { describe, expect, it } from "vitest";
import { placePopup } from "./popupPlacement";

const bounds = { left: 8, top: 80, right: 1192, bottom: 640 };
const card = { width: 300, height: 200 };
const tile = (left: number, top: number) => ({
  left,
  top,
  width: 100,
  height: 100,
});

describe("placePopup", () => {
  it("centres the card above the Tile, pointing down at it", () => {
    expect(placePopup(tile(500, 400), card, bounds, 20)).toEqual({
      left: 400,
      top: 180,
      pointer: { edge: "bottom", offset: 150 },
    });
  });

  it("goes below a Tile with no room above", () => {
    expect(placePopup(tile(500, 100), card, bounds, 20)).toEqual({
      left: 400,
      top: 220,
      pointer: { edge: "top", offset: 150 },
    });
  });

  it("goes beside a Tile with no room above or below", () => {
    const tall = { width: 300, height: 400 };
    expect(placePopup(tile(200, 300), tall, bounds, 20)).toEqual({
      left: 320,
      top: 150,
      pointer: { edge: "left", offset: 200 },
    });
    expect(placePopup(tile(1000, 300), tall, bounds, 20)).toEqual({
      left: 680,
      top: 150,
      pointer: { edge: "right", offset: 200 },
    });
  });

  it("slides along to stay on screen, pointing off-centre at an edge Tile", () => {
    expect(placePopup(tile(10, 400), card, bounds, 20)).toEqual({
      left: 8,
      top: 180,
      pointer: { edge: "bottom", offset: 52 },
    });
  });

  it("keeps the pointer clear of the card's corners", () => {
    expect(placePopup({ left: 0, top: 400, width: 20, height: 20 }, card, bounds, 20).pointer).toEqual({ edge: "bottom", offset: 28 });
  });

  it("stays within the bounds, pointing towards a Tile scrolled away", () => {
    expect(placePopup(tile(500, 900), card, bounds, 20)).toEqual({
      left: 400,
      top: 440,
      pointer: { edge: "bottom", offset: 150 },
    });
    expect(placePopup(tile(500, -300), card, bounds, 20)).toEqual({
      left: 400,
      top: 80,
      pointer: { edge: "top", offset: 150 },
    });
  });

  it("centres at the top without a Tile", () => {
    expect(placePopup(null, card, bounds, 20)).toEqual({
      left: 450,
      top: 80,
      pointer: null,
    });
  });
});
