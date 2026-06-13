import React, { useMemo, useRef, useState, useCallback } from 'react';
import './index.less';

interface StatisticsOverlay {
  min: number;
  max: number;
  mean: number;
  std: number;
  median: number;
  p1: number;
  p99: number;
}

interface DensityHistogramProps {
  bins: number[];
  binEdges: number[];
  logBins: number[];
  logBinEdges: number[];
  timestep: number;
  /** 原始数据的最小值（用于计算归一化上横轴） */
  dataMin: number;
  /** 原始数据的最大值（用于计算归一化上横轴） */
  dataMax: number;
  onRangeSelect?: (range: { min: number; max: number } | null) => void;
  selectedRange?: { min: number; max: number } | null;
  /** 统计信息，叠放在直方图上 */
  statistics?: StatisticsOverlay | null;
}

const DensityHistogram: React.FC<DensityHistogramProps> = ({
  bins,
  binEdges,
  logBins,
  logBinEdges,
  timestep,
  dataMin,
  dataMax,
  onRangeSelect,
  selectedRange,
  statistics,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);

  // 始终使用对数分箱（直方图本质是对数密度直方图）
  const currentBins = logBins;
  const currentBinEdges = logBinEdges;

  // 计算统计数据
  const stats = useMemo(() => {
    if (currentBins.length === 0) return null;

    const total = currentBins.reduce((sum, count) => sum + count, 0);
    const maxCount = Math.max(...currentBins);

    return { total, maxCount };
  }, [currentBins]);

  // ── 绘制直方图 ──────────────────────────────────────────────
  const drawHistogram = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || currentBins.length === 0 || !stats) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = container.getBoundingClientRect();
    const cssW = rect.width;
    const cssH = rect.height;

    // Retina: buffer 尺寸 = CSS 尺寸 × dpr
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    const width = cssW;
    const height = cssH;
    // 留出上下双横轴 + Y轴的空间
    const padding = { top: 48, right: 12, bottom: 60, left: 62 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // ── 清空 ──
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // ── 水平网格线 ──
    ctx.strokeStyle = '#f5f5f5';
    ctx.lineWidth = 1;
    const yGridLines = 5;
    for (let i = 0; i <= yGridLines; i++) {
      const y = padding.top + (chartHeight / yGridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
    }

    // ── 垂直网格线（与上下横轴标签对齐）──
    ctx.strokeStyle = '#f5f5f5';
    ctx.setLineDash([3, 3]);
    const numXLabels = 7;
    for (let i = 0; i < numXLabels; i++) {
      const x = padding.left + (chartWidth / (numXLabels - 1)) * i;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // ── 直方图条形 ──
    const binWidth = chartWidth / currentBins.length;
    const maxCount = stats.maxCount;

    for (let i = 0; i < currentBins.length; i++) {
      const count = currentBins[i];
      if (count === 0) continue;
      const barHeight = (count / maxCount) * chartHeight;
      const x = padding.left + i * binWidth;
      const y = padding.top + chartHeight - barHeight;

      // 判断是否在选中范围内
      let isSelected = false;
      if (selectedRange && logBinEdges.length > i) {
        const binMin = logBinEdges[i];
        const binMax = logBinEdges[i + 1] ?? binMin;
        isSelected = binMin >= selectedRange.min && binMax <= selectedRange.max;
      }

      if (isSelected) {
        ctx.fillStyle = '#ff6b6b';
      } else {
        ctx.fillStyle = '#1677ff';
      }

      const gap = Math.max(0.5, binWidth * 0.08);
      ctx.fillRect(x + gap, y, binWidth - gap * 2, barHeight);
    }

    // ── 选中区域（拖拽中）──
    if (selectionStart !== null && selectionEnd !== null) {
      const sx = Math.min(selectionStart, selectionEnd);
      const ex = Math.max(selectionStart, selectionEnd);
      ctx.fillStyle = 'rgba(255, 107, 107, 0.12)';
      ctx.fillRect(sx, padding.top, ex - sx, chartHeight);
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(sx, padding.top, ex - sx, chartHeight);
      ctx.setLineDash([]);
    }

    // ── 已确认选中范围指示 ──
    if (selectedRange && logBinEdges.length > 0) {
      const minIndex = logBinEdges.findIndex(edge => edge >= selectedRange.min);
      const maxIndex = logBinEdges.findIndex(edge => edge >= selectedRange.max);
      if (minIndex !== -1 && maxIndex !== -1) {
        const sx = padding.left + minIndex * binWidth;
        const ex = padding.left + maxIndex * binWidth;
        ctx.fillStyle = 'rgba(250, 173, 20, 0.12)';
        ctx.fillRect(sx, padding.top, ex - sx, chartHeight);
        ctx.strokeStyle = '#faad14';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(sx, padding.top, ex - sx, chartHeight);
        ctx.setLineDash([]);
      }
    }

    // ── 坐标轴线 ──
    ctx.strokeStyle = '#d9d9d9';
    ctx.lineWidth = 1.5;
    // Y 轴
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.stroke();
    // 下 X 轴
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartHeight);
    ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
    ctx.stroke();
    // 上 X 轴
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left + chartWidth, padding.top);
    ctx.stroke();

    // ── Y 轴标签（频数）──
    ctx.fillStyle = '#8c8c8c';
    ctx.font = '10px -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= yGridLines; i++) {
      const value = (maxCount / yGridLines) * (yGridLines - i);
      const y = padding.top + (chartHeight / yGridLines) * i;
      let label: string;
      if (value >= 1e6) label = (value / 1e6).toFixed(1) + 'M';
      else if (value >= 1e3) label = (value / 1e3).toFixed(1) + 'K';
      else label = value.toFixed(0);
      ctx.fillText(label, padding.left - 8, y);
    }

    // ── 下横轴标签（log₁₀ 原始密度）──
    ctx.fillStyle = '#555';
    ctx.font = '10px -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let i = 0; i < numXLabels; i++) {
      const binIndex = Math.floor((currentBinEdges.length - 1) * i / (numXLabels - 1));
      const value = currentBinEdges[binIndex];
      const x = padding.left + (chartWidth / (numXLabels - 1)) * i;
      const label = value.toFixed(1);
      ctx.fillText(label, x, padding.top + chartHeight + 6);
    }

    // ── 上横轴标签（归一化 0-1 密度）──
    ctx.fillStyle = '#1677ff';
    ctx.font = '10px -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const dataSpan = dataMax - dataMin;
    for (let i = 0; i < numXLabels; i++) {
      const binIndex = Math.floor((logBinEdges.length - 1) * i / (numXLabels - 1));
      const logVal = logBinEdges[binIndex];
      const rawVal = Math.pow(10, logVal);
      const normVal = dataSpan > 0 ? (rawVal - dataMin) / dataSpan : 0;
      const x = padding.left + (chartWidth / (numXLabels - 1)) * i;
      const label = normVal.toFixed(2);
      ctx.fillText(label, x, padding.top - 6);
    }

    // ── 轴标题 ──
    // Y 轴标题
    ctx.save();
    ctx.translate(14, padding.top + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#8c8c8c';
    ctx.font = '11px -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('频数', 0, 0);
    ctx.restore();

    // 下横轴标题
    ctx.fillStyle = '#555';
    ctx.font = '11px -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('密度 (log₁₀)', padding.left + chartWidth / 2, padding.top + chartHeight + 26);

    // 上横轴标题
    ctx.fillStyle = '#1677ff';
    ctx.font = '11px -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('归一化密度 [0,1]', padding.left + chartWidth / 2, padding.top - 24);

    // ── 图例 (右上) ──
    const legendX = padding.left + chartWidth - 120;
    const legendY = padding.top + 8;
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(legendX, legendY, 10, 10);
    ctx.fillStyle = '#555';
    ctx.font = '10px -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('已选', legendX + 14, legendY + 5);
    ctx.fillStyle = '#1677ff';
    ctx.fillRect(legendX + 45, legendY, 10, 10);
    ctx.fillText('全部', legendX + 59, legendY + 5);
    ctx.fillStyle = '#8c8c8c';
    ctx.textBaseline = 'top';
    ctx.fillText(`N=${stats.total.toLocaleString()}`, legendX, legendY + 18);
    ctx.fillText(`峰值=${maxCount.toLocaleString()}`, legendX, legendY + 30);

    // ── 统计标注线 (竖线标注在直方图上) ──
    if (statistics && logBinEdges.length >= 2) {
      const logMin = logBinEdges[0];
      const logMax = logBinEdges[logBinEdges.length - 1];
      const logSpan = logMax - logMin || 1;

      const toX = (rawVal: number) => {
        if (rawVal <= 0) return null;
        const logV = Math.log10(rawVal);
        // Clamp to visible range
        if (logV < logMin || logV > logMax) return null;
        return padding.left + ((logV - logMin) / logSpan) * chartWidth;
      };

      // 标注线定义: { key, value, color, dash, label, labelOffset }
      const annotations: { value: number; color: string; dash: number[]; label: string; offsetY: number }[] = [
        { value: statistics.p1,   color: '#ff4d4f', dash: [4, 3], label: 'P1',   offsetY: 0 },
        { value: statistics.p99,  color: '#ff4d4f', dash: [4, 3], label: 'P99',  offsetY: 12 },
        { value: statistics.mean, color: '#1d39c4', dash: [],     label: 'Mean', offsetY: 0 },
        { value: statistics.median, color: '#52c41a', dash: [5, 3], label: 'Median', offsetY: 12 },
      ];

      // Optional min/max if within a reasonable range
      if (statistics.min > 0 && Math.log10(statistics.min) >= logMin) {
        annotations.push({ value: statistics.min, color: '#999', dash: [2, 4], label: 'Min', offsetY: 0 });
      }
      if (statistics.max > 0 && Math.log10(statistics.max) <= logMax) {
        annotations.push({ value: statistics.max, color: '#999', dash: [2, 4], label: 'Max', offsetY: 12 });
      }

      // Sort by value so labels don't overlap too badly
      annotations.sort((a, b) => a.value - b.value);

      for (const ann of annotations) {
        const ax = toX(ann.value);
        if (ax === null) continue;

        // Vertical line
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = ann.dash.length > 0 ? 1.2 : 1.6;
        ctx.setLineDash(ann.dash);
        ctx.beginPath();
        ctx.moveTo(ax, padding.top + 18); // start below top labels
        ctx.lineTo(ax, padding.top + chartHeight);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label pill
        const labelW = ctx.measureText(ann.label).width + 10;
        const labelH = 16;
        const lx = ax - labelW / 2;
        const ly = padding.top + 2 + ann.offsetY;

        ctx.fillStyle = ann.color;
        ctx.beginPath();
        // small rounded pill
        const lr = 3;
        const rx = lx, ry = ly, rw = labelW, rh = labelH;
        ctx.moveTo(rx + lr, ry);
        ctx.lineTo(rx + rw - lr, ry);
        ctx.arcTo(rx + rw, ry, rx + rw, ry + lr, lr);
        ctx.lineTo(rx + rw, ry + rh - lr);
        ctx.arcTo(rx + rw, ry + rh, rx + rw - lr, ry + rh, lr);
        ctx.lineTo(rx + lr, ry + rh);
        ctx.arcTo(rx, ry + rh, rx, ry + rh - lr, lr);
        ctx.lineTo(rx, ry + lr);
        ctx.arcTo(rx, ry, rx + lr, ry, lr);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 8px -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ann.label, ax, ly + labelH / 2);
      }
    }

  }, [currentBins, currentBinEdges, logBinEdges, stats, selectedRange, selectionStart, selectionEnd, timestep, dataMin, dataMax, statistics]);

  // ── 响应式重绘 ──
  React.useEffect(() => {
    drawHistogram();

    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => drawHistogram());
    ro.observe(container);
    return () => ro.disconnect();
  }, [drawHistogram]);

  // ── 鼠标事件 ──
  const getCanvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x } = getCanvasCoords(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssW = canvas.getBoundingClientRect().width;
    const padding = { left: 62, right: 12 };
    const chartWidth = cssW - padding.left - padding.right;

    if (x >= padding.left && x <= padding.left + chartWidth) {
      setIsSelecting(true);
      setSelectionStart(x);
      setSelectionEnd(x);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelecting) return;
    const { x } = getCanvasCoords(e);
    setSelectionEnd(x);
  };

  const handleMouseUp = () => {
    if (!isSelecting || !onRangeSelect) {
      setIsSelecting(false);
      setSelectionStart(null);
      setSelectionEnd(null);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || selectionStart === null || selectionEnd === null) {
      setIsSelecting(false);
      return;
    }

    const cssW = canvas.getBoundingClientRect().width;
    const padding = { left: 62, right: 12 };
    const chartWidth = cssW - padding.left - padding.right;
    const binWidth = chartWidth / currentBins.length;

    const startX = Math.min(selectionStart, selectionEnd);
    const endX = Math.max(selectionStart, selectionEnd);

    const startBin = Math.floor((startX - padding.left) / binWidth);
    const endBin = Math.floor((endX - padding.left) / binWidth);

    if (startBin >= 0 && endBin < currentBinEdges.length - 1 && startBin <= endBin) {
      const minDensity = logBinEdges[Math.max(0, startBin)];
      const maxDensity = logBinEdges[Math.min(logBinEdges.length - 1, endBin + 1)];
      onRangeSelect({ min: minDensity, max: maxDensity });
    }

    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  const handleClearSelection = () => {
    if (onRangeSelect) {
      onRangeSelect(null);
    }
  };

  // ── 格式化选中范围显示 ──
  const formatRangeDisplay = (range: { min: number; max: number }) => {
    const rMin = Math.pow(10, range.min);
    const rMax = Math.pow(10, range.max);
    const dSpan = dataMax - dataMin;
    const nMin = dSpan > 0 ? ((rMin - dataMin) / dSpan) : 0;
    const nMax = dSpan > 0 ? ((rMax - dataMin) / dSpan) : 0;
    return {
      log: `[${range.min.toFixed(2)}, ${range.max.toFixed(2)}]`,
      norm: `[${nMin.toFixed(3)}, ${nMax.toFixed(3)}]`,
    };
  };

  const rangeDisplay = selectedRange ? formatRangeDisplay(selectedRange) : null;

  return (
    <div className="density-histogram" ref={containerRef}>
      <div className="histogram-controls">
        <span className="histogram-title">
          密度分布直方图 <span className="step-badge">Step {timestep}</span>
        </span>
        <div className="controls-right">
          {selectedRange && (
            <button className="clear-btn" onClick={handleClearSelection}>
              ✕ 清除选择
            </button>
          )}
        </div>
      </div>

      <div className="histogram-canvas-wrap">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: isSelecting ? 'col-resize' : 'crosshair' }}
        />
      </div>

      {rangeDisplay && (
        <div className="selection-info">
          <div className="info-row">
            <span className="info-label">log₁₀ 范围</span>
            <span className="info-value">{rangeDisplay.log}</span>
          </div>
          <div className="info-row">
            <span className="info-label">归一化范围</span>
            <span className="info-value norm">{rangeDisplay.norm}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default DensityHistogram;
