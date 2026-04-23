// Expo SDK 54 / Metro expects ES2023 Array.prototype.toReversed.
// Node 18 doesn't include it, which breaks Metro with:
// "configs.toReversed is not a function".
// Prefer Node >= 20.19.4; this polyfill unblocks Node 18.
if (typeof Array.prototype.toReversed !== "function") {
  Object.defineProperty(Array.prototype, "toReversed", {
    configurable: true,
    writable: true,
    value: function toReversed() {
      return [...this].reverse();
    },
  });
}

const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require('nativewind/metro');
 
const config = getDefaultConfig(__dirname)
 
module.exports = withNativeWind(config, { input: './global.css' })