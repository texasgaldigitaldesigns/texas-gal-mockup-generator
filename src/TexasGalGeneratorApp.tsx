'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { Stage, Layer, Image as KonvaImage, Rect, Text as KonvaText } from 'react-konva';

type LetterKey = string;

type SourceAsset = {
  fillFile?: File;
  outlineFile?: File; // main outline
  accentFile?: File; // accent/top detail
  fillImage?: HTMLImageElement;
  outlineImage?: HTMLImageElement;
  accentImage?: HTMLImageElement;
};

type LoadedImage = {
  file: File;
  image: HTMLImageElement;
  url: string;
};

type PaintMode = 'color' | 'pattern';

type RenderPaint = {
  mode: PaintMode;
  color: string;
  patternImage?: HTMLImageElement | null;
};

type ExportResult = {
  blob: Blob;
  width: number;
  height: number;
};

type Bounds = { x: number; y: number; width: number; height: number };

type PreviewState = {
  url: string | null;
  width: number;
  height: number;
};

type AppState = {
  exportFolderName: string;
  letters: Record<LetterKey, SourceAsset>;
  selectedLetters: LetterKey[];
  currentLetter: LetterKey | null;

  fillBackground: LoadedImage | null;

  outlinePattern: LoadedImage | null;
  outlineMode: PaintMode;
  outlineColor: string;

  accentPattern: LoadedImage | null;
  accentMode: PaintMode;
  accentColor: string;

  backingEnabled: boolean;
  backingMode: PaintMode;
  backingColor: string;
  backingPattern: LoadedImage | null;
  backingThickness: number;
  backingOffsetX: number;
  backingOffsetY: number;

  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;

  exportScale: number;
};

