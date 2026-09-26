// Keys shared by the app and the API. A stock line and an estimate line with the same key mean
// exactly the same physical thing, so "used" can be summed from estimate lines by key.

export function stockKey({ trade, item, material, size, secondarySize, core }) {
  return [trade, item, material, size, secondarySize || "", core || ""].join("|");
}

export function rateKey(trade, family, item, material) {
  return [trade, family, item, material || ""].join("::");
}
