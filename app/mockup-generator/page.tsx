// @ts-nocheck
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

// Texas Gal Mockup Generator — V6.9
// Layout + overlap upgrade:
// - Templates removed
// - Keeps auto-fit text to canvas
// - Keeps separate width/height sliders
// - Keeps stable preview on the right
// - Keeps logo, elements, watermark, banner,
//   Auto Alternate Sets, transparent background, and 300 DPI export
// - Adds background image opacity control
// - Adds top offset for multi-line text
// - Adds per-line arc controls for up to 3 lines
// - Moves Full Alphabet into its own preview mode section
// - Adds overlap layout controls
// - Allows tighter negative letter spacing
// - Export file name starts blank and warns if empty

const MAX_SETS = 8;

const LETTER_KEYS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
  ..."abcdefghijklmnopqrstuvwxyz".split(""),
  ..."0123456789".split(""),
];

const CANVAS_PRESETS = [
  { id: "etsy", label: "Etsy Listing — 3000 × 2400 px", w: 3000, h: 2400 },
  { id: "11x13", label: "11 × 13 inches — 3300 × 3900 px", w: 3300, h: 3900 },
  { id: "12x7", label: "12 × 7 inches — 3600 × 2100 px", w: 3600, h: 2100 },
  { id: "square", label: "Square — 3000 × 3000 px", w: 3000, h: 3000 },
  { id: "wide", label: "Wide Mockup — 3200 × 2000 px", w: 3200, h: 2000 },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function seededUnit(seed) {
  const x = Math.sin(seed * 999.91) * 43758.5453123;
  return x - Math.floor(x);
}

function rangeFromSeed(seed, min, max) {
  return min + seededUnit(seed) * (max - min);
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve({ img, src: reader.result });
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function buildImageFromSource(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      img._src = src;
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

async function trimTransparentImage(img, src, options = {}) {
  const alphaThreshold = options.alphaThreshold ?? 1;
  const minTrimPixels = options.minTrimPixels ?? 2;

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { img, src, trimmed: false, trimBounds: null };

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { img, src, trimmed: false, trimBounds: null };
  }

  const cropX = Math.max(0, minX);
  const cropY = Math.max(0, minY);
  const cropW = Math.max(1, maxX - minX + 1);
  const cropH = Math.max(1, maxY - minY + 1);

  const leftPad = cropX;
  const topPad = cropY;
  const rightPad = width - (cropX + cropW);
  const bottomPad = height - (cropY + cropH);
  const shouldTrim =
    leftPad >= minTrimPixels ||
    topPad >= minTrimPixels ||
    rightPad >= minTrimPixels ||
    bottomPad >= minTrimPixels;

  if (!shouldTrim) {
    return {
      img,
      src,
      trimmed: false,
      trimBounds: { x: cropX, y: cropY, width: cropW, height: cropH },
    };
  }

  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = cropW;
  croppedCanvas.height = cropH;
  const croppedCtx = croppedCanvas.getContext("2d");
  if (!croppedCtx) return { img, src, trimmed: false, trimBounds: null };

  croppedCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  const trimmedSrc = croppedCanvas.toDataURL("image/png");
  const trimmedImg = await buildImageFromSource(trimmedSrc);

  return {
    img: trimmedImg,
    src: trimmedSrc,
    trimmed: true,
    trimBounds: { x: cropX, y: cropY, width: cropW, height: cropH },
  };
}
function fitRectCover(imgW, imgH, boxW, boxH) {
  const scale = Math.max(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  const x = (boxW - w) / 2;
  const y = (boxH - h) / 2;
  return { x, y, w, h };
}

function fitRectContain(imgW, imgH, boxW, boxH) {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  const x = (boxW - w) / 2;
  const y = (boxH - h) / 2;
  return { x, y, w, h };
}

function parseLetterKey(filename) {
  const name = filename.replace(/\.[^/.]+$/, "");
  const exact = LETTER_KEYS.find((k) => k === name);
  if (exact) return exact;

  const upperMatch = name.match(/^([A-Z])(?:_|-|\s|$)/);
  if (upperMatch) return upperMatch[1];

  const lowerMatch = name.match(/^([a-z])(?:_|-|\s|$)/);
  if (lowerMatch) return lowerMatch[1];

  const digitMatch = name.match(/^([0-9])(?:_|-|\s|$)/);
  if (digitMatch) return digitMatch[1];

  if (name.length === 1 && LETTER_KEYS.includes(name)) return name;
  return null;
}

function isHiddenMacPath(path) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.some(
    (part) =>
      part === "__MACOSX" ||
      part === ".DS_Store" ||
      part.startsWith("._") ||
      part.startsWith(".")
  );
}

function getDisplayNameFromFiles(files, fallback) {
  const first = files[0];
  const rel = first?.webkitRelativePath || "";
  if (rel.includes("/")) return rel.split("/")[0] || fallback;
  return fallback;
}

function getLinesFromPhrase(phrase) {
  return phrase
    .split(/\n|\|/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function bannerRect(position, canvasW, canvasH, height, widthPct, margin) {
  const fullW = canvasW - margin * 2;
  const cornerW = fullW * widthPct;

  switch (position) {
    case "top":
      return { x: margin, y: margin, w: fullW, h: height };
    case "bottom":
      return { x: margin, y: canvasH - height - margin, w: fullW, h: height };
    case "top-left":
      return { x: margin, y: margin, w: cornerW, h: height };
    case "top-right":
      return {
        x: canvasW - cornerW - margin,
        y: margin,
        w: cornerW,
        h: height,
      };
    case "bottom-left":
      return {
        x: margin,
        y: canvasH - height - margin,
        w: cornerW,
        h: height,
      };
    case "bottom-right":
      return {
        x: canvasW - cornerW - margin,
        y: canvasH - height - margin,
        w: cornerW,
        h: height,
      };
    case "center":
      return { x: margin, y: (canvasH - height) / 2, w: fullW, h: height };
    default:
      return { x: margin, y: margin, w: fullW, h: height };
  }
}

function buildWordItems({
  phrase,
  alphaSets,
  autoAlternate,
  designScale,
  autoFit,
  letterSpacing,
  lineSpacing,
  layoutMode,
  arcHeight,
  topOffset,
  lineArcEnabled,
  lineArcHeights,
  overlapAmount,
  overlapSizeVariation,
  overlapRotationVariation,
  overlapSeed,
  canvasW,
  canvasH,
  textAlign = "center",
}) {
  const lines = getLinesFromPhrase(phrase).slice(0, 3);
  if (!lines.length) return [];

  const loadedSets = alphaSets.filter(
    (s) => s && s.letters && Object.keys(s.letters).length > 0
  );
  if (!loadedSets.length) return [];

  const items = [];
  const lineCount = lines.length;
  const sidePadding = canvasW * 0.05;
  const topPadding = canvasH * 0.06;
  const bottomPadding = canvasH * 0.08;
  const maxLineWidth = canvasW - sidePadding * 2;
  const availableHeight = Math.max(
    canvasH * 0.24,
    canvasH - topPadding - bottomPadding - Math.max(0, lineCount - 1) * lineSpacing
  );
  const maxLetterHeightByLines = Math.max(canvasH * 0.08, availableHeight / lineCount);
  const preferredBaseLetterH = Math.min(canvasH * 0.24, maxLetterHeightByLines * 0.72);
  const baseLetterH = Math.max(canvasH * 0.08, preferredBaseLetterH * (designScale / 100));
  const isOverlapMode = layoutMode === "overlap";
  let globalIndex = 0;

  lines.forEach((line, lineIndex) => {
    const chars = line.split("");
    let provisional = [];
    let xCursor = 0;
    let lineVisibleIndex = 0;

    chars.forEach((char, charIndex) => {
      if (char === " ") {
        xCursor += canvasW * 0.03;
        return;
      }

      const setIndex = autoAlternate
        ? globalIndex % loadedSets.length
        : Math.min(charIndex, loadedSets.length - 1);

      const alphaSet = loadedSets[setIndex];
      const img =
        alphaSet?.letters?.[char] ||
        alphaSet?.letters?.[char.toUpperCase()] ||
        alphaSet?.letters?.[char.toLowerCase()];
      if (!img) return;

      const baseScale = baseLetterH / img.height;
      const seedBase =
        (overlapSeed + 1) * 1000 + (lineIndex + 1) * 100 + (lineVisibleIndex + 1) * 7;

      let sizeFactor = 1;
      let rotation = 0;
      let yJitter = 0;

      if (isOverlapMode) {
        const sizeDelta = rangeFromSeed(
          seedBase + 11,
          -overlapSizeVariation,
          overlapSizeVariation
        );
        sizeFactor = Math.max(0.5, 1 + sizeDelta / 100);
        rotation = rangeFromSeed(
          seedBase + 29,
          -overlapRotationVariation,
          overlapRotationVariation
        );
        yJitter = rangeFromSeed(
          seedBase + 41,
          -canvasH * 0.012,
          canvasH * 0.012
        );
      }

      const scale = baseScale * sizeFactor;
      const w = img.width * scale;
      const h = img.height * scale;

      provisional.push({
        id: uid(),
        type: "letter",
        char,
        setId: alphaSet.id,
        setName: alphaSet.name,
        image: img,
        src: img._src || img.src || null,
        x: xCursor,
        y: lineIndex * lineSpacing + yJitter,
        width: w,
        height: h,
        baseWidth: w,
        baseHeight: h,
        widthScale: 100,
        heightScale: 100,
        rotation,
        opacity: 1,
        baseLetterH,
        lineIndex,
      });

      const overlapShift = isOverlapMode ? overlapAmount : 0;
      xCursor += w + letterSpacing - overlapShift;
      globalIndex += 1;
      lineVisibleIndex += 1;
    });

    if (!provisional.length) return;

    const totalW =
      provisional[provisional.length - 1].x +
      provisional[provisional.length - 1].width;

    let widthFitScale = 1;
    if (autoFit && totalW > maxLineWidth) {
      widthFitScale = maxLineWidth / totalW;
    }

    provisional = provisional.map((item) => ({
      ...item,
      width: item.width * widthFitScale,
      height: item.height * widthFitScale,
      baseWidth: item.baseWidth * widthFitScale,
      baseHeight: item.baseHeight * widthFitScale,
      widthScale: 100,
      heightScale: 100,
    }));

    let relX = 0;
    provisional = provisional.map((item) => {
      const next = { ...item, x: relX };
      const overlapShift = isOverlapMode ? overlapAmount * widthFitScale : 0;
      relX += item.width + letterSpacing * widthFitScale - overlapShift;
      return next;
    });

    const shouldArc =
      layoutMode === "arc" && Array.isArray(lineArcEnabled) && lineArcEnabled[lineIndex];
    const currentArcHeight = Array.isArray(lineArcHeights)
      ? lineArcHeights[lineIndex] ?? arcHeight
      : arcHeight;

    if (shouldArc) {
      const count = provisional.length;
      if (count > 1) {
        provisional.forEach((item, index) => {
          const t = index / (count - 1);
          const normalized = t * 2 - 1;
          const curve = 1 - normalized * normalized;
          item.y -= curve * currentArcHeight;
          item.rotation += normalized * 12;
        });
      } else if (count === 1) {
        provisional[0].y -= currentArcHeight;
      }
    }

    items.push(...provisional);
  });

  if (!items.length) return [];

  const getBounds = (arr) => {
    const minX = Math.min(...arr.map((item) => item.x));
    const minY = Math.min(...arr.map((item) => item.y));
    const maxX = Math.max(...arr.map((item) => item.x + item.width));
    const maxY = Math.max(...arr.map((item) => item.y + item.height));
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  };

  let bounds = getBounds(items);

  if (autoFit) {
    const maxDesignHeight = Math.max(canvasH * 0.24, canvasH - topPadding - bottomPadding);
    const fitScale = Math.min(
      1,
      maxLineWidth / Math.max(bounds.width, 1),
      maxDesignHeight / Math.max(bounds.height, 1)
    );

    if (fitScale < 1) {
      items.forEach((item) => {
        item.x *= fitScale;
        item.y *= fitScale;
        item.width *= fitScale;
        item.height *= fitScale;
        item.baseWidth *= fitScale;
        item.baseHeight *= fitScale;
        item.baseLetterH *= fitScale;
      });
      bounds = getBounds(items);
    }
  }

  const lineIndexes = [...new Set(items.map((item) => item.lineIndex ?? 0))];
  const lineBoundsMap = new Map();
  let maxAlignedWidth = 0;

  lineIndexes.forEach((lineIndex) => {
    const lineItems = items.filter((item) => (item.lineIndex ?? 0) === lineIndex);
    if (!lineItems.length) return;
    const lineBounds = getBounds(lineItems);
    lineBoundsMap.set(lineIndex, lineBounds);
    maxAlignedWidth = Math.max(maxAlignedWidth, lineBounds.width);
  });

  const alignmentBoxLeft = (canvasW - maxAlignedWidth) / 2;

  lineIndexes.forEach((lineIndex) => {
    const lineBounds = lineBoundsMap.get(lineIndex);
    if (!lineBounds) return;

    const targetLineLeft =
      textAlign === "left"
        ? alignmentBoxLeft
        : alignmentBoxLeft + (maxAlignedWidth - lineBounds.width) / 2;

    const shiftX = targetLineLeft - lineBounds.minX;

    items.forEach((item) => {
      if ((item.lineIndex ?? 0) === lineIndex) {
        item.x += shiftX;
      }
    });
  });

  bounds = getBounds(items);
  const minTop = topPadding;
  const maxTop = Math.max(minTop, canvasH - bottomPadding - bounds.height);
  const desiredTop = Math.max(minTop, Math.min(topOffset, maxTop));
  const offsetY = desiredTop - bounds.minY;

  items.forEach((item) => {
    item.y += offsetY;
  });

  return items;
}

function buildAlphabetItems({
  alphaSets,
  autoAlternate,
  canvasW,
  canvasH,
  alphabetScale = 100,
}) {
  const loadedSets = alphaSets.filter(
    (s) => s && s.letters && Object.keys(s.letters).length > 0
  );
  if (!loadedSets.length) return [];

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const cols = 6;
  const rows = Math.ceil(letters.length / cols);
  const cellW = canvasW / cols;
  const topPad = canvasH * 0.12;
  const usableH = canvasH * 0.76;
  const rowH = usableH / rows;
  const scaleBoost = alphabetScale / 100;
  const targetH = Math.min(
    rowH * 0.95 * scaleBoost,
    canvasH * 0.22 * scaleBoost
  );

  const items = [];

  letters.forEach((char, index) => {
    const setIndex = autoAlternate ? index % loadedSets.length : 0;
    const alphaSet = loadedSets[setIndex];
    const img =
      alphaSet?.letters?.[char] || alphaSet?.letters?.[char.toLowerCase()];
    if (!img) return;

    const scale = targetH / img.height;
    const width = img.width * scale;
    const height = img.height * scale;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const centerX = col * cellW + cellW / 2;
    const centerY = topPad + row * rowH + rowH / 2;

    items.push({
      id: uid(),
      type: "letter",
      char,
      setId: alphaSet.id,
      setName: alphaSet.name,
      image: img,
      src: img._src || img.src || null,
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
      baseWidth: width,
      baseHeight: height,
      widthScale: 100,
      heightScale: 100,
      rotation: 0,
      opacity: 1,
      baseLetterH: targetH,
    });
  });

  return items;
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32(arr, offset, value) {
  arr[offset] = (value >>> 24) & 255;
  arr[offset + 1] = (value >>> 16) & 255;
  arr[offset + 2] = (value >>> 8) & 255;
  arr[offset + 3] = value & 255;
}

function setPngDpi(arrayBuffer, dpi = 300) {
  const data = new Uint8Array(arrayBuffer);
  const ppm = Math.round(dpi / 0.0254);
  const physData = new Uint8Array(9);
  writeUint32(physData, 0, ppm);
  writeUint32(physData, 4, ppm);
  physData[8] = 1;

  const type = new TextEncoder().encode("pHYs");
  const crcInput = new Uint8Array(type.length + physData.length);
  crcInput.set(type, 0);
  crcInput.set(physData, type.length);
  const crc = crc32(crcInput);

  const chunk = new Uint8Array(21);
  writeUint32(chunk, 0, 9);
  chunk.set(type, 4);
  chunk.set(physData, 8);
  writeUint32(chunk, 17, crc);

  const signature = data.slice(0, 8);
  let pos = 8;
  const chunks = [];
  let inserted = false;

  while (pos < data.length) {
    const length =
      (data[pos] << 24) |
      (data[pos + 1] << 16) |
      (data[pos + 2] << 8) |
      data[pos + 3];
    const chunkType = String.fromCharCode(
      data[pos + 4],
      data[pos + 5],
      data[pos + 6],
      data[pos + 7]
    );
    const total = 12 + length;
    const existing = data.slice(pos, pos + total);
    if (chunkType !== "pHYs") {
      chunks.push(existing);
      if (!inserted && chunkType === "IHDR") {
        chunks.push(chunk);
        inserted = true;
      }
    }
    pos += total;
  }

  if (!inserted) chunks.unshift(chunk);

  const totalLength = 8 + chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  result.set(signature, 0);
  let offset = 8;
  chunks.forEach((c) => {
    result.set(c, offset);
    offset += c.length;
  });
  return result;
}

async function downloadCanvasAsPng(canvas, filename, dpi = 300) {
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) return;
  const buffer = await blob.arrayBuffer();
  const patched = setPngDpi(buffer, dpi);
  const outBlob = new Blob([patched], { type: "image/png" });
  const url = URL.createObjectURL(outBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getOrderedItems(source) {
  return [...source].sort((a, b) => {
    const az = a?.zIndex ?? 0;
    const bz = b?.zIndex ?? 0;
    if (az !== bz) return az - bz;
    return 0;
  });
}

function normalizeLayerOrder(source) {
  return getOrderedItems(source).map((item, index) => ({
    ...item,
    zIndex: index,
  }));
}

function getNextLayerZ(source) {
  if (!source.length) return 0;
  return Math.max(...source.map((item) => item?.zIndex ?? -1)) + 1;
}

export default function AlphabetMockupWordDesigner() {
  const previewCanvasRef = useRef(null);
  const stageWrapRef = useRef(null);
  const fileInputRefs = useRef([]);
  const bgFileInputRef = useRef(null);
  const elementUploadRef = useRef(null);
  const logoUploadRef = useRef(null);
  const watermarkImageUploadRef = useRef(null);
  const hitCanvasCacheRef = useRef(new Map());

  const [canvasPresetId, setCanvasPresetId] = useState("etsy");
  const canvasPreset = useMemo(
    () =>
      CANVAS_PRESETS.find((p) => p.id === canvasPresetId) || CANVAS_PRESETS[0],
    [canvasPresetId]
  );
  const canvasW = canvasPreset.w;
  const canvasH = canvasPreset.h;

  const [alphaSets, setAlphaSets] = useState(Array(MAX_SETS).fill(null));
  const [phrase, setPhrase] = useState("ABCDE");
  const [topOffset, setTopOffset] = useState(Math.round(canvasH * 0.24));
  const [layoutMode, setLayoutMode] = useState("hero");
  const [textAlign, setTextAlign] = useState("center");
  const [alphabetPreviewMode, setAlphabetPreviewMode] = useState(false);
  const [autoAlternate, setAutoAlternate] = useState(true);
  const [alphabetScale, setAlphabetScale] = useState(100);
  const [designScale, setDesignScale] = useState(100);
  const [autoFit, setAutoFit] = useState(true);
  const [letterSpacing, setLetterSpacing] = useState(-12);
  const [lineSpacing, setLineSpacing] = useState(Math.round(canvasH * 0.28));
  const [arcHeight, setArcHeight] = useState(Math.round(canvasH * 0.08));
  const [lineArcEnabled, setLineArcEnabled] = useState([true, false, false]);
  const [lineArcHeights, setLineArcHeights] = useState([
    Math.round(canvasH * 0.08),
    Math.round(canvasH * 0.08),
    Math.round(canvasH * 0.08),
  ]);
  const [overlapAmount, setOverlapAmount] = useState(140);
  const [overlapSizeVariation, setOverlapSizeVariation] = useState(10);
  const [overlapRotationVariation, setOverlapRotationVariation] = useState(8);
  const [overlapSeed, setOverlapSeed] = useState(1);

  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [transparentBg, setTransparentBg] = useState(false);
  const [bgColor, setBgColor] = useState("#f7f4f2");
  const [bgImage, setBgImage] = useState(null);
  const [bgFit, setBgFit] = useState("cover");
  const [bgOpacity, setBgOpacity] = useState(100);

  const [bannerEnabled, setBannerEnabled] = useState(true);
  const [bannerPosition, setBannerPosition] = useState("top");
  const [bannerColor, setBannerColor] = useState("#161c2d");
  const [bannerOpacity, setBannerOpacity] = useState(100);
  const [bannerText, setBannerText] = useState("RETRO FLOWERS ALPHABET");
  const [bannerTextColor, setBannerTextColor] = useState("#ffffff");
  const [bannerHeight, setBannerHeight] = useState(Math.round(canvasH * 0.13));
  const [bannerWidthPct, setBannerWidthPct] = useState(36);
  const [bannerMargin, setBannerMargin] = useState(20);
  const [bannerRadius, setBannerRadius] = useState(24);
  const [bannerFontSize, setBannerFontSize] = useState(
    Math.round(canvasH * 0.07)
  );
  const [bannerFontFamily] = useState("Arial Black, Arial, sans-serif");

  const [banner2Enabled, setBanner2Enabled] = useState(false);
  const [banner2Position, setBanner2Position] = useState("bottom");
  const [banner2Color, setBanner2Color] = useState("#161c2d");
  const [banner2Opacity, setBanner2Opacity] = useState(100);
  const [banner2Text, setBanner2Text] = useState("");
  const [banner2TextColor, setBanner2TextColor] = useState("#ffffff");
  const [banner2Height, setBanner2Height] = useState(Math.round(canvasH * 0.13));
  const [banner2WidthPct, setBanner2WidthPct] = useState(36);
  const [banner2Margin, setBanner2Margin] = useState(20);
  const [banner2Radius, setBanner2Radius] = useState(24);
  const [banner2FontSize, setBanner2FontSize] = useState(
    Math.round(canvasH * 0.07)
  );

  const [banner3Enabled, setBanner3Enabled] = useState(false);
  const [banner3Position, setBanner3Position] = useState("center");
  const [banner3Color, setBanner3Color] = useState("#161c2d");
  const [banner3Opacity, setBanner3Opacity] = useState(100);
  const [banner3Text, setBanner3Text] = useState("");
  const [banner3TextColor, setBanner3TextColor] = useState("#ffffff");
  const [banner3Height, setBanner3Height] = useState(Math.round(canvasH * 0.13));
  const [banner3WidthPct, setBanner3WidthPct] = useState(36);
  const [banner3Margin, setBanner3Margin] = useState(20);
  const [banner3Radius, setBanner3Radius] = useState(24);
  const [banner3FontSize, setBanner3FontSize] = useState(
    Math.round(canvasH * 0.07)
  );

  const [elementsLibrary, setElementsLibrary] = useState([]);
  const [autoTrimAlphaUploads, setAutoTrimAlphaUploads] = useState(true);
  const [autoTrimElementUploads, setAutoTrimElementUploads] = useState(true);
  const [logoAsset, setLogoAsset] = useState(null);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkText, setWatermarkText] = useState(
    "Texas Gal Digital Designs"
  );
  const [watermarkColor, setWatermarkColor] = useState("#c78fa2");
  const [watermarkOpacity, setWatermarkOpacity] = useState(18);
  const [watermarkImageAsset, setWatermarkImageAsset] = useState(null);

  const [zoom, setZoom] = useState(0.28);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const historyInitializedRef = useRef(false);
  const historyTimerRef = useRef(null);
  const isApplyingHistoryRef = useRef(false);
  const lastSnapshotRef = useRef(null);
  const lastHistorySignatureRef = useRef("");
  const [exportName, setExportName] = useState("");
  const [exportDpi] = useState(300);

  const [openSections, setOpenSections] = useState({
    canvas: true,
    upload: true,
    alphabetPreview: true,
    phrase: true,
    layout: true,
    selected: true,
    background: true,
    elements: true,
    banner: false,
    logo: false,
    watermark: false,
    export: true,
  });

  function cloneAlphaSets(source) {
    return source.map((set) =>
      set
        ? {
            ...set,
            letters: set.letters ? { ...set.letters } : {},
          }
        : null
    );
  }

  function cloneItems(source) {
    return source.map((item) => ({ ...item }));
  }

  function captureSnapshot() {
    return {
      canvasPresetId,
      alphaSets: cloneAlphaSets(alphaSets),
      phrase,
      topOffset,
      layoutMode,
      textAlign,
      alphabetPreviewMode,
      autoAlternate,
      alphabetScale,
      designScale,
      autoFit,
      letterSpacing,
      lineSpacing,
      arcHeight,
      lineArcEnabled: [...lineArcEnabled],
      lineArcHeights: [...lineArcHeights],
      overlapAmount,
      overlapSizeVariation,
      overlapRotationVariation,
      overlapSeed,
      items: cloneItems(items),
      selectedId,
      transparentBg,
      bgColor,
      bgImage,
      bgFit,
      bgOpacity,
      bannerEnabled,
      bannerPosition,
      bannerColor,
      bannerOpacity,
      bannerText,
      bannerTextColor,
      bannerHeight,
      bannerWidthPct,
      bannerMargin,
      bannerRadius,
      bannerFontSize,
      banner2Enabled,
      banner2Position,
      banner2Color,
      banner2Opacity,
      banner2Text,
      banner2TextColor,
      banner2Height,
      banner2WidthPct,
      banner2Margin,
      banner2Radius,
      banner2FontSize,
      banner3Enabled,
      banner3Position,
      banner3Color,
      banner3Opacity,
      banner3Text,
      banner3TextColor,
      banner3Height,
      banner3WidthPct,
      banner3Margin,
      banner3Radius,
      banner3FontSize,
      autoTrimAlphaUploads,
      autoTrimElementUploads,
      elementsLibrary: cloneItems(elementsLibrary),
      logoAsset: logoAsset ? { ...logoAsset } : null,
      watermarkEnabled,
      watermarkText,
      watermarkColor,
      watermarkOpacity,
      watermarkImageAsset: watermarkImageAsset ? { ...watermarkImageAsset } : null,
      zoom,
      exportName,
      openSections: { ...openSections },
    };
  }

  function makeSnapshotSignature(snapshot) {
    return JSON.stringify({
      canvasPresetId: snapshot.canvasPresetId,
      alphaSets: snapshot.alphaSets.map((set) =>
        set
          ? {
              id: set.id,
              name: set.name,
              count: set.count,
              keys: Object.keys(set.letters || {}).sort(),
            }
          : null
      ),
      phrase: snapshot.phrase,
      topOffset: snapshot.topOffset,
      layoutMode: snapshot.layoutMode,
      alphabetPreviewMode: snapshot.alphabetPreviewMode,
      autoAlternate: snapshot.autoAlternate,
      alphabetScale: snapshot.alphabetScale,
      designScale: snapshot.designScale,
      autoFit: snapshot.autoFit,
      letterSpacing: snapshot.letterSpacing,
      lineSpacing: snapshot.lineSpacing,
      arcHeight: snapshot.arcHeight,
      lineArcEnabled: snapshot.lineArcEnabled,
      lineArcHeights: snapshot.lineArcHeights,
      overlapAmount: snapshot.overlapAmount,
      overlapSizeVariation: snapshot.overlapSizeVariation,
      overlapRotationVariation: snapshot.overlapRotationVariation,
      overlapSeed: snapshot.overlapSeed,
      items: snapshot.items.map((item) => ({
        id: item.id,
        type: item.type,
        name: item.name,
        char: item.char,
        text: item.text,
        src: item.src || item.image?._src || item.image?.src || null,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        baseWidth: item.baseWidth,
        baseHeight: item.baseHeight,
        widthScale: item.widthScale,
        heightScale: item.heightScale,
        rotation: item.rotation,
        opacity: item.opacity,
        zIndex: item.zIndex,
        fontSize: item.fontSize,
        color: item.color,
      })),
      selectedId: snapshot.selectedId,
      transparentBg: snapshot.transparentBg,
      bgColor: snapshot.bgColor,
      bgImageSrc: snapshot.bgImage?._src || snapshot.bgImage?.src || null,
      bgFit: snapshot.bgFit,
      bgOpacity: snapshot.bgOpacity,
      bannerEnabled: snapshot.bannerEnabled,
      bannerPosition: snapshot.bannerPosition,
      bannerColor: snapshot.bannerColor,
      bannerOpacity: snapshot.bannerOpacity,
      bannerText: snapshot.bannerText,
      bannerTextColor: snapshot.bannerTextColor,
      bannerHeight: snapshot.bannerHeight,
      bannerWidthPct: snapshot.bannerWidthPct,
      bannerMargin: snapshot.bannerMargin,
      bannerRadius: snapshot.bannerRadius,
      bannerFontSize: snapshot.bannerFontSize,
      banner2Enabled: snapshot.banner2Enabled,
      banner2Position: snapshot.banner2Position,
      banner2Color: snapshot.banner2Color,
      banner2Opacity: snapshot.banner2Opacity,
      banner2Text: snapshot.banner2Text,
      banner2TextColor: snapshot.banner2TextColor,
      banner2Height: snapshot.banner2Height,
      banner2WidthPct: snapshot.banner2WidthPct,
      banner2Margin: snapshot.banner2Margin,
      banner2Radius: snapshot.banner2Radius,
      banner2FontSize: snapshot.banner2FontSize,
      banner3Enabled: snapshot.banner3Enabled,
      banner3Position: snapshot.banner3Position,
      banner3Color: snapshot.banner3Color,
      banner3Opacity: snapshot.banner3Opacity,
      banner3Text: snapshot.banner3Text,
      banner3TextColor: snapshot.banner3TextColor,
      banner3Height: snapshot.banner3Height,
      banner3WidthPct: snapshot.banner3WidthPct,
      banner3Margin: snapshot.banner3Margin,
      banner3Radius: snapshot.banner3Radius,
      banner3FontSize: snapshot.banner3FontSize,
      autoTrimAlphaUploads: snapshot.autoTrimAlphaUploads,
      autoTrimElementUploads: snapshot.autoTrimElementUploads,
      elementsLibrary: snapshot.elementsLibrary.map((item) => ({
        id: item.id,
        name: item.name,
        src: item.src || item.image?._src || item.image?.src || null,
      })),
      logoAsset: snapshot.logoAsset
        ? { id: snapshot.logoAsset.id, name: snapshot.logoAsset.name, src: snapshot.logoAsset.src }
        : null,
      watermarkEnabled: snapshot.watermarkEnabled,
      watermarkText: snapshot.watermarkText,
      watermarkColor: snapshot.watermarkColor,
      watermarkOpacity: snapshot.watermarkOpacity,
      watermarkImageAsset: snapshot.watermarkImageAsset
        ? {
            id: snapshot.watermarkImageAsset.id,
            name: snapshot.watermarkImageAsset.name,
            src: snapshot.watermarkImageAsset.src,
          }
        : null,
      zoom: snapshot.zoom,
      exportName: snapshot.exportName,
      openSections: snapshot.openSections,
    });
  }

  function applySnapshot(snapshot) {
    if (!snapshot) return;
    isApplyingHistoryRef.current = true;

    setCanvasPresetId(snapshot.canvasPresetId);
    setAlphaSets(cloneAlphaSets(snapshot.alphaSets));
    setPhrase(snapshot.phrase);
    setTopOffset(snapshot.topOffset);
    setLayoutMode(snapshot.layoutMode);
    setTextAlign(snapshot.textAlign ?? "center");
    setAlphabetPreviewMode(snapshot.alphabetPreviewMode);
    setAutoAlternate(snapshot.autoAlternate);
    setAlphabetScale(snapshot.alphabetScale);
    setDesignScale(snapshot.designScale);
    setAutoFit(snapshot.autoFit);
    setLetterSpacing(snapshot.letterSpacing);
    setLineSpacing(snapshot.lineSpacing);
    setArcHeight(snapshot.arcHeight);
    setLineArcEnabled([...snapshot.lineArcEnabled]);
    setLineArcHeights([...snapshot.lineArcHeights]);
    setOverlapAmount(snapshot.overlapAmount);
    setOverlapSizeVariation(snapshot.overlapSizeVariation);
    setOverlapRotationVariation(snapshot.overlapRotationVariation);
    setOverlapSeed(snapshot.overlapSeed);
    setItems(cloneItems(snapshot.items));
    setSelectedId(snapshot.selectedId);
    setTransparentBg(snapshot.transparentBg);
    setBgColor(snapshot.bgColor);
    setBgImage(snapshot.bgImage || null);
    setBgFit(snapshot.bgFit);
    setBgOpacity(snapshot.bgOpacity);
    setBannerEnabled(snapshot.bannerEnabled);
    setBannerPosition(snapshot.bannerPosition);
    setBannerColor(snapshot.bannerColor);
    setBannerOpacity(snapshot.bannerOpacity);
    setBannerText(snapshot.bannerText);
    setBannerTextColor(snapshot.bannerTextColor);
    setBannerHeight(snapshot.bannerHeight);
    setBannerWidthPct(snapshot.bannerWidthPct);
    setBannerMargin(snapshot.bannerMargin);
    setBannerRadius(snapshot.bannerRadius);
    setBannerFontSize(snapshot.bannerFontSize);
    setBanner2Enabled(snapshot.banner2Enabled);
    setBanner2Position(snapshot.banner2Position);
    setBanner2Color(snapshot.banner2Color);
    setBanner2Opacity(snapshot.banner2Opacity);
    setBanner2Text(snapshot.banner2Text);
    setBanner2TextColor(snapshot.banner2TextColor);
    setBanner2Height(snapshot.banner2Height);
    setBanner2WidthPct(snapshot.banner2WidthPct);
    setBanner2Margin(snapshot.banner2Margin);
    setBanner2Radius(snapshot.banner2Radius);
    setBanner2FontSize(snapshot.banner2FontSize);
    setBanner3Enabled(snapshot.banner3Enabled);
    setBanner3Position(snapshot.banner3Position);
    setBanner3Color(snapshot.banner3Color);
    setBanner3Opacity(snapshot.banner3Opacity);
    setBanner3Text(snapshot.banner3Text);
    setBanner3TextColor(snapshot.banner3TextColor);
    setBanner3Height(snapshot.banner3Height);
    setBanner3WidthPct(snapshot.banner3WidthPct);
    setBanner3Margin(snapshot.banner3Margin);
    setBanner3Radius(snapshot.banner3Radius);
    setBanner3FontSize(snapshot.banner3FontSize);
    setAutoTrimAlphaUploads(snapshot.autoTrimAlphaUploads ?? true);
    setAutoTrimElementUploads(snapshot.autoTrimElementUploads ?? true);
    setElementsLibrary(cloneItems(snapshot.elementsLibrary));
    setLogoAsset(snapshot.logoAsset ? { ...snapshot.logoAsset } : null);
    setWatermarkEnabled(snapshot.watermarkEnabled);
    setWatermarkText(snapshot.watermarkText);
    setWatermarkColor(snapshot.watermarkColor);
    setWatermarkOpacity(snapshot.watermarkOpacity);
    setWatermarkImageAsset(snapshot.watermarkImageAsset ? { ...snapshot.watermarkImageAsset } : null);
    setZoom(snapshot.zoom);
    setExportName(snapshot.exportName);
    setOpenSections({ ...snapshot.openSections });

    lastSnapshotRef.current = snapshot;
    lastHistorySignatureRef.current = makeSnapshotSignature(snapshot);

    window.setTimeout(() => {
      isApplyingHistoryRef.current = false;
    }, 0);
  }

  function undoAction() {
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    const current = captureSnapshot();
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, current]);
    applySnapshot(previous);
  }

  function redoAction() {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    const current = captureSnapshot();
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, current]);
    applySnapshot(next);
  }

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) || null,
    [items, selectedId]
  );

  useEffect(() => {
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
    }

    const currentSnapshot = captureSnapshot();
    const currentSignature = makeSnapshotSignature(currentSnapshot);

    if (!historyInitializedRef.current) {
      historyInitializedRef.current = true;
      lastSnapshotRef.current = currentSnapshot;
      lastHistorySignatureRef.current = currentSignature;
      return;
    }

    if (isApplyingHistoryRef.current || draggingId) return;
    if (currentSignature === lastHistorySignatureRef.current) return;

    historyTimerRef.current = window.setTimeout(() => {
      if (isApplyingHistoryRef.current || draggingId) return;
      const stableSnapshot = captureSnapshot();
      const stableSignature = makeSnapshotSignature(stableSnapshot);
      if (stableSignature === lastHistorySignatureRef.current) return;

      setUndoStack((prev) => {
        const next = [...prev, lastSnapshotRef.current].filter(Boolean);
        return next.length > 60 ? next.slice(next.length - 60) : next;
      });
      setRedoStack([]);
      lastSnapshotRef.current = stableSnapshot;
      lastHistorySignatureRef.current = stableSignature;
    }, 180);

    return () => {
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    };
  }, [
    canvasPresetId,
    alphaSets,
    phrase,
    topOffset,
    layoutMode,
    textAlign,
    alphabetPreviewMode,
    autoAlternate,
    alphabetScale,
    designScale,
    autoFit,
    letterSpacing,
    lineSpacing,
    arcHeight,
    lineArcEnabled,
    lineArcHeights,
    overlapAmount,
    overlapSizeVariation,
    overlapRotationVariation,
    overlapSeed,
    items,
    selectedId,
    transparentBg,
    bgColor,
    bgImage,
    bgFit,
    bgOpacity,
    bannerEnabled,
    bannerPosition,
    bannerColor,
    bannerOpacity,
    bannerText,
    bannerTextColor,
    bannerHeight,
    bannerWidthPct,
    bannerMargin,
    bannerRadius,
    bannerFontSize,
    banner2Enabled,
    banner2Position,
    banner2Color,
    banner2Opacity,
    banner2Text,
    banner2TextColor,
    banner2Height,
    banner2WidthPct,
    banner2Margin,
    banner2Radius,
    banner2FontSize,
    banner3Enabled,
    banner3Position,
    banner3Color,
    banner3Opacity,
    banner3Text,
    banner3TextColor,
    banner3Height,
    banner3WidthPct,
    banner3Margin,
    banner3Radius,
    banner3FontSize,
    autoTrimAlphaUploads,
    autoTrimElementUploads,
    elementsLibrary,
    logoAsset,
    watermarkEnabled,
    watermarkText,
    watermarkColor,
    watermarkOpacity,
    watermarkImageAsset,
    zoom,
    exportName,
    openSections,
    draggingId,
  ]);

  useEffect(() => {
    const nextLineSpacing = Math.round(canvasH * 0.22);
    const nextArcHeight = Math.round(canvasH * 0.08);
    setTopOffset(Math.round(canvasH * 0.24));
    setLineSpacing(nextLineSpacing);
    setArcHeight(nextArcHeight);
    setLineArcHeights([nextArcHeight, nextArcHeight, nextArcHeight]);
    setOverlapAmount(Math.round(canvasW * 0.04));
    setBannerHeight(Math.round(canvasH * 0.13));
    setBannerFontSize(Math.round(canvasH * 0.07));
    setBanner2Height(Math.round(canvasH * 0.13));
    setBanner2FontSize(Math.round(canvasH * 0.07));
    setBanner3Height(Math.round(canvasH * 0.13));
    setBanner3FontSize(Math.round(canvasH * 0.07));
    setZoom(canvasW >= 3300 ? 0.22 : 0.28);
  }, [canvasW, canvasH]);

  useEffect(() => {
    if (isApplyingHistoryRef.current) return;

    const decorative = items.filter((item) => item.type !== "letter");

    const nextLetters =
      alphabetPreviewMode
        ? buildAlphabetItems({
            alphaSets,
            autoAlternate,
            canvasW,
            canvasH,
            alphabetScale,
          })
        : buildWordItems({
            phrase,
            alphaSets,
            autoAlternate,
            designScale,
            autoFit,
            letterSpacing,
            lineSpacing,
            layoutMode,
            arcHeight,
            topOffset,
            lineArcEnabled,
            lineArcHeights,
            overlapAmount,
            overlapSizeVariation,
            overlapRotationVariation,
            overlapSeed,
            canvasW,
            canvasH,
            textAlign,
          });

    setItems(normalizeLayerOrder([...nextLetters, ...decorative]));
    setSelectedId((current) => (decorative.some((item) => item.id === current) ? current : null));
  }, [
    phrase,
    alphaSets,
    autoAlternate,
    alphabetScale,
    designScale,
    autoFit,
    letterSpacing,
    lineSpacing,
    layoutMode,
    alphabetPreviewMode,
    arcHeight,
    topOffset,
    lineArcEnabled,
    lineArcHeights,
    overlapAmount,
    overlapSizeVariation,
    overlapRotationVariation,
    overlapSeed,
    canvasW,
    canvasH,
    textAlign,
  ]);

  useEffect(() => {
    drawToCanvas(previewCanvasRef.current, canvasW, canvasH, items, selectedId);
  }, [
    items,
    selectedId,
    transparentBg,
    bgColor,
    bgImage,
    bgFit,
    bgOpacity,
    bannerEnabled,
    bannerPosition,
    bannerColor,
    bannerOpacity,
    bannerText,
    bannerTextColor,
    bannerHeight,
    bannerWidthPct,
    bannerMargin,
    bannerRadius,
    bannerFontSize,
    bannerFontFamily,
    banner2Enabled,
    banner2Position,
    banner2Color,
    banner2Opacity,
    banner2Text,
    banner2TextColor,
    banner2Height,
    banner2WidthPct,
    banner2Margin,
    banner2Radius,
    banner2FontSize,
    banner3Enabled,
    banner3Position,
    banner3Color,
    banner3Opacity,
    banner3Text,
    banner3TextColor,
    banner3Height,
    banner3WidthPct,
    banner3Margin,
    banner3Radius,
    banner3FontSize,
    canvasW,
    canvasH,
    watermarkEnabled,
    watermarkText,
    watermarkColor,
    watermarkOpacity,
  ]);

  function toggleSection(key) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function loadAlphaSet(slotIndex, fileList, sourceLabel) {
    const rawFiles = Array.from(fileList || []);
    const pngFiles = rawFiles.filter((f) => /\.png$/i.test(f.name));
    const usableFiles = pngFiles.filter(
      (f) => !isHiddenMacPath(f.webkitRelativePath || f.name)
    );

    const letters = {};
    const skipped = [];
    let trimmedCount = 0;

    for (const file of usableFiles) {
      const key = parseLetterKey(file.name);
      if (!key) {
        skipped.push(file.name);
        continue;
      }
      try {
        let { img, src } = await readImageFile(file);
        if (autoTrimAlphaUploads) {
          const trimmed = await trimTransparentImage(img, src);
          img = trimmed.img;
          src = trimmed.src;
          if (trimmed.trimmed) trimmedCount += 1;
        }
        img._src = src;
        letters[key] = img;
      } catch (err) {
        console.error("Could not load image", file.name, err);
      }
    }

    const foundCount = Object.keys(letters).length;
    const hasUppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
      .split("")
      .filter((k) => letters[k]).length;

    const name = getDisplayNameFromFiles(
      usableFiles.length ? usableFiles : rawFiles,
      `Set ${slotIndex + 1}`
    );

    let status = "No valid letter PNGs found.";
    if (foundCount > 0) {
      status = `${foundCount} valid letters found`;
      if (hasUppercase > 0) status += ` • Uppercase found: ${hasUppercase}`;
      if (trimmedCount > 0) status += ` • Trimmed: ${trimmedCount}`;
      if (skipped.length > 0) status += ` • Skipped: ${skipped.length}`;
      status += ` • Loaded from ${sourceLabel}`;
    }

    const newSet = {
      id: uid(),
      name,
      letters,
      count: foundCount,
      uppercaseCount: hasUppercase,
      trimmedCount,
      status,
      sourceLabel,
      skippedCount: skipped.length,
    };

    setAlphaSets((prev) => {
      const next = [...prev];
      next[slotIndex] = newSet;
      return next;
    });
  }

  function removeAlphaSet(slotIndex) {
    setAlphaSets((prev) => {
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
  }

  async function handleBgImage(file) {
    if (!file) return;
    try {
      const { img, src } = await readImageFile(file);
      img._src = src;
      setBgImage(img);
      setTransparentBg(false);
    } catch (err) {
      console.error(err);
    }
  }

  function clearBackgroundImage() {
    setBgImage(null);
    if (bgFileInputRef.current) bgFileInputRef.current.value = "";
  }

  async function handleElementUploads(fileList) {
    const files = Array.from(fileList || []).filter((f) => /\.png$/i.test(f.name));
    if (!files.length) return;

    const loaded = [];
    for (const file of files) {
      try {
        let { img, src } = await readImageFile(file);
        let wasTrimmed = false;
        if (autoTrimElementUploads) {
          const trimmed = await trimTransparentImage(img, src);
          img = trimmed.img;
          src = trimmed.src;
          wasTrimmed = !!trimmed.trimmed;
        }
        img._src = src;
        loaded.push({
          id: uid(),
          name: file.name.replace(/\.[^/.]+$/, ""),
          image: img,
          src,
          wasTrimmed,
        });
      } catch (err) {
        console.error(err);
      }
    }

    setElementsLibrary((prev) => [...prev, ...loaded]);
    if (elementUploadRef.current) elementUploadRef.current.value = "";
  }

  function addElementToCanvas(asset) {
    const baseH = canvasH * 0.14;
    const scale = baseH / asset.image.height;
    const width = asset.image.width * scale;
    const height = asset.image.height * scale;

    const newItem = {
      id: uid(),
      type: "element",
      name: asset.name,
      image: asset.image,
      src: asset.src,
      x: canvasW * 0.74,
      y: canvasH * 0.74,
      width,
      height,
      baseWidth: width,
      baseHeight: height,
      widthScale: 100,
      heightScale: 100,
      rotation: 0,
      opacity: 1,
    };

    setItems((prev) => [...prev, { ...newItem, zIndex: getNextLayerZ(prev) }]);
    setSelectedId(newItem.id);
  }

  function removeCanvasItemsByType(type) {
    setItems((prev) => {
      const next = prev.filter((item) => item.type !== type);
      return normalizeLayerOrder(next);
    });
    setSelectedId((prev) => {
      const selected = items.find((item) => item.id === prev);
      return selected?.type === type ? null : prev;
    });
  }

  function removeCanvasItemsBySource(type, src) {
    if (!src) return;
    setItems((prev) => {
      const next = prev.filter(
        (item) => !(item.type === type && item.src === src)
      );
      return normalizeLayerOrder(next);
    });
    setSelectedId((prev) => {
      const selected = items.find((item) => item.id === prev);
      return selected?.type === type && selected?.src === src ? null : prev;
    });
  }

  function removeLibraryElement(assetId) {
    const asset = elementsLibrary.find((el) => el.id === assetId);
    setElementsLibrary((prev) => prev.filter((el) => el.id !== assetId));
    if (asset?.src) {
      removeCanvasItemsBySource("element", asset.src);
    }
  }

  async function handleLogoUpload(file) {
    if (!file) return;
    try {
      const { img, src } = await readImageFile(file);
      img._src = src;
      setLogoAsset({
        id: uid(),
        name: file.name.replace(/\.[^/.]+$/, ""),
        image: img,
        src,
      });
    } catch (err) {
      console.error(err);
    }

    if (logoUploadRef.current) logoUploadRef.current.value = "";
  }

  function addLogoToCanvas() {
    if (!logoAsset) return;

    const baseH = canvasH * 0.12;
    const scale = baseH / logoAsset.image.height;
    const width = logoAsset.image.width * scale;
    const height = logoAsset.image.height * scale;

    const newItem = {
      id: uid(),
      type: "logo",
      name: logoAsset.name,
      image: logoAsset.image,
      src: logoAsset.src,
      x: canvasW - width - canvasW * 0.04,
      y: canvasH - height - canvasH * 0.04,
      width,
      height,
      baseWidth: width,
      baseHeight: height,
      widthScale: 100,
      heightScale: 100,
      rotation: 0,
      opacity: 1,
    };

    setItems((prev) => [...prev, { ...newItem, zIndex: getNextLayerZ(prev) }]);
    setSelectedId(newItem.id);
  }

  async function handleWatermarkImageUpload(file) {
    if (!file) return;
    try {
      const { img, src } = await readImageFile(file);
      img._src = src;
      setWatermarkImageAsset({
        id: uid(),
        name: file.name.replace(/\.[^/.]+$/, ""),
        image: img,
        src,
      });
    } catch (err) {
      console.error(err);
    }

    if (watermarkImageUploadRef.current) watermarkImageUploadRef.current.value = "";
  }

  function addWatermarkImageToCanvas() {
    if (!watermarkImageAsset) return;

    const baseW = canvasW * 0.34;
    const scale = baseW / watermarkImageAsset.image.width;
    const width = watermarkImageAsset.image.width * scale;
    const height = watermarkImageAsset.image.height * scale;

    const newItem = {
      id: uid(),
      type: "watermark-image",
      name: watermarkImageAsset.name || "Watermark Image",
      image: watermarkImageAsset.image,
      src: watermarkImageAsset.src,
      x: (canvasW - width) / 2,
      y: (canvasH - height) / 2,
      width,
      height,
      baseWidth: width,
      baseHeight: height,
      widthScale: 100,
      heightScale: 100,
      rotation: 0,
      opacity: Math.max(0.05, watermarkOpacity / 100),
    };

    setItems((prev) => [...prev, { ...newItem, zIndex: getNextLayerZ(prev) }]);
    setSelectedId(newItem.id);
  }

  function removeWatermarkImageAsset() {
    const src = watermarkImageAsset?.src;
    setWatermarkImageAsset(null);
    if (watermarkImageUploadRef.current) {
      watermarkImageUploadRef.current.value = "";
    }
    if (src) {
      removeCanvasItemsBySource("watermark-image", src);
    }
  }

  function addWatermarkToCanvas() {
    const newItem = {
      id: uid(),
      type: "watermark",
      name: "Watermark",
      text: watermarkText,
      color: watermarkColor,
      x: canvasW * 0.28,
      y: canvasH * 0.38,
      width: canvasW * 0.45,
      height: canvasH * 0.08,
      rotation: -18,
      opacity: watermarkOpacity / 100,
      fontSize: Math.round(canvasH * 0.045),
    };

    setItems((prev) => [...prev, { ...newItem, zIndex: getNextLayerZ(prev) }]);
    setSelectedId(newItem.id);
  }

  function removeWatermarkTextLayers() {
    removeCanvasItemsByType("watermark");
  }

  function drawBannerBlock(ctx, {
    enabled,
    position,
    color,
    opacity,
    text,
    textColor,
    height,
    widthPct,
    margin,
    radius,
    fontSize,
    targetW,
    targetH,
  }) {
    if (!enabled || !text?.trim()) return;

    const rect = bannerRect(
      position,
      targetW,
      targetH,
      height,
      widthPct / 100,
      margin
    );

    ctx.save();
    ctx.globalAlpha = opacity / 100;
    ctx.fillStyle = color;
    drawRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, radius);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = textColor;
    ctx.font = `700 ${fontSize}px ${bannerFontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2 + 4);
    ctx.restore();
  }

  function drawToCanvas(canvas, targetW, targetH, drawItems, selectedDrawId) {
    if (!canvas) return;
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    ctx.clearRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (!transparentBg) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, targetW, targetH);

      if (bgImage) {
        const rect =
          bgFit === "contain"
            ? fitRectContain(bgImage.width, bgImage.height, targetW, targetH)
            : fitRectCover(bgImage.width, bgImage.height, targetW, targetH);

        ctx.save();
        ctx.globalAlpha = bgOpacity / 100;
        ctx.drawImage(bgImage, rect.x, rect.y, rect.w, rect.h);
        ctx.restore();
      }
    }

    drawBannerBlock(ctx, {
      enabled: bannerEnabled,
      position: bannerPosition,
      color: bannerColor,
      opacity: bannerOpacity,
      text: bannerText,
      textColor: bannerTextColor,
      height: bannerHeight,
      widthPct: bannerWidthPct,
      margin: bannerMargin,
      radius: bannerRadius,
      fontSize: bannerFontSize,
      targetW,
      targetH,
    });

    drawBannerBlock(ctx, {
      enabled: banner2Enabled,
      position: banner2Position,
      color: banner2Color,
      opacity: banner2Opacity,
      text: banner2Text,
      textColor: banner2TextColor,
      height: banner2Height,
      widthPct: banner2WidthPct,
      margin: banner2Margin,
      radius: banner2Radius,
      fontSize: banner2FontSize,
      targetW,
      targetH,
    });

    drawBannerBlock(ctx, {
      enabled: banner3Enabled,
      position: banner3Position,
      color: banner3Color,
      opacity: banner3Opacity,
      text: banner3Text,
      textColor: banner3TextColor,
      height: banner3Height,
      widthPct: banner3WidthPct,
      margin: banner3Margin,
      radius: banner3Radius,
      fontSize: banner3FontSize,
      targetW,
      targetH,
    });

    getOrderedItems(drawItems).forEach((item) => {
      ctx.save();
      ctx.globalAlpha = item.opacity ?? 1;
      ctx.translate(item.x + item.width / 2, item.y + item.height / 2);
      ctx.rotate(((item.rotation || 0) * Math.PI) / 180);

      if (item.type === "watermark") {
        ctx.fillStyle = item.color || "#c78fa2";
        ctx.font = `700 ${item.fontSize || Math.round(targetH * 0.045)}px Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(item.text || "Watermark", 0, 0);
      } else if (item.type === "watermark-image") {
        ctx.drawImage(
          item.image,
          -item.width / 2,
          -item.height / 2,
          item.width,
          item.height
        );
      } else {
        ctx.drawImage(
          item.image,
          -item.width / 2,
          -item.height / 2,
          item.width,
          item.height
        );
      }

      if (item.id === selectedDrawId) {
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = Math.max(3, targetW * 0.0015);
        ctx.strokeRect(
          -item.width / 2 - 3,
          -item.height / 2 - 3,
          item.width + 6,
          item.height + 6
        );
      }

      ctx.restore();
    });

    if (watermarkEnabled && watermarkText) {
      ctx.save();
      ctx.globalAlpha = watermarkOpacity / 100;
      ctx.fillStyle = watermarkColor;
      ctx.font = `700 ${Math.round(targetH * 0.045)}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.translate(targetW * 0.5, targetH * 0.5);
      ctx.rotate((-18 * Math.PI) / 180);
      ctx.fillText(watermarkText, 0, 0);
      ctx.restore();
    }
  }

  function getCanvasPoint(evt) {
    const canvas = previewCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (evt.clientX - rect.left) / zoom,
      y: (evt.clientY - rect.top) / zoom,
    };
  }

  function getRotatedLocalPoint(px, py, item) {
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    const dx = px - cx;
    const dy = py - cy;
    const angle = ((-(item.rotation || 0)) * Math.PI) / 180;
    const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
    const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
    return {
      localX: rx + item.width / 2,
      localY: ry + item.height / 2,
    };
  }

  function pointInRotatedItem(px, py, item) {
    const { localX, localY } = getRotatedLocalPoint(px, py, item);

    if (item.type === "watermark") {
      const padX = Math.max(18, item.width * 0.08);
      const padY = Math.max(14, item.height * 0.25);
      return (
        localX >= -padX &&
        localX <= item.width + padX &&
        localY >= -padY &&
        localY <= item.height + padY
      );
    }

    return (
      localX >= 0 &&
      localX <= item.width &&
      localY >= 0 &&
      localY <= item.height
    );
  }

  function getHitCanvasForImage(item) {
    const src = item?.src || item?.image?._src || item?.image?.src || null;
    const img = item?.image;
    if (!src || !img) return null;

    const cacheKey = `${src}__${img.width}x${img.height}`;
    if (hitCanvasCacheRef.current.has(cacheKey)) {
      return hitCanvasCacheRef.current.get(cacheKey);
    }

    const hitCanvas = document.createElement("canvas");
    hitCanvas.width = img.width;
    hitCanvas.height = img.height;
    const hitCtx = hitCanvas.getContext("2d", { willReadFrequently: true });
    if (!hitCtx) return null;

    hitCtx.clearRect(0, 0, hitCanvas.width, hitCanvas.height);
    hitCtx.drawImage(img, 0, 0, hitCanvas.width, hitCanvas.height);
    hitCanvasCacheRef.current.set(cacheKey, hitCanvas);
    return hitCanvas;
  }

  function pointHitsVisiblePixels(px, py, item) {
    if (!pointInRotatedItem(px, py, item)) return false;

    if (!item.image || item.type === "watermark") return true;

    const { localX, localY } = getRotatedLocalPoint(px, py, item);

    const hitCanvas = getHitCanvasForImage(item);
    if (!hitCanvas) return true;

    const hitCtx = hitCanvas.getContext("2d", { willReadFrequently: true });
    if (!hitCtx) return true;

    const sampleX = Math.min(
      hitCanvas.width - 1,
      Math.max(0, Math.floor((localX / item.width) * hitCanvas.width))
    );
    const sampleY = Math.min(
      hitCanvas.height - 1,
      Math.max(0, Math.floor((localY / item.height) * hitCanvas.height))
    );

    const alpha = hitCtx.getImageData(sampleX, sampleY, 1, 1).data[3];
    return alpha >= 20;
  }

  function handleCanvasMouseDown(evt) {
    const p = getCanvasPoint(evt);
    const found = getOrderedItems(items)
      .map((item) => ({
        item,
        zIndex: item?.zIndex ?? 0,
        rank:
          item.type === "watermark"
            ? 3
            : item.type === "watermark-image"
            ? 2
            : 1,
      }))
      .sort((a, b) => {
        if (a.rank !== b.rank) return b.rank - a.rank;
        return b.zIndex - a.zIndex;
      })
      .find(({ item }) => pointHitsVisiblePixels(p.x, p.y, item))?.item;

    if (found) {
      setSelectedId(found.id);
      setDraggingId(found.id);
      setDragOffset({ x: p.x - found.x, y: p.y - found.y });
    } else {
      setSelectedId(null);
    }
  }

  function handleCanvasMouseMove(evt) {
    if (!draggingId) return;
    const p = getCanvasPoint(evt);

    setItems((prev) =>
      prev.map((item) =>
        item.id !== draggingId
          ? item
          : {
              ...item,
              x: p.x - dragOffset.x,
              y: p.y - dragOffset.y,
            }
      )
    );
  }

  function handleCanvasMouseUp() {
    setDraggingId(null);
  }

  function updateSelectedItem(patch) {
    if (!selectedId) return;
    setItems((prev) =>
      prev.map((item) =>
        item.id === selectedId ? { ...item, ...patch } : item
      )
    );
  }

  function applyWidthScale(value) {
    if (!selectedItem) return;
    const baseWidth = selectedItem.baseWidth || selectedItem.width;
    updateSelectedItem({
      width: baseWidth * (value / 100),
      widthScale: value,
    });
  }

  function applyHeightScale(value) {
    if (!selectedItem) return;
    const baseHeight = selectedItem.baseHeight || selectedItem.height;
    updateSelectedItem({
      height: baseHeight * (value / 100),
      heightScale: value,
    });
  }

  function applyUniformScale(value) {
    if (!selectedItem) return;
    const baseWidth = selectedItem.baseWidth || selectedItem.width;
    const baseHeight = selectedItem.baseHeight || selectedItem.height;
    updateSelectedItem({
      width: baseWidth * (value / 100),
      height: baseHeight * (value / 100),
      widthScale: value,
      heightScale: value,
    });
  }

  async function trimSelectedImageLayer() {
    if (!selectedItem) return;
    if (!["element", "logo", "watermark-image"].includes(selectedItem.type)) return;
    if (!selectedItem.image) return;

    try {
      const currentSrc = selectedItem.src || selectedItem.image?._src || selectedItem.image?.src;
      const trimmed = await trimTransparentImage(selectedItem.image, currentSrc);
      if (!trimmed.trimmed) {
        window.alert("This layer does not have enough extra transparent space to trim.");
        return;
      }

      const widthScale = selectedItem.widthScale || 100;
      const heightScale = selectedItem.heightScale || 100;
      const nextBaseWidth = trimmed.img.width;
      const nextBaseHeight = trimmed.img.height;

      setItems((prev) =>
        prev.map((item) =>
          item.id !== selectedItem.id
            ? item
            : {
                ...item,
                image: trimmed.img,
                src: trimmed.src,
                baseWidth: nextBaseWidth,
                baseHeight: nextBaseHeight,
                width: nextBaseWidth * (widthScale / 100),
                height: nextBaseHeight * (heightScale / 100),
              }
        )
      );

      if (selectedItem.type === "logo") {
        setLogoAsset((prev) =>
          prev ? { ...prev, image: trimmed.img, src: trimmed.src } : prev
        );
      }
      if (selectedItem.type === "watermark-image") {
        setWatermarkImageAsset((prev) =>
          prev ? { ...prev, image: trimmed.img, src: trimmed.src } : prev
        );
      }
    } catch (err) {
      console.error(err);
    }
  }

  function bringForward() {
    if (!selectedId) return;
    setItems((prev) => {
      const ordered = getOrderedItems(prev);
      const idx = ordered.findIndex((i) => i.id === selectedId);
      if (idx < 0 || idx === ordered.length - 1) return prev;
      const current = ordered[idx];
      const above = ordered[idx + 1];
      const swapped = prev.map((item) => {
        if (item.id === current.id) return { ...item, zIndex: above.zIndex ?? (idx + 1) };
        if (item.id === above.id) return { ...item, zIndex: current.zIndex ?? idx };
        return item;
      });
      return normalizeLayerOrder(swapped);
    });
  }

  function sendBackward() {
    if (!selectedId) return;
    setItems((prev) => {
      const ordered = getOrderedItems(prev);
      const idx = ordered.findIndex((i) => i.id === selectedId);
      if (idx <= 0) return prev;
      const current = ordered[idx];
      const below = ordered[idx - 1];
      const swapped = prev.map((item) => {
        if (item.id === current.id) return { ...item, zIndex: below.zIndex ?? (idx - 1) };
        if (item.id === below.id) return { ...item, zIndex: current.zIndex ?? idx };
        return item;
      });
      return normalizeLayerOrder(swapped);
    });
  }

  function removeSelectedItem() {
    if (!selectedId) return;
    setItems((prev) => prev.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }

  function rerandomizeOverlap() {
    setOverlapSeed((prev) => prev + 1);
  }

  async function exportPng() {
    const cleanName = exportName.trim();
    if (!cleanName) {
      window.alert("Please enter a file name before exporting.");
      return;
    }

    const offscreen = document.createElement("canvas");
    drawToCanvas(offscreen, canvasW, canvasH, items, null);
    await downloadCanvasAsPng(offscreen, `${cleanName}.png`, exportDpi);
  }

  const loadedCount = alphaSets.filter(Boolean).length;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "430px minmax(0, 1fr)",
        gap: 20,
        padding: 20,
        fontFamily: "Inter, sans-serif",
        background: "#f6f3f1",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          height: "calc(100vh - 40px)",
          overflowY: "auto",
          paddingRight: 6,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              background: "#fff",
              padding: 16,
              borderRadius: 18,
              boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
            }}
          >
            <img
              src="/logo.png"
              alt="Logo"
              style={{
                width: 56,
                height: 56,
                objectFit: "contain",
                borderRadius: 12,
                background: "#fff7f8",
                padding: 4,
                border: "1px solid #f0d9df",
              }}
            />
            <div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>
                Alphabet Mockup
              </div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>
                & Word Designer
              </div>
            </div>
          </div>

          <CollapseSection
            title="1. Canvas Size"
            open={openSections.canvas}
            onToggle={() => toggleSection("canvas")}
          >
            <select
              value={canvasPresetId}
              onChange={(e) => setCanvasPresetId(e.target.value)}
              style={selectStyle}
            >
              {CANVAS_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>

            <div style={{ fontSize: 12, marginTop: 6, color: "#6d7690" }}>
              Current canvas: {canvasW} × {canvasH} px • Export: {exportDpi} DPI
            </div>
          </CollapseSection>

          <CollapseSection
            title="2. Upload Alpha Sets"
            open={openSections.upload}
            onToggle={() => toggleSection("upload")}
          >
            <div style={{ fontSize: 12, color: "#8a8fa3", marginBottom: 10 }}>
              Hidden Mac files like __MACOSX, .DS_Store, and ._ files are ignored automatically.
            </div>
            <label style={checkRow}>
              <input
                type="checkbox"
                checked={autoTrimAlphaUploads}
                onChange={(e) => setAutoTrimAlphaUploads(e.target.checked)}
              />
              <span>Auto-trim extra transparent space on alpha upload</span>
            </label>
            <div style={{ fontSize: 12, color: "#6d7690", marginBottom: 10 }}>
              This helps letters size more accurately when they are placed on the canvas.
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {Array.from({ length: MAX_SETS }).map((_, idx) => {
                const set = alphaSets[idx];
                return (
                  <div
                    key={idx}
                    style={{
                      border: "1px dashed #d9c9c1",
                      borderRadius: 18,
                      padding: 12,
                      background: set ? "#f6f3f2" : "#fff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          Slot {idx + 1}
                        </div>
                        <div style={{ fontSize: 12, color: "#7b8091" }}>
                          {set
                            ? `${set.name} • ${set.count} valid letters`
                            : "Choose PNG files or choose a folder"}
                        </div>
                      </div>

                      {set ? (
                        <button
                          onClick={() => removeAlphaSet(idx)}
                          style={smallGhostBtn}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        onClick={() => fileInputRefs.current[idx]?.click()}
                        style={primaryBtn}
                      >
                        Choose PNGs
                      </button>

                      <button
                        onClick={() => fileInputRefs.current[idx + MAX_SETS]?.click()}
                        style={secondaryBtn}
                      >
                        Choose Folder
                      </button>
                    </div>

                    <input
                      ref={(el) => (fileInputRefs.current[idx] = el)}
                      type="file"
                      accept=".png"
                      multiple
                      style={{ display: "none" }}
                      onChange={(e) => loadAlphaSet(idx, e.target.files, "files")}
                    />

                    <input
                      ref={(el) => (fileInputRefs.current[idx + MAX_SETS] = el)}
                      type="file"
                      accept=".png"
                      multiple
                      webkitdirectory="true"
                      directory="true"
                      style={{ display: "none" }}
                      onChange={(e) => loadAlphaSet(idx, e.target.files, "folder")}
                    />

                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 12,
                        color: set?.count ? "#5f6d55" : "#8a8fa3",
                      }}
                    >
                      {set ? set.status : "No set loaded yet."}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: "#6d7690" }}>
              {loadedCount} of {MAX_SETS} slots loaded
            </div>
          </CollapseSection>
          <CollapseSection
            title="3. Alphabet Preview Mode"
            open={openSections.alphabetPreview}
            onToggle={() => toggleSection("alphabetPreview")}
          >
            <label style={checkRow}>
              <input
                type="checkbox"
                checked={alphabetPreviewMode}
                onChange={(e) => setAlphabetPreviewMode(e.target.checked)}
              />
              <span>Show full alphabet preview instead of a typed word</span>
            </label>

            <div style={{ fontSize: 12, color: "#6d7690", marginTop: 8 }}>
              Turn this on when you want to preview A–Z. Turn it off to design a word or phrase.
            </div>

            {alphabetPreviewMode ? (
              <SliderRow
                label="Alphabet size"
                min={60}
                max={150}
                value={alphabetScale}
                setValue={setAlphabetScale}
              />
            ) : null}
          </CollapseSection>

          {!alphabetPreviewMode ? (
            <CollapseSection
              title="4. Word or Phrase"
              open={openSections.phrase}
              onToggle={() => toggleSection("phrase")}
            >
              <div style={{ fontSize: 13, color: "#6d7690", marginBottom: 8 }}>
                Use a new line or the | symbol to make up to 3 lines. Example: JESUS | IS | KING or GOOD | MORNING | Y'ALL
              </div>
              <textarea
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                rows={5}
                style={textareaStyle}
                placeholder="JESUS | IS | KING or GOOD | MORNING | Y'ALL"
              />
            </CollapseSection>
          ) : null}

          <CollapseSection
            title="5. Layout"
            open={openSections.layout}
            onToggle={() => toggleSection("layout")}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 10,
              }}
            >
              <button
                onClick={() => setLayoutMode("hero")}
                style={layoutMode === "hero" ? selectedTile : tileBtn}
              >
                <div style={{ fontWeight: 700 }}>Hero Row</div>
                <div style={tileSub}>Single row mockup</div>
              </button>

              <button
                onClick={() => setLayoutMode("arc")}
                style={layoutMode === "arc" ? selectedTile : tileBtn}
              >
                <div style={{ fontWeight: 700 }}>Arc</div>
                <div style={tileSub}>Gentle curved layout</div>
              </button>

              <button
                onClick={() => setLayoutMode("overlap")}
                style={layoutMode === "overlap" ? selectedTile : tileBtn}
              >
                <div style={{ fontWeight: 700 }}>Overlap</div>
                <div style={tileSub}>Closer, layered look</div>
              </button>
            </div>

            <label style={checkRow}>
              <input
                type="checkbox"
                checked={autoAlternate}
                onChange={(e) => setAutoAlternate(e.target.checked)}
              />
              <span>Auto alternate sets</span>
            </label>

            {!alphabetPreviewMode ? (
              <label style={checkRow}>
                <input
                  type="checkbox"
                  checked={autoFit}
                  onChange={(e) => setAutoFit(e.target.checked)}
                />
                <span>Auto-fit design to canvas</span>
              </label>
            ) : null}

            {alphabetPreviewMode ? (
              <div style={{ fontSize: 12, color: "#6d7690", marginTop: 8 }}>
                Full Alphabet mode is on. Use the Alphabet Preview section above for alphabet controls.
              </div>
            ) : (
              <>
                <Label style={{ marginTop: 10 }}>Alignment</Label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <button
                    onClick={() => setTextAlign("left")}
                    style={textAlign === "left" ? selectedTile : tileBtn}
                  >
                    <div style={{ fontWeight: 700 }}>Left</div>
                    <div style={tileSub}>Align design to left</div>
                  </button>
                  <button
                    onClick={() => setTextAlign("center")}
                    style={textAlign === "center" ? selectedTile : tileBtn}
                  >
                    <div style={{ fontWeight: 700 }}>Center</div>
                    <div style={tileSub}>Center the full design</div>
                  </button>
                </div>

                <SliderRow
                  label="Top start position"
                  min={0}
                  max={Math.round(canvasH * 0.5)}
                  value={topOffset}
                  setValue={setTopOffset}
                />
                <SliderRow
                  label="Design size"
                  min={40}
                  max={240}
                  value={designScale}
                  setValue={setDesignScale}
                />
                <SliderRow
                  label="Letter spacing"
                  min={-340}
                  max={120}
                  value={letterSpacing}
                  setValue={setLetterSpacing}
                />
                <SliderRow
                  label="Line spacing"
                  min={Math.round(canvasH * 0.1)}
                  max={Math.round(canvasH * 0.4)}
                  value={lineSpacing}
                  setValue={setLineSpacing}
                />
                <div style={{ fontSize: 12, color: "#6d7690", marginTop: 8 }}>
                  {autoFit
                    ? "Auto-fit is ON. The design stays inside the canvas."
                    : "Auto-fit is OFF. The design can grow much larger and may extend past the canvas edges."}
                </div>
              </>
            )}

            {!alphabetPreviewMode && layoutMode === "arc" ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 16,
                  background: "#fff",
                  border: "1px solid #ece4df",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                  Per-line arc controls
                </div>
                <div style={{ fontSize: 12, color: "#6d7690", marginBottom: 8 }}>
                  Turn arc on or off for each line. Only lines with text will show.
                </div>

                {[0, 1, 2].map((lineIndex) => (
                  <div
                    key={lineIndex}
                    style={{
                      marginTop: lineIndex === 0 ? 0 : 12,
                      paddingTop: lineIndex === 0 ? 0 : 12,
                      borderTop: lineIndex === 0 ? "none" : "1px solid #f0ebe8",
                    }}
                  >
                    <label style={checkRow}>
                      <input
                        type="checkbox"
                        checked={!!lineArcEnabled[lineIndex]}
                        onChange={(e) =>
                          setLineArcEnabled((prev) => {
                            const next = [...prev];
                            next[lineIndex] = e.target.checked;
                            return next;
                          })
                        }
                      />
                      <span>Arc line {lineIndex + 1}</span>
                    </label>

                    <SliderRow
                      label={`Line ${lineIndex + 1} arc height`}
                      min={0}
                      max={Math.round(canvasH * 0.18)}
                      value={lineArcHeights[lineIndex] ?? arcHeight}
                      setValue={(v) =>
                        setLineArcHeights((prev) => {
                          const next = [...prev];
                          next[lineIndex] = v;
                          setArcHeight(v);
                          return next;
                        })
                      }
                      disabled={!lineArcEnabled[lineIndex]}
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {!alphabetPreviewMode && layoutMode === "overlap" ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 16,
                  background: "#fff",
                  border: "1px solid #ece4df",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                  Overlap controls
                </div>
                <div style={{ fontSize: 12, color: "#6d7690", marginBottom: 8 }}>
                  Build a closer, layered look with overlap, size variation, and rotation variation.
                </div>

                <SliderRow
                  label="Overlap amount"
                  min={0}
                  max={Math.round(canvasW * 0.12)}
                  value={overlapAmount}
                  setValue={setOverlapAmount}
                />
                <SliderRow
                  label="Size variation"
                  min={0}
                  max={35}
                  value={overlapSizeVariation}
                  setValue={setOverlapSizeVariation}
                />
                <SliderRow
                  label="Rotation variation"
                  min={0}
                  max={25}
                  value={overlapRotationVariation}
                  setValue={setOverlapRotationVariation}
                />

                <button onClick={rerandomizeOverlap} style={{ ...smallGhostBtn, marginTop: 10 }}>
                  Re-randomize
                </button>
              </div>
            ) : null}
          </CollapseSection>

          <CollapseSection
            title="6. Selected Layer"
            open={openSections.selected}
            onToggle={() => toggleSection("selected")}
          >
            {selectedItem ? (
              <>
                <div style={{ fontSize: 13, color: "#6d7690", marginBottom: 8 }}>
                  Selected: <strong>{selectedItem.type}</strong>
                  {selectedItem.char ? (
                    <>
                      {" "}• <strong>{selectedItem.char}</strong>
                    </>
                  ) : null}
                  {selectedItem.setName ? (
                    <>
                      {" "}from <strong>{selectedItem.setName}</strong>
                    </>
                  ) : null}
                  {selectedItem.name ? (
                    <>
                      {" "}• <strong>{selectedItem.name}</strong>
                    </>
                  ) : null}
                </div>

                {(selectedItem.type === "letter" ||
                  selectedItem.type === "element" ||
                  selectedItem.type === "logo" ||
                  selectedItem.type === "watermark-image") ? (
                  <>
                    <SliderRow
                      label="Uniform size %"
                      min={20}
                      max={260}
                      value={Math.round(((selectedItem.widthScale || 100) + (selectedItem.heightScale || 100)) / 2)}
                      setValue={applyUniformScale}
                    />
                    <SliderRow
                      label="Width %"
                      min={20}
                      max={260}
                      value={Math.round(selectedItem.widthScale || 100)}
                      setValue={applyWidthScale}
                    />
                    <SliderRow
                      label="Height %"
                      min={20}
                      max={260}
                      value={Math.round(selectedItem.heightScale || 100)}
                      setValue={applyHeightScale}
                    />
                  </>
                ) : null}

                {selectedItem.type === "watermark" ? (
                  <>
                    <SliderRow
                      label="Text size"
                      min={20}
                      max={220}
                      value={selectedItem.fontSize || 80}
                      setValue={(v) => updateSelectedItem({ fontSize: v })}
                    />
                    <Label>Text color</Label>
                    <input
                      type="color"
                      value={selectedItem.color || "#c78fa2"}
                      onChange={(e) =>
                        updateSelectedItem({ color: e.target.value })
                      }
                      style={colorInput}
                    />
                    <Label>Watermark text</Label>
                    <input
                      value={selectedItem.text || ""}
                      onChange={(e) =>
                        updateSelectedItem({ text: e.target.value })
                      }
                      style={textInput}
                    />
                  </>
                ) : null}

                <SliderRow
                  label="Rotation"
                  min={-45}
                  max={45}
                  value={Math.round(selectedItem.rotation || 0)}
                  setValue={(v) => updateSelectedItem({ rotation: v })}
                />

                <SliderRow
                  label="Opacity"
                  min={10}
                  max={100}
                  value={Math.round((selectedItem.opacity ?? 1) * 100)}
                  setValue={(v) => updateSelectedItem({ opacity: v / 100 })}
                />

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {(["element", "logo", "watermark-image"].includes(selectedItem.type)) ? (
                    <button onClick={trimSelectedImageLayer} style={secondaryBtn}>
                      Trim Transparent Space
                    </button>
                  ) : null}
                  <button onClick={bringForward} style={secondaryBtn}>
                    Bring Forward
                  </button>
                  <button onClick={sendBackward} style={secondaryBtn}>
                    Send Back
                  </button>
                  <button onClick={removeSelectedItem} style={smallGhostBtn}>
                    Remove Layer
                  </button>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: "#7b8091" }}>
                Click a letter, element, logo, or watermark on the preview to edit it.
              </div>
            )}
          </CollapseSection>

          <CollapseSection
            title="7. Background"
            open={openSections.background}
            onToggle={() => toggleSection("background")}
          >
            <label style={checkRow}>
              <input
                type="checkbox"
                checked={transparentBg}
                onChange={(e) => {
                  const next = e.target.checked;
                  setTransparentBg(next);
                  if (next) setBgImage(null);
                }}
              />
              <span>Transparent background</span>
            </label>

            <Label style={{ opacity: transparentBg ? 0.45 : 1 }}>
              Background color
            </Label>
            <input
              type="color"
              value={bgColor}
              disabled={transparentBg}
              onChange={(e) => setBgColor(e.target.value)}
              style={{ ...colorInput, opacity: transparentBg ? 0.45 : 1 }}
            />

            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 12,
                flexWrap: "wrap",
                opacity: transparentBg ? 0.45 : 1,
              }}
            >
              <button
                disabled={transparentBg}
                onClick={() => bgFileInputRef.current?.click()}
                style={transparentBg ? disabledBtn : secondaryBtn}
              >
                Upload Background
              </button>

              <button
                disabled={transparentBg && !bgImage}
                onClick={clearBackgroundImage}
                style={transparentBg ? disabledBtn : smallGhostBtn}
              >
                Clear Image
              </button>
            </div>

            <input
              ref={bgFileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => handleBgImage(e.target.files?.[0])}
            />

            <Label style={{ marginTop: 12, opacity: transparentBg ? 0.45 : 1 }}>
              Background image style
            </Label>
            <select
              value={bgFit}
              disabled={transparentBg}
              onChange={(e) => setBgFit(e.target.value)}
              style={{ ...selectStyle, opacity: transparentBg ? 0.45 : 1 }}
            >
              <option value="cover">Fill canvas</option>
              <option value="contain">Show whole image</option>
            </select>

            <SliderRow
              label="Background image opacity"
              min={0}
              max={100}
              value={bgOpacity}
              setValue={setBgOpacity}
              disabled={transparentBg || !bgImage}
            />
          </CollapseSection>

          <CollapseSection
            title="8. Elements"
            open={openSections.elements}
            onToggle={() => toggleSection("elements")}
          >
            <div style={{ fontSize: 13, color: "#6d7690", marginBottom: 8 }}>
              Upload decorative PNG elements, then click Add to place them on the mockup.
            </div>
            <label style={checkRow}>
              <input
                type="checkbox"
                checked={autoTrimElementUploads}
                onChange={(e) => setAutoTrimElementUploads(e.target.checked)}
              />
              <span>Auto-trim extra transparent space on element upload</span>
            </label>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => elementUploadRef.current?.click()}
                style={secondaryBtn}
              >
                Upload Elements
              </button>
            </div>

            <input
              ref={elementUploadRef}
              type="file"
              accept=".png"
              multiple
              style={{ display: "none" }}
              onChange={(e) => handleElementUploads(e.target.files)}
            />

            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {elementsLibrary.length ? (
                elementsLibrary.map((asset) => (
                  <div
                    key={asset.id}
                    style={{
                      border: "1px solid #ece4df",
                      borderRadius: 14,
                      padding: 10,
                      display: "grid",
                      gridTemplateColumns: "50px 1fr auto",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <img
                      src={asset.src}
                      alt={asset.name}
                      style={{
                        width: 50,
                        height: 50,
                        objectFit: "contain",
                        background: "#faf8f7",
                        borderRadius: 10,
                      }}
                    />
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{asset.name}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => addElementToCanvas(asset)} style={smallGhostBtn}>
                        Add
                      </button>
                      <button onClick={() => removeLibraryElement(asset.id)} style={smallGhostBtn}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, color: "#7b8091" }}>
                  No elements uploaded yet.
                </div>
              )}
            </div>
          </CollapseSection>
          <CollapseSection
            title="9. Banner"
            open={openSections.banner}
            onToggle={() => toggleSection("banner")}
          >
            <div
              style={{
                marginTop: 4,
                padding: 12,
                borderRadius: 16,
                background: "#fff",
                border: "1px solid #ece4df",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                Banner 1
              </div>

              <label style={checkRow}>
                <input
                  type="checkbox"
                  checked={bannerEnabled}
                  onChange={(e) => setBannerEnabled(e.target.checked)}
                />
                <span>Enable banner 1</span>
              </label>

              <Label>Banner text</Label>
              <input
                value={bannerText}
                onChange={(e) => setBannerText(e.target.value)}
                style={textInput}
              />

              <Label>Position</Label>
              <select
                value={bannerPosition}
                onChange={(e) => setBannerPosition(e.target.value)}
                style={selectStyle}
              >
                <option value="top">Top full width</option>
                <option value="bottom">Bottom full width</option>
                <option value="top-left">Top left corner</option>
                <option value="top-right">Top right corner</option>
                <option value="bottom-left">Bottom left corner</option>
                <option value="bottom-right">Bottom right corner</option>
                <option value="center">Center strip</option>
              </select>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <Label>Banner color</Label>
                  <input
                    type="color"
                    value={bannerColor}
                    onChange={(e) => setBannerColor(e.target.value)}
                    style={colorInput}
                  />
                </div>
                <div>
                  <Label>Text color</Label>
                  <input
                    type="color"
                    value={bannerTextColor}
                    onChange={(e) => setBannerTextColor(e.target.value)}
                    style={colorInput}
                  />
                </div>
              </div>

              <SliderRow label="Opacity" min={0} max={100} value={bannerOpacity} setValue={setBannerOpacity} />
              <SliderRow label="Height" min={Math.round(canvasH * 0.06)} max={Math.round(canvasH * 0.2)} value={bannerHeight} setValue={setBannerHeight} />
              <SliderRow label="Corner width %" min={20} max={80} value={bannerWidthPct} setValue={setBannerWidthPct} />
              <SliderRow label="Margin" min={0} max={100} value={bannerMargin} setValue={setBannerMargin} />
              <SliderRow label="Radius" min={0} max={60} value={bannerRadius} setValue={setBannerRadius} />
              <SliderRow label="Font size" min={24} max={Math.round(canvasH * 0.11)} value={bannerFontSize} setValue={setBannerFontSize} />
            </div>

            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 16,
                background: "#fff",
                border: "1px solid #ece4df",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                Banner 2
              </div>

              <label style={checkRow}>
                <input
                  type="checkbox"
                  checked={banner2Enabled}
                  onChange={(e) => setBanner2Enabled(e.target.checked)}
                />
                <span>Enable banner 2</span>
              </label>

              <Label>Banner text</Label>
              <input
                value={banner2Text}
                onChange={(e) => setBanner2Text(e.target.value)}
                style={textInput}
              />

              <Label>Position</Label>
              <select
                value={banner2Position}
                onChange={(e) => setBanner2Position(e.target.value)}
                style={selectStyle}
              >
                <option value="top">Top full width</option>
                <option value="bottom">Bottom full width</option>
                <option value="top-left">Top left corner</option>
                <option value="top-right">Top right corner</option>
                <option value="bottom-left">Bottom left corner</option>
                <option value="bottom-right">Bottom right corner</option>
                <option value="center">Center strip</option>
              </select>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <Label>Banner color</Label>
                  <input
                    type="color"
                    value={banner2Color}
                    onChange={(e) => setBanner2Color(e.target.value)}
                    style={colorInput}
                  />
                </div>
                <div>
                  <Label>Text color</Label>
                  <input
                    type="color"
                    value={banner2TextColor}
                    onChange={(e) => setBanner2TextColor(e.target.value)}
                    style={colorInput}
                  />
                </div>
              </div>

              <SliderRow label="Opacity" min={0} max={100} value={banner2Opacity} setValue={setBanner2Opacity} />
              <SliderRow label="Height" min={Math.round(canvasH * 0.06)} max={Math.round(canvasH * 0.2)} value={banner2Height} setValue={setBanner2Height} />
              <SliderRow label="Corner width %" min={20} max={80} value={banner2WidthPct} setValue={setBanner2WidthPct} />
              <SliderRow label="Margin" min={0} max={100} value={banner2Margin} setValue={setBanner2Margin} />
              <SliderRow label="Radius" min={0} max={60} value={banner2Radius} setValue={setBanner2Radius} />
              <SliderRow label="Font size" min={24} max={Math.round(canvasH * 0.11)} value={banner2FontSize} setValue={setBanner2FontSize} />
            </div>

            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 16,
                background: "#fff",
                border: "1px solid #ece4df",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                Banner 3
              </div>

              <label style={checkRow}>
                <input
                  type="checkbox"
                  checked={banner3Enabled}
                  onChange={(e) => setBanner3Enabled(e.target.checked)}
                />
                <span>Enable banner 3</span>
              </label>

              <Label>Banner text</Label>
              <input
                value={banner3Text}
                onChange={(e) => setBanner3Text(e.target.value)}
                style={textInput}
              />

              <Label>Position</Label>
              <select
                value={banner3Position}
                onChange={(e) => setBanner3Position(e.target.value)}
                style={selectStyle}
              >
                <option value="top">Top full width</option>
                <option value="bottom">Bottom full width</option>
                <option value="top-left">Top left corner</option>
                <option value="top-right">Top right corner</option>
                <option value="bottom-left">Bottom left corner</option>
                <option value="bottom-right">Bottom right corner</option>
                <option value="center">Center strip</option>
              </select>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <Label>Banner color</Label>
                  <input
                    type="color"
                    value={banner3Color}
                    onChange={(e) => setBanner3Color(e.target.value)}
                    style={colorInput}
                  />
                </div>
                <div>
                  <Label>Text color</Label>
                  <input
                    type="color"
                    value={banner3TextColor}
                    onChange={(e) => setBanner3TextColor(e.target.value)}
                    style={colorInput}
                  />
                </div>
              </div>

              <SliderRow label="Opacity" min={0} max={100} value={banner3Opacity} setValue={setBanner3Opacity} />
              <SliderRow label="Height" min={Math.round(canvasH * 0.06)} max={Math.round(canvasH * 0.2)} value={banner3Height} setValue={setBanner3Height} />
              <SliderRow label="Corner width %" min={20} max={80} value={banner3WidthPct} setValue={setBanner3WidthPct} />
              <SliderRow label="Margin" min={0} max={100} value={banner3Margin} setValue={setBanner3Margin} />
              <SliderRow label="Radius" min={0} max={60} value={banner3Radius} setValue={setBanner3Radius} />
              <SliderRow label="Font size" min={24} max={Math.round(canvasH * 0.11)} value={banner3FontSize} setValue={setBanner3FontSize} />
            </div>
          </CollapseSection>

          <CollapseSection
            title="10. Logo"
            open={openSections.logo}
            onToggle={() => toggleSection("logo")}
          >
            <div style={{ fontSize: 13, color: "#6d7690", marginBottom: 8 }}>
              Upload one PNG logo and add it to the canvas.
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => logoUploadRef.current?.click()}
                style={secondaryBtn}
              >
                Upload Logo
              </button>
              <button
                onClick={addLogoToCanvas}
                disabled={!logoAsset}
                style={!logoAsset ? disabledBtn : smallGhostBtn}
              >
                Add Logo to Canvas
              </button>
            </div>

            <input
              ref={logoUploadRef}
              type="file"
              accept=".png"
              style={{ display: "none" }}
              onChange={(e) => handleLogoUpload(e.target.files?.[0])}
            />

            {logoAsset ? (
              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: "60px 1fr",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <img
                  src={logoAsset.src}
                  alt={logoAsset.name}
                  style={{
                    width: 60,
                    height: 60,
                    objectFit: "contain",
                    background: "#faf8f7",
                    borderRadius: 10,
                  }}
                />
                <div style={{ fontSize: 13, fontWeight: 700 }}>{logoAsset.name}</div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#7b8091", marginTop: 8 }}>
                No logo uploaded yet.
              </div>
            )}
          </CollapseSection>

          <CollapseSection
            title="11. Watermark"
            open={openSections.watermark}
            onToggle={() => toggleSection("watermark")}
          >
            <label style={checkRow}>
              <input
                type="checkbox"
                checked={watermarkEnabled}
                onChange={(e) => setWatermarkEnabled(e.target.checked)}
              />
              <span>Show center watermark on preview/export</span>
            </label>

            <Label>Watermark text</Label>
            <input
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              style={textInput}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <Label>Watermark color</Label>
                <input
                  type="color"
                  value={watermarkColor}
                  onChange={(e) => setWatermarkColor(e.target.value)}
                  style={colorInput}
                />
              </div>
              <div>
                <SliderRow
                  label="Watermark opacity"
                  min={5}
                  max={60}
                  value={watermarkOpacity}
                  setValue={setWatermarkOpacity}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <button onClick={addWatermarkToCanvas} style={smallGhostBtn}>
                Add Movable Watermark Text Layer
              </button>
              <button onClick={removeWatermarkTextLayers} style={smallGhostBtn}>
                Delete Watermark Text Layer
              </button>
            </div>

            <div style={{ fontSize: 13, fontWeight: 800, marginTop: 16, marginBottom: 6 }}>
              Watermark image
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => watermarkImageUploadRef.current?.click()}
                style={secondaryBtn}
              >
                Upload Watermark Image
              </button>
              <button
                onClick={addWatermarkImageToCanvas}
                disabled={!watermarkImageAsset}
                style={!watermarkImageAsset ? disabledBtn : smallGhostBtn}
              >
                Add Watermark Image to Canvas
              </button>
              <button
                onClick={removeWatermarkImageAsset}
                disabled={!watermarkImageAsset}
                style={!watermarkImageAsset ? disabledBtn : smallGhostBtn}
              >
                Delete Watermark Image
              </button>
            </div>

            <input
              ref={watermarkImageUploadRef}
              type="file"
              accept=".png,image/png,image/webp,image/jpeg"
              style={{ display: "none" }}
              onChange={(e) => handleWatermarkImageUpload(e.target.files?.[0])}
            />

            {watermarkImageAsset ? (
              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: "56px 1fr",
                  gap: 10,
                  alignItems: "center",
                  padding: 10,
                  border: "1px solid #ece4df",
                  borderRadius: 14,
                  background: "#fff",
                }}
              >
                <img
                  src={watermarkImageAsset.src}
                  alt={watermarkImageAsset.name}
                  style={{
                    width: 56,
                    height: 56,
                    objectFit: "contain",
                    borderRadius: 10,
                    background: "#faf8f7",
                  }}
                />
                <div style={{ fontSize: 13, color: "#6d7690" }}>
                  {watermarkImageAsset.name}
                </div>
              </div>
            ) : null}
          </CollapseSection>

          <CollapseSection
            title="12. Export"
            open={openSections.export}
            onToggle={() => toggleSection("export")}
          >
            <Label>File name</Label>
            <input
              value={exportName}
              onChange={(e) => setExportName(e.target.value)}
              style={textInput}
            />

            <div style={{ fontSize: 12, color: "#6d7690", marginTop: 8 }}>
              PNG export includes 300 DPI metadata. Great for Etsy listing previews and product images.
            </div>

            {!exportName.trim() ? (
              <div style={{ fontSize: 12, color: "#b45309", marginTop: 8, fontWeight: 700 }}>
                Please enter a file name before exporting.
              </div>
            ) : null}

            <button
              onClick={exportPng}
              style={{ ...primaryBtn, width: "100%", marginTop: 10 }}
            >
              Export PNG
            </button>
          </CollapseSection>
        </div>
      </div>

      <div
        style={{
          minWidth: 0,
          position: "sticky",
          top: 20,
          height: "calc(100vh - 40px)",
          background: "linear-gradient(180deg, #fffdfc 0%, #fff9f6 100%)",
          border: "1px solid #eadfd8",
          borderRadius: 24,
          padding: 16,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
            background: "#f7efec",
            borderRadius: 18,
            padding: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Zoom</span>
            <input
              type="range"
              min={10}
              max={100}
              value={Math.round(zoom * 100)}
              onChange={(e) => setZoom(Number(e.target.value) / 100)}
              style={{ width: 220 }}
            />
            <span style={{ minWidth: 48, fontSize: 14 }}>
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(canvasW >= 3300 ? 0.22 : 0.28)}
              style={smallGhostBtn}
            >
              Reset Zoom
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button
              onClick={undoAction}
              disabled={!undoStack.length}
              style={!undoStack.length ? disabledBtn : smallGhostBtn}
            >
              Undo
            </button>
            <button
              onClick={redoAction}
              disabled={!redoStack.length}
              style={!redoStack.length ? disabledBtn : smallGhostBtn}
            >
              Redo
            </button>
          </div>
          <div style={{ fontSize: 13, color: "#6d7690" }}>
            Version 7.3.1 • Pixel Hit Selection + Click Offset Fix
          </div>
        </div>

        <div
          ref={stageWrapRef}
          style={{
            flex: 1,
            overflow: "auto",
            background: "#efe8e4",
            borderRadius: 18,
            padding: 18,
          }}
        >
          <div
            style={{
              width: canvasW * zoom,
              height: canvasH * zoom,
              transformOrigin: "top left",
              position: "relative",
              boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <canvas
              ref={previewCanvasRef}
              width={canvasW}
              height={canvasH}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              style={{
                width: canvasW * zoom,
                height: canvasH * zoom,
                display: "block",
                cursor: draggingId ? "grabbing" : "default",
                backgroundImage:
                  "linear-gradient(45deg, #e8e8e8 25%, transparent 25%), linear-gradient(-45deg, #e8e8e8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e8e8e8 75%), linear-gradient(-45deg, transparent 75%, #e8e8e8 75%)",
                backgroundSize: "20px 20px",
                backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function CollapseSection({ title, open, onToggle, children }) {
  const softMap = {
    "1. Canvas Size": "#fff5f7",
    "2. Upload Alpha Sets": "#fffaf2",
    "3. Alphabet Preview Mode": "#f8fbff",
    "4. Word or Phrase": "#f5fbff",
    "5. Layout": "#f8f5ff",
    "6. Selected Layer": "#fff9f4",
    "7. Background": "#fff8f3",
    "8. Elements": "#f7fbf5",
    "9. Banner": "#fff5fb",
    "10. Logo": "#f5faf7",
    "11. Watermark": "#faf7ff",
    "12. Export": "#f5fbf8",
  };
  const softBg = softMap[title] || "#fff";

  return (
    <div
      style={{
        marginBottom: 14,
        border: "1px solid #ece4df",
        borderRadius: 20,
        background: softBg,
        overflow: "hidden",
        boxShadow: "0 3px 10px rgba(0,0,0,0.04)",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          border: "none",
          background: softBg,
          padding: "14px 16px",
          textAlign: "left",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.3 }}>
          {title}
        </span>
        <span style={{ fontSize: 18, color: "#7b8091" }}>
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? <div style={{ padding: "0 14px 14px 14px" }}>{children}</div> : null}
    </div>
  );
}

function Label({ children, style = {} }) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 700,
        marginBottom: 6,
        marginTop: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SliderRow({ label, min, max, value, setValue, disabled = false }) {
  return (
    <div style={{ marginTop: 10, opacity: disabled ? 0.45 : 1 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 12, color: "#6d7690" }}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(Number(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );
}

const primaryBtn = {
  background: "#1c2439",
  color: "#fff",
  border: "none",
  borderRadius: 14,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryBtn = {
  background: "#eef1f7",
  color: "#33415c",
  border: "1px solid #d8dfed",
  borderRadius: 14,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

const disabledBtn = {
  background: "#f1f1f1",
  color: "#9aa0b4",
  border: "1px solid #e2e2e2",
  borderRadius: 14,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "not-allowed",
};

const smallGhostBtn = {
  background: "#fff",
  color: "#5e667c",
  border: "1px solid #dfe3ec",
  borderRadius: 12,
  padding: "8px 10px",
  fontWeight: 700,
  cursor: "pointer",
};

const tileBtn = {
  border: "1px solid #e4ddd8",
  background: "#faf8f7",
  borderRadius: 16,
  padding: 12,
  textAlign: "left",
  cursor: "pointer",
};

const selectedTile = {
  ...tileBtn,
  border: "2px solid #e58d9e",
  boxShadow: "0 0 0 3px rgba(229,141,158,0.12)",
  background: "#fff",
};

const tileSub = {
  fontSize: 12,
  color: "#7b8091",
  marginTop: 4,
};

const textareaStyle = {
  width: "100%",
  borderRadius: 16,
  border: "1px solid #dcd6d2",
  padding: 12,
  fontSize: 16,
  resize: "vertical",
  boxSizing: "border-box",
};

const textInput = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid #dcd6d2",
  padding: "11px 12px",
  fontSize: 15,
  boxSizing: "border-box",
};

const selectStyle = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid #dcd6d2",
  padding: "11px 12px",
  fontSize: 15,
  background: "#fff",
  boxSizing: "border-box",
};

const colorInput = {
  width: "100%",
  height: 44,
  borderRadius: 12,
  border: "1px solid #dcd6d2",
  padding: 4,
  background: "#fff",
  boxSizing: "border-box",
};

const checkRow = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  fontWeight: 600,
};
