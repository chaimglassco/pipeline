import "@testing-library/jest-dom/vitest";

const emptyRect = () => new DOMRect(0, 0, 0, 0);
const textPrototype = Text.prototype as Text & { getClientRects?: () => DOMRectList; getBoundingClientRect?: () => DOMRect };
if (!textPrototype.getClientRects) Object.defineProperty(textPrototype, "getClientRects", { configurable: true, value: () => [] });
if (!textPrototype.getBoundingClientRect) Object.defineProperty(textPrototype, "getBoundingClientRect", { configurable: true, value: emptyRect });
if (!Range.prototype.getClientRects) Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
if (!Range.prototype.getBoundingClientRect) Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: emptyRect });