const PREVIEW_BOX = 620;
const LETTER_ORDER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const MIN_THICKNESS = 2;
const MAX_THICKNESS = 80;
const DEFAULT_EXPORT_SCALE = 2;
const PREVIEW_SCALE = 1.5;
const LETTER_PADDING = 24;
const DPI = 300;
const INCHES_PER_METER = 39.37007874;
const PIXELS_PER_METER_300_DPI = Math.round(DPI * INCHES_PER_METER);

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function waitFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function objectUrlFromBlob(blob: Blob) {
  return URL.createObjectURL(blob);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function friendlyLetterName(key: string) {
  return key.toUpperCase();
}

function sortLetterKeys(keys: string[]) {
  return [...keys].sort((a, b) => {
    const ai = LETTER_ORDER.indexOf(a);
    const bi = LETTER_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function detectTypeFromPath(path: string): 'fill' | 'outline' | 'accent' | null {
  const lower = path.toLowerCase().replace(/\\/g, '/');

  if (lower.includes('/fills/')) return 'fill';
  if (lower.includes('/accents/')) return 'accent';
  if (lower.includes('/outlines/')) return 'outline';

  const filename = lower.split('/').pop() || '';

  if (/_accent\.[^.]+$/i.test(filename)) return 'accent';
  if (/_outline\.[^.]+$/i.test(filename)) return 'outline';
  if (/_fill\.[^.]+$/i.test(filename)) return 'fill';

  return null;
}

function fileToLetterAndType(pathOrFilename: string): { key: string; type: 'fill' | 'outline' | 'accent' } | null {
  const filename = pathOrFilename.replace(/\\/g, '/').split('/').pop() || '';
  const base = filename.replace(/\.[^.]+$/, '').trim();
  const forcedType = detectTypeFromPath(pathOrFilename);

  if (forcedType === 'accent') {
    const match = base.match(/^(.+?)_accent$/i);
    if (!match) return null;
    return { key: match[1].toUpperCase(), type: 'accent' };
  }

  if (forcedType === 'outline') {
    const match = base.match(/^(.+?)_outline$/i);
    if (!match) return null;
    return { key: match[1].toUpperCase(), type: 'outline' };
  }

  if (forcedType === 'fill') {
    const match = base.match(/^(.+?)_fill$/i);
    if (!match) return null;
    return { key: match[1].toUpperCase(), type: 'fill' };
  }

  let match = base.match(/^(.+?)_accent$/i);
  if (match) return { key: match[1].toUpperCase(), type: 'accent' };

  match = base.match(/^(.+?)_outline$/i);
  if (match) return { key: match[1].toUpperCase(), type: 'outline' };

  match = base.match(/^(.+?)_fill$/i);
  if (match) return { key: match[1].toUpperCase(), type: 'fill' };

  return null;
}



function getUsablePathFromFile(file: File) {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
  return relativePath || file.name;
}

function getValidExportableLetterKeys(letters: Record<LetterKey, SourceAsset>) {
  return sortLetterKeys(
    Object.keys(letters).filter((key) => {
      const asset = letters[key];
      return !!(asset?.fillImage && asset?.outlineImage);
    }),
  );
}

function loadImageFromFile(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => resolve({ file, image: img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not load image: ${file.name}`));
    };
    img.src = url;
  });
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function getAlphaBounds(image: HTMLImageElement): Bounds | null {
  const canvas = createCanvas(image.naturalWidth, image.naturalHeight);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const alpha = data[(y * canvas.width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX === -1 || maxY === -1) return null;

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function unionBounds(bounds: Array<Bounds | null | undefined>): Bounds | null {
  const valid = bounds.filter(Boolean) as Bounds[];
  if (!valid.length) return null;

  const minX = Math.min(...valid.map((b) => b.x));
  const minY = Math.min(...valid.map((b) => b.y));
  const maxX = Math.max(...valid.map((b) => b.x + b.width));
  const maxY = Math.max(...valid.map((b) => b.y + b.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  dx: number,
  dy: number,
  dWidth: number,
  dHeight: number,
) {
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  const imageRatio = iw / ih;
  const destRatio = dWidth / dHeight;

  let sx = 0;
  let sy = 0;
  let sWidth = iw;
  let sHeight = ih;

  if (imageRatio > destRatio) {
    sWidth = ih * destRatio;
    sx = (iw - sWidth) / 2;
  } else {
    sHeight = iw / destRatio;
    sy = (ih - sHeight) / 2;
  }

  ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
}

function makePatternCanvas(width: number, height: number, paint: RenderPaint): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  if (paint.mode === 'color' || !paint.patternImage) {
    ctx.fillStyle = paint.color;
    ctx.fillRect(0, 0, width, height);
    return canvas;
  }

  drawImageCover(ctx, paint.patternImage, 0, 0, width, height);
  return canvas;
}

function imageToMaskCanvas(image: HTMLImageElement, bounds: Bounds, scale: number) {
  const width = Math.ceil(bounds.width * scale);
  const height = Math.ceil(bounds.height * scale);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(
    image,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    width,
    height,
  );

  return canvas;
}

function paintIntoMask(maskCanvas: HTMLCanvasElement, paint: RenderPaint) {
  const result = createCanvas(maskCanvas.width, maskCanvas.height);
  const ctx = result.getContext('2d');
  if (!ctx) return result;

  const paintCanvas = makePatternCanvas(maskCanvas.width, maskCanvas.height, paint);
  ctx.drawImage(paintCanvas, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  return result;
}

function createMergedMask(...maskCanvases: Array<HTMLCanvasElement | null | undefined>) {
  const valid = maskCanvases.filter(Boolean) as HTMLCanvasElement[];
  const width = Math.max(0, ...valid.map((c) => c.width));
  const height = Math.max(0, ...valid.map((c) => c.height));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  for (const item of valid) {
    ctx.drawImage(item, 0, 0);
  }

  return canvas;
}

function createBackingRing(maskCanvas: HTMLCanvasElement, thickness: number) {
  const radius = Math.max(1, Math.round(thickness));
  const expand = radius * 2;
  const width = maskCanvas.width + expand * 2;
  const height = maskCanvas.height + expand * 2;

  const dilated = createCanvas(width, height);
  const dCtx = dilated.getContext('2d');
  if (!dCtx) return dilated;

  dCtx.imageSmoothingEnabled = true;

  const centerX = expand;
  const centerY = expand;
  const stamped = new Set<string>();

  const stampAt = (x: number, y: number) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const key = `${ix},${iy}`;
    if (stamped.has(key)) return;
    stamped.add(key);
    dCtx.drawImage(maskCanvas, ix, iy);
  };

  stampAt(centerX, centerY);

  const bandStep = Math.max(1, Math.round(radius / 6));
  for (let r = bandStep; r <= radius; r += bandStep) {
    const circumference = 2 * Math.PI * r;
    const steps = Math.max(12, Math.ceil(circumference / Math.max(6, bandStep * 2)));
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      stampAt(centerX + Math.cos(angle) * r, centerY + Math.sin(angle) * r);
    }
  }

  return dilated;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not create PNG blob.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

function crc32(buf: Uint8Array) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function u32be(value: number) {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

async function add300DpiMetadata(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const signature = bytes.slice(0, 8);
  const chunks: Uint8Array[] = [];
  let offset = 8;
  let inserted = false;

  while (offset < bytes.length) {
    const length =
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
    const type = bytes.slice(offset + 4, offset + 8);
    const typeStr = new TextDecoder().decode(type);
    const fullChunk = bytes.slice(offset, offset + 12 + length);
    chunks.push(fullChunk);
    offset += 12 + length;

    if (!inserted && typeStr === 'IHDR') {
      const physData = new Uint8Array(9);
      physData.set(u32be(PIXELS_PER_METER_300_DPI), 0);
      physData.set(u32be(PIXELS_PER_METER_300_DPI), 4);
      physData[8] = 1;

      const typeBytes = new TextEncoder().encode('pHYs');
      const crcBytes = new Uint8Array(typeBytes.length + physData.length);
      crcBytes.set(typeBytes, 0);
      crcBytes.set(physData, typeBytes.length);
      const crc = crc32(crcBytes);

      const chunk = new Uint8Array(4 + 4 + physData.length + 4);
      chunk.set(u32be(physData.length), 0);
      chunk.set(typeBytes, 4);
      chunk.set(physData, 8);
      chunk.set(u32be(crc), 8 + physData.length);
      chunks.push(chunk);
      inserted = true;
    }
  }

  const total = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  out.set(signature, 0);
  let write = 8;
  for (const chunk of chunks) {
    out.set(chunk, write);
    write += chunk.length;
  }

  return new Blob([out], { type: 'image/png' });
}

function drawSoftShadow(
  ctx: CanvasRenderingContext2D,
  maskCanvas: HTMLCanvasElement,
  x: number,
  y: number,
  offsetX: number,
  offsetY: number,
  blur: number,
  color: string,
) {
  const steps = Math.max(1, blur);
  const spreadStep = 0.8;

  ctx.save();
  ctx.fillStyle = color;

  for (let i = 0; i < steps; i++) {
    const spread = i * spreadStep;
    const alpha = 0.18 / steps;

    ctx.globalAlpha = alpha;

    ctx.drawImage(maskCanvas, x + offsetX + spread, y + offsetY + spread);
    ctx.drawImage(maskCanvas, x + offsetX - spread, y + offsetY + spread);
    ctx.drawImage(maskCanvas, x + offsetX + spread, y + offsetY - spread);
    ctx.drawImage(maskCanvas, x + offsetX - spread, y + offsetY - spread);

    ctx.drawImage(maskCanvas, x + offsetX + spread, y + offsetY);
    ctx.drawImage(maskCanvas, x + offsetX - spread, y + offsetY);
    ctx.drawImage(maskCanvas, x + offsetX, y + offsetY + spread);
    ctx.drawImage(maskCanvas, x + offsetX, y + offsetY - spread);
  }

  ctx.restore();
}

async function renderLetterPng(options: {
  fillShape?: HTMLImageElement;
  outlineShape?: HTMLImageElement; // main outline
  accentShape?: HTMLImageElement; // accent
  fillBackground: HTMLImageElement;

  outlinePaint: RenderPaint;
  accentPaint: RenderPaint;

  backingEnabled: boolean;
  backingPaint: RenderPaint;
  backingThickness: number;
  backingOffsetX: number;
  backingOffsetY: number;

  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;

  scale: number;
  padding: number;
}): Promise<ExportResult> {
  const {
    fillShape,
    outlineShape,
    accentShape,
    fillBackground,
    outlinePaint,
    accentPaint,
    backingEnabled,
    backingPaint,
    backingThickness,
    backingOffsetX,
    backingOffsetY,
    shadowEnabled,
    shadowColor,
    shadowBlur,
    shadowOffsetX,
    shadowOffsetY,
    scale,
    padding,
  } = options;

  if (!fillShape && !outlineShape && !accentShape) {
    throw new Error('Missing fill and outline source image.');
  }

  const fillBounds = fillShape ? getAlphaBounds(fillShape) : null;
  const outlineBounds = outlineShape ? getAlphaBounds(outlineShape) : null;
  const accentBounds = accentShape ? getAlphaBounds(accentShape) : null;
  const sourceBounds = unionBounds([fillBounds, outlineBounds, accentBounds]);

  if (!sourceBounds) {
    throw new Error('Letter image has no visible pixels.');
  }

  const fillMask = fillShape ? imageToMaskCanvas(fillShape, sourceBounds, scale) : null;
  const outlineMask = outlineShape ? imageToMaskCanvas(outlineShape, sourceBounds, scale) : null;
  const accentMask = accentShape ? imageToMaskCanvas(accentShape, sourceBounds, scale) : null;

  const mergedMask = createMergedMask(fillMask, outlineMask, accentMask);

  const safeBackingThickness = Math.max(MIN_THICKNESS, Math.round(backingThickness * scale));
  const safeOffsetX = Math.max(0, Math.round(backingOffsetX * scale));
  const safeOffsetY = Math.max(0, Math.round(backingOffsetY * scale));

  const safeShadowBlur = shadowEnabled ? Math.max(0, Math.round(shadowBlur * scale)) : 0;
  const safeShadowOffsetX = shadowEnabled ? Math.round(shadowOffsetX * scale) : 0;
  const safeShadowOffsetY = shadowEnabled ? Math.round(shadowOffsetY * scale) : 0;

  const shadowPad = shadowEnabled
    ? Math.max(safeShadowBlur * 2 + 8, Math.abs(safeShadowOffsetX), Math.abs(safeShadowOffsetY))
    : 0;

  const ringCanvas = backingEnabled ? createBackingRing(mergedMask, safeBackingThickness) : null;
  const outerPad = backingEnabled ? safeBackingThickness * 2 : 0;
  const innerPad = Math.max(1, Math.round(padding * scale));

  const exportWidth = mergedMask.width + outerPad * 2 + innerPad * 2 + safeOffsetX + shadowPad * 2;
  const exportHeight = mergedMask.height + outerPad * 2 + innerPad * 2 + safeOffsetY + shadowPad * 2;

  const out = createCanvas(exportWidth, exportHeight);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas context.');

  ctx.clearRect(0, 0, exportWidth, exportHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const letterX = innerPad + outerPad + shadowPad;
  const letterY = innerPad + outerPad + shadowPad;

  if (ringCanvas) {
    const backingPaintCanvas = makePatternCanvas(ringCanvas.width, ringCanvas.height, backingPaint);
    const backingCanvas = createCanvas(ringCanvas.width, ringCanvas.height);
    const bCtx = backingCanvas.getContext('2d');
    if (bCtx) {
      bCtx.drawImage(backingPaintCanvas, 0, 0);
      bCtx.globalCompositeOperation = 'destination-in';
      bCtx.drawImage(ringCanvas, 0, 0);
      bCtx.globalCompositeOperation = 'source-over';

      ctx.drawImage(
        backingCanvas,
        innerPad + safeOffsetX + shadowPad,
        innerPad + safeOffsetY + shadowPad
      );
    }
  }

  if (shadowEnabled) {
    const shadowMaskCanvas = createCanvas(mergedMask.width, mergedMask.height);
    const sCtx = shadowMaskCanvas.getContext('2d');

    if (sCtx) {
      sCtx.fillStyle = shadowColor;
      sCtx.fillRect(0, 0, shadowMaskCanvas.width, shadowMaskCanvas.height);
      sCtx.globalCompositeOperation = 'destination-in';
      sCtx.drawImage(mergedMask, 0, 0);
      sCtx.globalCompositeOperation = 'source-over';

      drawSoftShadow(
        ctx,
        shadowMaskCanvas,
        letterX,
        letterY,
        safeShadowOffsetX,
        safeShadowOffsetY,
        safeShadowBlur,
        shadowColor,
      );
    }
  }

  // Fill first
  if (fillMask) {
    const fillCanvas = createCanvas(fillMask.width, fillMask.height);
    const fCtx = fillCanvas.getContext('2d');
    if (fCtx) {
      drawImageCover(fCtx, fillBackground, 0, 0, fillCanvas.width, fillCanvas.height);
      fCtx.globalCompositeOperation = 'destination-in';
      fCtx.drawImage(fillMask, 0, 0);
      fCtx.globalCompositeOperation = 'source-over';
      ctx.drawImage(fillCanvas, letterX, letterY);
    }
  }

  // Main outline over fill and backing
  if (outlineMask) {
    const paintedOutline = paintIntoMask(outlineMask, outlinePaint);
    ctx.drawImage(paintedOutline, letterX, letterY);
  }

  // Accent on top
  if (accentMask) {
    const paintedAccent = paintIntoMask(accentMask, accentPaint);
    ctx.drawImage(paintedAccent, letterX, letterY);
  }

  const png = await canvasToBlob(out);
  const withDpi = await add300DpiMetadata(png);
  return { blob: withDpi, width: out.width, height: out.height };
}

function useHtmlImage(url: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!url) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.src = url;
    return () => {
      setImage(null);
    };
  }, [url]);

  return image;
}

export default function TexasGalGeneratorApp() {
  const previewUrlRef = useRef<string | null>(null);

  const [busyMessage, setBusyMessage] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<PreviewState>({ url: null, width: 0, height: 0 });
  const [backingThicknessDraft, setBackingThicknessDraft] = useState(12);

  const [state, setState] = useState<AppState>({
    exportFolderName: 'Texas-Gal-Alphabet-Set',
    letters: {},
    selectedLetters: [],
    currentLetter: null,

    fillBackground: null,

    outlinePattern: null,
    outlineMode: 'color',
    outlineColor: '#84cc16',

    accentPattern: null,
    accentMode: 'color',
    accentColor: '#b91c1c',

    backingEnabled: true,
    backingMode: 'color',
    backingColor: '#ffffff',
    backingPattern: null,
    backingThickness: 12,
    backingOffsetX: 0,
    backingOffsetY: 0,

    shadowEnabled: false,
    shadowColor: '#000000',
    shadowBlur: 8,
    shadowOffsetX: 4,
    shadowOffsetY: 4,

    exportScale: DEFAULT_EXPORT_SCALE,
  });

  const availableLetters = useMemo(() => {
    const keys = Object.keys(state.letters).filter((key) => {
      const asset = state.letters[key];
      return asset?.fillImage || asset?.outlineImage || asset?.accentImage;
    });
    return sortLetterKeys(keys);
  }, [state.letters]);

  const currentAsset = state.currentLetter ? state.letters[state.currentLetter] : undefined;
  const previewImage = useHtmlImage(preview.url);

  const outlinePaint = useMemo<RenderPaint>(() => {
    return {
      mode: state.outlineMode,
      color: state.outlineColor,
      patternImage: state.outlinePattern?.image ?? null,
    };
  }, [state.outlineMode, state.outlineColor, state.outlinePattern]);

  const accentPaint = useMemo<RenderPaint>(() => {
    return {
      mode: state.accentMode,
      color: state.accentColor,
      patternImage: state.accentPattern?.image ?? null,
    };
  }, [state.accentMode, state.accentColor, state.accentPattern]);

  const backingPaint = useMemo<RenderPaint>(() => {
    return {
      mode: state.backingMode,
      color: state.backingColor,
      patternImage: state.backingPattern?.image ?? null,
    };
  }, [state.backingMode, state.backingColor, state.backingPattern]);

  useEffect(() => {
    setBackingThicknessDraft(state.backingThickness);
  }, [state.backingThickness]);

  const commitBackingThickness = useCallback(() => {
    setState((prev) => {
      if (prev.backingThickness === backingThicknessDraft) return prev;
      return { ...prev, backingThickness: backingThicknessDraft };
    });
  }, [backingThicknessDraft]);

  const cleanupPreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  useEffect(() => cleanupPreviewUrl, [cleanupPreviewUrl]);

  const applyLoadedImage = useCallback(
    async (
      file: File | null,
      key:
        | 'fillBackground'
        | 'outlinePattern'
        | 'accentPattern'
        | 'backingPattern',
    ) => {
      try {
        setError('');
        if (!file) {
          setState((prev) => ({ ...prev, [key]: null }));
          return;
        }

        const loaded = await loadImageFromFile(file);
        setState((prev) => {
          const old = prev[key];
          if (old?.url) URL.revokeObjectURL(old.url);
          return { ...prev, [key]: loaded };
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load image.');
      }
    },
    [],
  );

  const updateLettersState = useCallback((updater: (prevLetters: Record<LetterKey, SourceAsset>) => Record<LetterKey, SourceAsset>, nextExportFolderName?: string) => {
    setState((prev) => {
      const nextLetters = updater(prev.letters);
      const validKeys = getValidExportableLetterKeys(nextLetters);
      const nextCurrentLetter =
        prev.currentLetter && nextLetters[prev.currentLetter] && validKeys.includes(prev.currentLetter)
          ? prev.currentLetter
          : validKeys[0] ?? null;

      return {
        ...prev,
        exportFolderName: nextExportFolderName ?? prev.exportFolderName,
        letters: nextLetters,
        selectedLetters: validKeys,
        currentLetter: nextCurrentLetter,
      };
    });
  }, []);

  const handleSeparateUpload = useCallback(async (
    files: FileList | File[] | null | undefined,
    expectedType: 'fill' | 'outline' | 'accent',
    label: string,
  ) => {
    const fileArray = Array.from(files ?? []);
    if (!fileArray.length) return;

    setBusyMessage(`Loading ${label}...`);
    setError('');

    try {
      const nextPartialLetters: Record<string, SourceAsset> = {};

      for (const file of fileArray) {
        if (!/\.png$/i.test(file.name)) continue;

        const parsed = fileToLetterAndType(getUsablePathFromFile(file)) || fileToLetterAndType(file.name);
        if (!parsed || parsed.type !== expectedType) continue;

        const loaded = await loadImageFromFile(file);
        const existing = nextPartialLetters[parsed.key] ?? {};

        nextPartialLetters[parsed.key] = {
          ...existing,
          ...(expectedType === 'fill'
            ? { fillFile: file, fillImage: loaded.image }
            : expectedType === 'outline'
              ? { outlineFile: file, outlineImage: loaded.image }
              : { accentFile: file, accentImage: loaded.image }),
        };
      }

      if (!Object.keys(nextPartialLetters).length) {
        throw new Error(
          `No valid ${label.toLowerCase()} were found. Use file names like A_${expectedType}.png.`,
        );
      }

      updateLettersState((prevLetters) => {
        const merged = { ...prevLetters };

        for (const [key, incoming] of Object.entries(nextPartialLetters)) {
          const current = merged[key] ?? {};
          merged[key] = { ...current, ...incoming };
        }

        return merged;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not load ${label.toLowerCase()}.`);
    } finally {
      setBusyMessage('');
    }
  }, [updateLettersState]);

  const handleZipUpload = useCallback(async (zipFile: File) => {
    setBusyMessage('Unzipping alphabet ZIP...');
    setError('');

    try {
      const zip = await JSZip.loadAsync(zipFile);
      const zipName = zipFile.name.replace(/\.zip$/i, '');

      const nextLetters: Record<string, SourceAsset> = {};
      const entries = Object.values(zip.files);

      for (const entry of entries) {
        if (entry.dir) continue;

        const rawPath = entry.name.replace(/\\/g, '/');

        if (
          rawPath.startsWith('__MACOSX/') ||
          rawPath.includes('/__MACOSX/') ||
          (rawPath.split('/').pop() || '').startsWith('._')
        ) {
          continue;
        }

        if (!/\.png$/i.test(rawPath)) continue;

        const parsed = fileToLetterAndType(rawPath);
        if (!parsed) continue;

        const filename = rawPath.split('/').pop() || '';
        const blob = await entry.async('blob');
        const file = new File([blob], filename, { type: 'image/png' });
        const loaded = await loadImageFromFile(file);

        const existing = nextLetters[parsed.key] ?? {};

        nextLetters[parsed.key] = {
          ...existing,
          ...(parsed.type === 'fill'
            ? { fillFile: file, fillImage: loaded.image }
            : parsed.type === 'outline'
              ? { outlineFile: file, outlineImage: loaded.image }
              : { accentFile: file, accentImage: loaded.image }),
        };
      }

      const keys = sortLetterKeys(
        Object.keys(nextLetters).filter((key) => {
          const asset = nextLetters[key];
          return asset.fillImage && asset.outlineImage;
        }),
      );

      if (!keys.length) {
        throw new Error(
          'No valid letters found. Make sure your ZIP has fills/A_fill.png and outlines/A_outline.png.'
        );
      }

      updateLettersState(() => nextLetters, zipName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load ZIP file.');
    } finally {
      setBusyMessage('');
    }
  }, [updateLettersState]);

  const toggleLetterSelection = useCallback((letter: string) => {
    setState((prev) => {
      const exists = prev.selectedLetters.includes(letter);
      const next = exists
        ? prev.selectedLetters.filter((l) => l !== letter)
        : [...prev.selectedLetters, letter];
      return { ...prev, selectedLetters: sortLetterKeys(next) };
    });
  }, []);

  const selectAllLetters = useCallback(() => {
    setState((prev) => ({ ...prev, selectedLetters: availableLetters }));
  }, [availableLetters]);

  const clearSelectedLetters = useCallback(() => {
    setState((prev) => ({ ...prev, selectedLetters: [] }));
  }, []);

  useEffect(() => {
    let active = true;

    async function buildPreview() {
      if (!state.fillBackground?.image || !state.currentLetter || !currentAsset) {
        cleanupPreviewUrl();
        setPreview({ url: null, width: 0, height: 0 });
        return;
      }

      try {
        const result = await renderLetterPng({
          fillShape: currentAsset.fillImage,
          outlineShape: currentAsset.outlineImage,
          accentShape: currentAsset.accentImage,
          fillBackground: state.fillBackground.image,
          outlinePaint,
          accentPaint,
          backingEnabled: state.backingEnabled,
          backingPaint,
          backingThickness: state.backingThickness,
          backingOffsetX: state.backingOffsetX,
          backingOffsetY: state.backingOffsetY,
          shadowEnabled: state.shadowEnabled,
          shadowColor: state.shadowColor,
          shadowBlur: state.shadowBlur,
          shadowOffsetX: state.shadowOffsetX,
          shadowOffsetY: state.shadowOffsetY,
          scale: PREVIEW_SCALE,
          padding: LETTER_PADDING,
        });

        if (!active) return;

        const nextUrl = objectUrlFromBlob(result.blob);
        cleanupPreviewUrl();
        previewUrlRef.current = nextUrl;
        setPreview({ url: nextUrl, width: result.width, height: result.height });
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Preview failed.');
      }
    }

    const handle = window.setTimeout(() => {
      void buildPreview();
    }, 40);

    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [
    state.currentLetter,
    state.fillBackground,
    state.outlineMode,
    state.outlineColor,
    state.outlinePattern,
    state.accentMode,
    state.accentColor,
    state.accentPattern,
    state.backingEnabled,
    state.backingMode,
    state.backingColor,
    state.backingPattern,
    state.backingThickness,
    state.backingOffsetX,
    state.backingOffsetY,
    state.shadowEnabled,
    state.shadowColor,
    state.shadowBlur,
    state.shadowOffsetX,
    state.shadowOffsetY,
    currentAsset,
    outlinePaint,
    accentPaint,
    backingPaint,
    cleanupPreviewUrl,
  ]);

  const canPreview = !!preview.url;

  const selectedAvailableLetters = useMemo(
    () => sortLetterKeys(state.selectedLetters.filter((key) => availableLetters.includes(key))),
    [state.selectedLetters, availableLetters],
  );

  const canExport =
    !!state.fillBackground?.image &&
    selectedAvailableLetters.length > 0 &&
    availableLetters.length > 0;

  const handleExport = useCallback(async () => {
    if (!canExport || !state.fillBackground?.image) {
      setError('Please load your alphabet ZIP or separate fill/outline files, choose a fill background, and select at least one letter to export.');
      return;
    }

    setBusyMessage('Building ZIP...');
    setError('');

    try {
      const zip = new JSZip();
      const exportLetters = selectedAvailableLetters;

      for (let i = 0; i < exportLetters.length; i++) {
        const key = exportLetters[i];
        const asset = state.letters[key];
        if (!asset?.fillImage && !asset?.outlineImage && !asset?.accentImage) continue;

        setBusyMessage(`Rendering ${friendlyLetterName(key)} (${i + 1}/${exportLetters.length})...`);

        const result = await renderLetterPng({
          fillShape: asset.fillImage,
          outlineShape: asset.outlineImage,
          accentShape: asset.accentImage,
          fillBackground: state.fillBackground.image,
          outlinePaint,
          accentPaint,
          backingEnabled: state.backingEnabled,
          backingPaint,
          backingThickness: state.backingThickness,
          backingOffsetX: state.backingOffsetX,
          backingOffsetY: state.backingOffsetY,
          shadowEnabled: state.shadowEnabled,
          shadowColor: state.shadowColor,
          shadowBlur: state.shadowBlur,
          shadowOffsetX: state.shadowOffsetX,
          shadowOffsetY: state.shadowOffsetY,
          scale: state.exportScale,
          padding: LETTER_PADDING,
        });

        zip.file(`${key}.png`, result.blob);
        await waitFrame();
      }

      if (!exportLetters.length) {
        throw new Error('No valid letters were selected to export.');
      }

      setBusyMessage('Finalizing ZIP...');
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      const safeFolderName = state.exportFolderName.trim() || 'Texas-Gal-Alphabet-Set';
      triggerDownload(zipBlob, safeFolderName + '.zip');
      setBusyMessage('');
    } catch (err) {
      setBusyMessage('');
      setError(err instanceof Error ? err.message : 'Export failed.');
    }
  }, [
    canExport,
    state.fillBackground,
    selectedAvailableLetters,
    state.letters,
    outlinePaint,
    accentPaint,
    state.backingEnabled,
    backingPaint,
    state.backingThickness,
    state.backingOffsetX,
    state.backingOffsetY,
    state.shadowEnabled,
    state.shadowColor,
    state.shadowBlur,
    state.shadowOffsetX,
    state.shadowOffsetY,
    state.exportScale,
    state.exportFolderName,
  ]);

  const stageSize = useMemo(() => {
    if (!preview.width || !preview.height) {
      return { width: PREVIEW_BOX, height: PREVIEW_BOX };
    }

    const ratio = Math.min(PREVIEW_BOX / preview.width, PREVIEW_BOX / preview.height, 1);

    return {
      width: Math.max(280, Math.round(preview.width * ratio)),
      height: Math.max(280, Math.round(preview.height * ratio)),
    };
  }, [preview.width, preview.height]);

  return (
    <div className="min-h-screen bg-[#f7f4ef] text-slate-800">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <div className="mb-6 rounded-[28px] bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b37b57]">
                Texas Gal Digital Designs
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                Alphabet Generator
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Easy, fast, and beginner-friendly. Upload one ZIP that contains fills, outlines,
                and optional accents. Outline is your main outline. Accent is your top detail.
              </p>
            </div>
            <div className="rounded-2xl bg-[#fcf7f2] px-4 py-3 text-sm text-slate-600 ring-1 ring-[#eddccf]">
              <div>
                <span className="font-semibold text-slate-900">PNG export:</span> tight crop + 300 DPI metadata
              </div>
              <div>
                <span className="font-semibold text-slate-900">Preview:</span> same render pipeline as export
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)] lg:items-start">
          <div className="space-y-6 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto lg:pr-2">
            <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
              <h2 className="text-lg font-semibold text-slate-900">1. Load files</h2>
              <p className="mt-1 text-sm text-slate-500">
                Use one ZIP or upload fills and outlines separately. ZIP should contain fills/A_fill.png, outlines/A_outline.png, and optional accents/A_accent.png.
              </p>

              <div className="mt-4 space-y-4">
                <label className="block rounded-2xl border border-dashed border-[#dec7b5] bg-[#fcfaf7] p-4">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Alphabet ZIP</span>
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-[#1f2937] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleZipUpload(file);
                    }}
                  />
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Best when your ZIP already has fills and outlines set up correctly.
                  </p>
                </label>

                <div className="rounded-2xl border border-[#ece7df] p-4">
                  <div className="mb-3">
                    <span className="block text-sm font-medium text-slate-700">Mac-friendly separate upload</span>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Having trouble with a ZIP on Mac? Upload your fills and outlines as separate PNG files instead.
                    </p>
                  </div>

                  <div className="grid gap-3">
                    <label className="block rounded-2xl border border-[#ece7df] bg-white p-4">
                      <span className="mb-2 block text-sm font-medium text-slate-700">Fills files</span>
                      <input
                        type="file"
                        multiple
                        accept=".png"
                        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-[#1f2937] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                        onChange={(e) => void handleSeparateUpload(e.target.files, 'fill', 'Fills')}
                      />
                      <p className="mt-2 text-xs text-slate-500">Use names like A_fill.png, B_fill.png</p>
                    </label>

                    <label className="block rounded-2xl border border-[#ece7df] bg-white p-4">
                      <span className="mb-2 block text-sm font-medium text-slate-700">Outlines files</span>
                      <input
                        type="file"
                        multiple
                        accept=".png"
                        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-[#1f2937] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                        onChange={(e) => void handleSeparateUpload(e.target.files, 'outline', 'Outlines')}
                      />
                      <p className="mt-2 text-xs text-slate-500">Use names like A_outline.png, B_outline.png</p>
                    </label>

                    <label className="block rounded-2xl border border-[#ece7df] bg-white p-4">
                      <span className="mb-2 block text-sm font-medium text-slate-700">Accents files (optional)</span>
                      <input
                        type="file"
                        multiple
                        accept=".png"
                        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-[#1f2937] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                        onChange={(e) => void handleSeparateUpload(e.target.files, 'accent', 'Accents')}
                      />
                      <p className="mt-2 text-xs text-slate-500">Use names like A_accent.png if your set includes top details</p>
                    </label>
                  </div>
                </div>

                <label className="block rounded-2xl border border-[#ece7df] p-4">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Fill background image</span>
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp"
                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-[#1f2937] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                    onChange={(e) => void applyLoadedImage(e.target.files?.[0] ?? null, 'fillBackground')}
                  />
                  {state.fillBackground && (
                    <p className="mt-2 text-xs text-slate-500">Loaded: {state.fillBackground.file.name}</p>
                  )}
                </label>
              </div>
            </section>

            <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
              <h2 className="text-lg font-semibold text-slate-900">2. Outline</h2>
              <p className="mt-1 text-sm text-slate-500">Main outline layer.</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={cn(
                    'rounded-2xl px-4 py-3 text-sm font-semibold transition',
                    state.outlineMode === 'color' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                  )}
                  onClick={() => setState((prev) => ({ ...prev, outlineMode: 'color' }))}
                >
                  Solid color
                </button>
                <button
                  type="button"
                  className={cn(
                    'rounded-2xl px-4 py-3 text-sm font-semibold transition',
                    state.outlineMode === 'pattern' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                  )}
                  onClick={() => setState((prev) => ({ ...prev, outlineMode: 'pattern' }))}
                >
                  Pattern image
                </button>
              </div>

              {state.outlineMode === 'color' ? (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700">Outline color</label>
                  <input
                    type="color"
                    value={state.outlineColor}
                    className="mt-2 h-12 w-full cursor-pointer rounded-2xl border border-[#ece7df] bg-white p-1"
                    onChange={(e) => setState((prev) => ({ ...prev, outlineColor: e.target.value }))}
                  />
                </div>
              ) : (
                <div className="mt-4">
                  <label className="block rounded-2xl border border-[#ece7df] p-4">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Outline pattern image</span>
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp"
                      className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-[#1f2937] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                      onChange={(e) => void applyLoadedImage(e.target.files?.[0] ?? null, 'outlinePattern')}
                    />
                    {state.outlinePattern && (
                      <p className="mt-2 text-xs text-slate-500">Loaded: {state.outlinePattern.file.name}</p>
                    )}
                  </label>
                </div>
              )}
            </section>

            <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
              <h2 className="text-lg font-semibold text-slate-900">3. Accent</h2>
              <p className="mt-1 text-sm text-slate-500">Optional detail that sits on top of the outline.</p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={cn(
                    'rounded-2xl px-4 py-3 text-sm font-semibold transition',
                    state.accentMode === 'color' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                  )}
                  onClick={() => setState((prev) => ({ ...prev, accentMode: 'color' }))}
                >
                  Solid color
                </button>
                <button
                  type="button"
                  className={cn(
                    'rounded-2xl px-4 py-3 text-sm font-semibold transition',
                    state.accentMode === 'pattern' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                  )}
                  onClick={() => setState((prev) => ({ ...prev, accentMode: 'pattern' }))}
                >
                  Pattern image
                </button>
              </div>

              {state.accentMode === 'color' ? (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700">Accent color</label>
                  <input
                    type="color"
                    value={state.accentColor}
                    className="mt-2 h-12 w-full cursor-pointer rounded-2xl border border-[#ece7df] bg-white p-1"
                    onChange={(e) => setState((prev) => ({ ...prev, accentColor: e.target.value }))}
                  />
                </div>
              ) : (
                <div className="mt-4">
                  <label className="block rounded-2xl border border-[#ece7df] p-4">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Accent pattern image</span>
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp"
                      className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-[#1f2937] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                      onChange={(e) => void applyLoadedImage(e.target.files?.[0] ?? null, 'accentPattern')}
                    />
                    {state.accentPattern && (
                      <p className="mt-2 text-xs text-slate-500">Loaded: {state.accentPattern.file.name}</p>
                    )}
                  </label>
                </div>
              )}
            </section>

            <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">4. Backing</h2>
                  <p className="text-sm text-slate-500">All-around only for this stable version.</p>
                </div>
                <button
                  type="button"
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-semibold transition',
                    state.backingEnabled ? 'bg-[#184a3b] text-white' : 'bg-slate-100 text-slate-700'
                  )}
                  onClick={() => setState((prev) => ({ ...prev, backingEnabled: !prev.backingEnabled }))}
                >
                  {state.backingEnabled ? 'Backing ON' : 'Backing OFF'}
                </button>
              </div>

              {state.backingEnabled && (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      className={cn(
                        'rounded-2xl px-4 py-3 text-sm font-semibold transition',
                        state.backingMode === 'color' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                      )}
                      onClick={() => setState((prev) => ({ ...prev, backingMode: 'color' }))}
                    >
                      Solid color
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'rounded-2xl px-4 py-3 text-sm font-semibold transition',
                        state.backingMode === 'pattern' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                      )}
                      onClick={() => setState((prev) => ({ ...prev, backingMode: 'pattern' }))}
                    >
                      Pattern image
                    </button>
                  </div>

                  {state.backingMode === 'color' ? (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-slate-700">Backing color</label>
                      <input
                        type="color"
                        value={state.backingColor}
                        className="mt-2 h-12 w-full cursor-pointer rounded-2xl border border-[#ece7df] bg-white p-1"
                        onChange={(e) => setState((prev) => ({ ...prev, backingColor: e.target.value }))}
                      />
                    </div>
                  ) : (
                    <div className="mt-4">
                      <label className="block rounded-2xl border border-[#ece7df] p-4">
                        <span className="mb-2 block text-sm font-medium text-slate-700">Backing pattern image</span>
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg,.webp"
                          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-[#1f2937] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                          onChange={(e) => void applyLoadedImage(e.target.files?.[0] ?? null, 'backingPattern')}
                        />
                        {state.backingPattern && (
                          <p className="mt-2 text-xs text-slate-500">Loaded: {state.backingPattern.file.name}</p>
                        )}
                      </label>
                    </div>
                  )}

                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <label className="font-medium text-slate-700">Backing thickness</label>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{backingThicknessDraft}px</span>
                    </div>
                    <input
                      type="range"
                      min={MIN_THICKNESS}
                      max={MAX_THICKNESS}
                      step={1}
                      value={backingThicknessDraft}
                      className="w-full accent-slate-900"
                      onChange={(e) => setBackingThicknessDraft(Number(e.target.value))}
                      onMouseUp={commitBackingThickness}
                      onTouchEnd={commitBackingThickness}
                      onKeyUp={(e) => {
                        if (
                          e.key.startsWith('Arrow') ||
                          e.key === 'Home' ||
                          e.key === 'End' ||
                          e.key === 'PageUp' ||
                          e.key === 'PageDown'
                        ) {
                          commitBackingThickness();
                        }
                      }}
                    />
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <label className="font-medium text-slate-700">Offset right</label>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{state.backingOffsetX}px</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={60}
                        step={1}
                        value={state.backingOffsetX}
                        className="w-full accent-slate-900"
                        onChange={(e) => setState((prev) => ({ ...prev, backingOffsetX: Number(e.target.value) }))}
                      />
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <label className="font-medium text-slate-700">Offset down</label>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{state.backingOffsetY}px</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={60}
                        step={1}
                        value={state.backingOffsetY}
                        className="w-full accent-slate-900"
                        onChange={(e) => setState((prev) => ({ ...prev, backingOffsetY: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                </>
              )}
            </section>

            <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">5. Shadow</h2>
                  <p className="text-sm text-slate-500">Soft shadow between outline/accent and backing.</p>
                </div>

                <button
                  type="button"
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-semibold transition',
                    state.shadowEnabled ? 'bg-[#184a3b] text-white' : 'bg-slate-100 text-slate-600'
                  )}
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      shadowEnabled: !prev.shadowEnabled,
                    }))
                  }
                >
                  {state.shadowEnabled ? 'Shadow ON' : 'Shadow OFF'}
                </button>
              </div>

              {state.shadowEnabled && (
                <>
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-slate-700">Shadow color</label>
                    <input
                      type="color"
                      value={state.shadowColor}
                      className="mt-2 h-12 w-full cursor-pointer rounded-2xl border border-[#ece7df] bg-white p-1"
                      onChange={(e) => setState((prev) => ({ ...prev, shadowColor: e.target.value }))}
                    />
                  </div>

                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <label className="font-medium text-slate-700">Shadow blur</label>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{state.shadowBlur}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={20}
                      step={1}
                      value={state.shadowBlur}
                      className="w-full accent-slate-900"
                      onChange={(e) => setState((prev) => ({ ...prev, shadowBlur: Number(e.target.value) }))}
                    />
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <label className="font-medium text-slate-700">Shadow offset X</label>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{state.shadowOffsetX}px</span>
                      </div>
                      <input
                        type="range"
                        min={-20}
                        max={20}
                        step={1}
                        value={state.shadowOffsetX}
                        className="w-full accent-slate-900"
                        onChange={(e) => setState((prev) => ({ ...prev, shadowOffsetX: Number(e.target.value) }))}
                      />
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <label className="font-medium text-slate-700">Shadow offset Y</label>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{state.shadowOffsetY}px</span>
                      </div>
                      <input
                        type="range"
                        min={-20}
                        max={20}
                        step={1}
                        value={state.shadowOffsetY}
                        className="w-full accent-slate-900"
                        onChange={(e) => setState((prev) => ({ ...prev, shadowOffsetY: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                </>
              )}
            </section>

            <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">6. Letters to export</h2>
                  <p className="text-sm text-slate-500">Preview one letter at a time, export only what you want.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!availableLetters.length}
                    className={cn(
                      'rounded-xl px-3 py-2 text-sm font-medium',
                      availableLetters.length ? 'bg-slate-100 text-slate-700' : 'cursor-not-allowed bg-slate-100 text-slate-400'
                    )}
                    onClick={selectAllLetters}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    disabled={!state.selectedLetters.length}
                    className={cn(
                      'rounded-xl px-3 py-2 text-sm font-medium',
                      state.selectedLetters.length ? 'bg-slate-100 text-slate-700' : 'cursor-not-allowed bg-slate-100 text-slate-400'
                    )}
                    onClick={clearSelectedLetters}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="mt-4 max-h-[320px] overflow-auto rounded-2xl border border-[#ece7df] p-3">
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {availableLetters.map((letter) => {
                    const selected = state.selectedLetters.includes(letter);
                    const previewing = state.currentLetter === letter;
                    return (
                      <div key={letter} className="space-y-2">
                        <button
                          type="button"
                          className={cn(
                            'flex h-12 w-full items-center justify-center rounded-2xl border text-sm font-semibold transition',
                            previewing
                              ? 'border-[#1f2937] bg-[#1f2937] text-white'
                              : 'border-[#ece7df] bg-white text-slate-700 hover:bg-slate-50'
                          )}
                          onClick={() => setState((prev) => ({ ...prev, currentLetter: letter }))}
                        >
                          {friendlyLetterName(letter)}
                        </button>
                        <label className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 px-2 py-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleLetterSelection(letter)}
                          />
                          Export
                        </label>
                      </div>
                    );
                  })}
                  {!availableLetters.length && (
                    <div className="col-span-full rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                      Upload your alphabet ZIP or separate fill/outline files to see letters here.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span className="rounded-full bg-slate-100 px-3 py-1">Available: {availableLetters.length}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1">Selected: {selectedAvailableLetters.length}</span>
                {!state.fillBackground?.image && (
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">Add fill background to export</span>
                )}
              </div>

              <div className="mt-5">
                <label className="block text-sm font-medium text-slate-700">ZIP / folder name</label>
                <input
                  type="text"
                  value={state.exportFolderName}
                  placeholder="My Alphabet Set"
                  className="mt-2 w-full rounded-2xl border border-[#ece7df] bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                  onChange={(e) => setState((prev) => ({ ...prev, exportFolderName: e.target.value }))}
                />
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  This will be used as the ZIP file name when you export.
                </p>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <label className="font-medium text-slate-700">Export quality scale</label>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{state.exportScale}x</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={1}
                  value={state.exportScale}
                  className="w-full accent-slate-900"
                  onChange={(e) => setState((prev) => ({ ...prev, exportScale: clamp(Number(e.target.value), 1, 4) }))}
                />
                <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-slate-500">
                  <div className="rounded-xl bg-slate-50 px-2 py-2 text-center">1x Small</div>
                  <div className="rounded-xl bg-slate-50 px-2 py-2 text-center">2x Medium</div>
                  <div className="rounded-xl bg-slate-50 px-2 py-2 text-center">3x Large</div>
                  <div className="rounded-xl bg-slate-50 px-2 py-2 text-center">4x XL</div>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Lower scale creates smaller PNGs. 2x is the default for an easy everyday size, and you can raise it when you want a larger export.
                </p>
              </div>
            </section>
          </div>

          <div className="space-y-6 lg:sticky lg:top-6 lg:max-h-[calc(100vh-48px)] lg:overflow-y-auto lg:pr-2">
            <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Live preview</h2>
                  <p className="text-sm text-slate-500">
                    {state.currentLetter ? `Showing letter ${friendlyLetterName(state.currentLetter)}` : 'Choose a letter to preview.'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canExport || !!busyMessage}
                  className={cn(
                    'rounded-2xl px-5 py-3 text-sm font-semibold transition',
                    !canExport || !!busyMessage
                      ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                      : 'bg-[#b37b57] text-white hover:brightness-105'
                  )}
                  onClick={() => void handleExport()}
                >
                  {busyMessage ? busyMessage : `Export ZIP (${selectedAvailableLetters.length})`}
                </button>
              </div>

              <div className="mt-5 rounded-[28px] border border-[#ece7df] bg-[#faf9f7] p-4">
                <div className="mx-auto flex min-h-[680px] items-center justify-center rounded-[24px] bg-white p-4 shadow-inner">
                  <div className="rounded-[24px] border border-[#ece7df] bg-[linear-gradient(45deg,#f3f4f6_25%,transparent_25%),linear-gradient(-45deg,#f3f4f6_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f3f4f6_75%),linear-gradient(-45deg,transparent_75%,#f3f4f6_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0px] p-4">
                    <Stage width={stageSize.width} height={stageSize.height}>
                      <Layer>
                        <Rect width={stageSize.width} height={stageSize.height} fill="rgba(255,255,255,0.001)" />
                        {canPreview && previewImage ? (
                          <KonvaImage image={previewImage} x={0} y={0} width={stageSize.width} height={stageSize.height} />
                        ) : (
                          <KonvaText
                            x={0}
                            y={stageSize.height / 2 - 18}
                            width={stageSize.width}
                            align="center"
                            text="Upload ZIP or separate files to preview your letter"
                            fontSize={18}
                            fill="#6b7280"
                          />
                        )}
                      </Layer>
                    </Stage>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
              <h2 className="text-lg font-semibold text-slate-900">Quick notes</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="font-semibold text-slate-900">Fast preview</div>
                  <p className="mt-1">Only one letter is previewed at a time to keep the app quick and smooth.</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="font-semibold text-slate-900">Clean exports</div>
                  <p className="mt-1">Exports are cropped neatly with padding, so your finished letters are clean and ready to use.</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="font-semibold text-slate-900">Easy controls</div>
                  <p className="mt-1">Customize your outline, accent, backing, shadow, and export size with simple beginner-friendly controls.</p>
                </div>
              </div>
            </section>

            {(error || busyMessage) && (
              <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
                {error && <p className="text-sm font-medium text-red-600">{error}</p>}
                {!error && busyMessage && <p className="text-sm font-medium text-slate-700">{busyMessage}</p>}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}