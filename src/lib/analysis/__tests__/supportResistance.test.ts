import { describe, expect, it } from "vitest";
import { Candle } from "../indicators";
import { calculateSupportResistance } from "../supportResistance";

function candle(index: number, close: number, volume: number): Candle {
  return {
    date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume,
  };
}

describe("volume profile structure", () => {
  it("exposes value-area position, overhead supply, and a volume-confirmed breakout", () => {
    const candles = Array.from({ length: 29 }, (_, index) => candle(index, 100, 1_000));
    candles.push(candle(29, 105, 2_000));

    const result = calculateSupportResistance(candles, 105, 101, 99, 107, 98);

    expect(result.volumeProfile).toMatchObject({
      available: true,
      pricePosition: "above_value_area",
      overheadSupply: "light",
      barsSinceValueAreaBreakout: 0,
      breakoutRelativeVolume: 2,
      breakoutVolumeConfirmed: true,
    });
    expect(result.volumeProfile.volumeAbovePriceShare).toBeLessThanOrEqual(0.2);
    expect(
      result.volumeProfile.volumeAbovePriceShare +
      result.volumeProfile.volumeBelowPriceShare +
      result.volumeProfile.volumeAtPriceShare
    ).toBeCloseTo(1, 4);
    expect(result.typedLevels).toEqual(expect.arrayContaining([
      expect.objectContaining({ price: result.volumeProfile.valueAreaHigh, source: "vpvr", strength: 0.75 }),
      expect.objectContaining({ price: result.volumeProfile.valueAreaLow, source: "vpvr", strength: 0.75 }),
    ]));
  });

  it("does not fabricate VPVR levels when volume data is unavailable", () => {
    const candles = Array.from({ length: 30 }, (_, index) => candle(index, 100, 0));
    const result = calculateSupportResistance(candles, 100, 101, 99, 107, 98);

    expect(result.volumeProfile.available).toBe(false);
    expect(result.typedLevels?.some((level) => level.source === "vpvr")).toBe(false);
  });

  it("classifies a price below a high-volume value area as heavy overhead supply", () => {
    const candles = Array.from({ length: 29 }, (_, index) => candle(index, 110, 2_000));
    candles.push(candle(29, 90, 500));

    const profile = calculateSupportResistance(candles, 90, 100, 98, 112, 88).volumeProfile;

    expect(profile.pricePosition).toBe("below_value_area");
    expect(profile.overheadSupply).toBe("heavy");
    expect(profile.volumeAbovePriceShare).toBeGreaterThanOrEqual(0.5);
  });
});
