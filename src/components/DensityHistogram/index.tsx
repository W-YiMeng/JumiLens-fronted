import React, { useRef, useEffect, useState, useCallback } from 'react';
import './index.less';

interface DensityHistogramProps {
  bins: number[];
  binEdges: number[];
  logBins: number[];
  logBinEdges: number[];
  timestep: number;
  p1?: number;
  p99?: number;
  median?: number;
  onRangeSelect?: (range: { min: number; max: number } | null) => void;
  selectedRange?: { min: number; max: number } | null;
}

const DensityHistogram: React.FC<DensityHistogramProps> = ({
  bins,
  binEdges,
  logBins,
  logBinEdges,
  timestep,
  p1,
  p99,
  median,
  onRangeSelect,
  selectedRange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 600, h: 350 });

  // Brush selection state
  const [isSelecting, setIsSelecting] = useState(false);
  const selRef = useRef<{ startX: number; endX: number } | null>(null);
  const [selOverlay, setSelOverlay] = useState<{ x1: number; x2: number } | null>(null);

  const currentBins = logBins;
  const currentBinEdges = logBinEdges;

  // ResizeObserver — only manages canvas bitmap size, never triggers re-render
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(width);
      const h = Math.round(height);
      // Set canvas bitmap
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      // Set CSS size
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      // Store logical size for drawing
      sizeRef.current = { w, h };
      // Trigger redraw
      drawFrame();
    });
    ro.observe(container);

    function drawFrame() {
      const ctx = canvas!.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const { w, h } = sizeRef.current;
      drawChart(ctx, w, h);
    }

    return () => ro.disconnect();
  }, []);

  // Redraw when data or timestep changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawChart(ctx, sizeRef.current.w, sizeRef.current.h);
  });

  // -------- drawing logic (no side effects) --------
  function drawChart(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number
  ) {
    if (currentBins.length === 0) return;

    const total = currentBins.reduce((s, c) => s + c, 0);
    const maxC = Math.max(...currentBins) || 1;
    const logMax = Math.log10(maxC);

    const cumulative: number[] = [];
    let cs = 0;
    for (const c of currentBins) { cs += c; cumulative.push(cs / total); }

    const pad = { t: 36, r: 20, b: 44, l: 68 };
    const cw = W - pad.l - pad.r;
    const ch = H - pad.t - pad.b;
    const n = currentBins.length;
    const binW = cw / n;

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // Y-axis log ticks
    const yTicks: number[] = [];
    for (let pow = 0; pow <= Math.ceil(logMax); pow++) {
      yTicks.push(Math.pow(10, pow));
    }

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (const tick of yTicks) {
      const gy = pad.t + ch - (Math.log10(tick) / logMax) * ch;
      ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(pad.l + cw, gy); ctx.stroke();
    }

    // Bars (log Y)
    for (let i = 0; i < n; i++) {
      const c = currentBins[i];
      const logH = c > 0 ? Math.log10(c) / logMax : 0;
      const bh = logH * ch;
      const x = pad.l + i * binW;
      const y = pad.t + ch - bh;
      const gradient = ctx.createLinearGradient(0, y, 0, pad.t + ch);
      gradient.addColorStop(0, '#3c5a8c');
      gradient.addColorStop(0.5, '#2e6ab0');
      gradient.addColorStop(1, '#1a3a5c');
      ctx.fillStyle = gradient;
      ctx.fillRect(x + 0.5, y, binW - 1, bh);
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + ch); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t + ch); ctx.lineTo(pad.l + cw, pad.t + ch); ctx.stroke();

    // Y-axis labels (log)
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const tick of yTicks) {
      const gy = pad.t + ch - (Math.log10(tick) / logMax) * ch;
      ctx.fillText(formatCount(tick), pad.l - 8, gy);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xSteps = 6;
    for (let i = 0; i < xSteps; i++) {
      const idx = Math.floor((currentBinEdges.length - 1) * i / (xSteps - 1));
      const v = currentBinEdges[idx];
      const x = pad.l + (cw / (xSteps - 1)) * i;
      ctx.fillText(v.toFixed(2), x, pad.t + ch + 8);
    }

    // Axis titles
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('log\u{2081}\u{2080}(density)', pad.l + cw / 2, pad.t + ch + 28);

    ctx.save();
    ctx.translate(10, pad.t + ch / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Count (log)', 0, 0);
    ctx.restore();

    // Title
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Step ${timestep}`, W / 2, 16);

    // map density value → x position
    const histMin = currentBinEdges[0];
    const histMax = currentBinEdges[currentBinEdges.length - 1];
    const histRange = histMax - histMin;
    const valToX = (v: number) => pad.l + ((v - histMin) / histRange) * cw;

    // Median line
    if (median !== undefined) {
      const mx = valToX(median);
      ctx.strokeStyle = 'rgba(255,230,109,0.6)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(mx, pad.t); ctx.lineTo(mx, pad.t + ch); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffe66d';
      ctx.font = '9px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('median', mx, pad.t - 4);
    }

    // ±1σ band
    if (cumulative.length > 0) {
      const p16 = cumulative.findIndex(v => v >= 0.16);
      const p84 = cumulative.findIndex(v => v >= 0.84);
      if (p16 >= 0 && p84 >= 0) {
        const x1 = pad.l + p16 * binW;
        const x2 = pad.l + p84 * binW;
        ctx.fillStyle = 'rgba(78,205,196,0.12)';
        ctx.fillRect(x1, pad.t, x2 - x1, ch);
        ctx.strokeStyle = '#4ecdc4';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(x1, pad.t); ctx.lineTo(x1, pad.t + ch); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2, pad.t); ctx.lineTo(x2, pad.t + ch); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // P1 / P99 — using exact percentile values
    // Brush selection overlay
    if (selOverlay) {
      const x1 = Math.min(selOverlay.x1, selOverlay.x2);
      const x2 = Math.max(selOverlay.x1, selOverlay.x2);
      ctx.fillStyle = 'rgba(255,215,0,0.2)';
      ctx.fillRect(x1, pad.t, x2 - x1, ch);
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(x1, pad.t, x2 - x1, ch);
      ctx.setLineDash([]);
    }

    if (p99 !== undefined) {
      const px = valToX(p99);
      ctx.fillStyle = 'rgba(255,107,107,0.06)';
      ctx.fillRect(px, pad.t, pad.l + cw - px, ch);
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, pad.t + ch); ctx.stroke();
      ctx.setLineDash([]);
      drawBadge(ctx, px, pad.t - 2, 'P99=' + p99.toFixed(2), '#ff6b6b');
    }
    if (p1 !== undefined) {
      const px = valToX(p1);
      ctx.fillStyle = 'rgba(78,205,196,0.06)';
      ctx.fillRect(pad.l, pad.t, px - pad.l, ch);
      ctx.strokeStyle = '#4ecdc4';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, pad.t + ch); ctx.stroke();
      ctx.setLineDash([]);
      drawBadge(ctx, px, pad.t + ch + 18, 'P1=' + p1.toFixed(2), '#4ecdc4');
    }
  }

  function drawBadge(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    text: string, color: string
  ) {
    ctx.font = 'bold 10px Consolas, monospace';
    const m = ctx.measureText(text);
    const bw = m.width + 12;
    const bh = 18;
    const bx = x - bw / 2;
    // Background pill
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(bx, y - bh / 2, bw, bh, 4);
    ctx.fill();
    // Text
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  // ---- mouse handlers ----
  const getX = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect ? e.clientX - rect.left : 0;
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    const x = getX(e);
    selRef.current = { startX: x, endX: x };
    setIsSelecting(true);
    setSelOverlay({ x1: x, x2: x });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isSelecting || !selRef.current) return;
    const x = getX(e);
    selRef.current.endX = x;
    setSelOverlay({ x1: selRef.current.startX, x2: x });
  };

  const handleMouseUp = () => {
    if (!isSelecting || !selRef.current || !onRangeSelect) {
      setIsSelecting(false);
      setSelOverlay(null);
      return;
    }
    const { startX, endX } = selRef.current;
    const padL = 68;
    const cw = sizeRef.current.w - padL - 20;
    const n = currentBins.length;
    const binW = cw / n;
    const histMin = currentBinEdges[0];
    const histRange = currentBinEdges[currentBinEdges.length - 1] - histMin;

    const x1 = Math.min(startX, endX);
    const x2 = Math.max(startX, endX);

    const dMin = histMin + ((x1 - padL) / cw) * histRange;
    const dMax = histMin + ((x2 - padL) / cw) * histRange;

    if (dMax > dMin) {
      onRangeSelect({ min: dMin, max: dMax });
    }

    setIsSelecting(false);
    setSelOverlay(null);
  };

  const handleClear = () => {
    if (onRangeSelect) onRangeSelect(null);
  };

  return (
    <div className="density-histogram" ref={containerRef}>
      {selectedRange && (
        <div className="histogram-range-badge">
          <span>Filter: [{selectedRange.min.toFixed(2)}, {selectedRange.max.toFixed(2)}]</span>
          <button onClick={handleClear}>✕</button>
        </div>
      )}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isSelecting ? 'col-resize' : 'crosshair' }}
      />
      {!selectedRange && (
        <div className="histogram-hint">Drag to select density range in 3D view</div>
      )}
    </div>
  );
};

function formatCount(v: number): string {
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  return Math.round(v).toString();
}

export default DensityHistogram;
