import React, { useMemo, useRef, useState, useCallback } from 'react';
import './index.less';
import { COLORS } from '@/constants/colors';
import { Button } from 'primereact/button';

const CH = COLORS.histogram;

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
  /** 原始数据的最小值 */
  dataMin: number;
  /** 原始数据的最大值 */
  dataMax: number;
  onRangeSelect?: (range: { min: number; max: number } | null) => void;
  selectedRange?: { min: number; max: number } | null;
  /** 统计信息，叠放在直方图上 */
  statistics?: StatisticsOverlay | null;
  // ── 固定横轴（全局范围）──
  /** 全局 log₁₀ 最小值，用于固定横轴 */
  globalLogMin?: number;
  /** 全局 log₁₀ 最大值，用于固定横轴 */
  globalLogMax?: number;
  // ── 对比功能 ──
  /** 对比时间步的 logBins */
  comparisonLogBins?: number[];
  /** 对比时间步的 logBinEdges */
  comparisonLogBinEdges?: number[];
  /** 对比时间步号 */
  comparisonTimestep?: number;
  /** 是否启用对比 */
  comparisonEnabled: boolean;
  /** 切换对比开关 */
  onComparisonToggle: (enabled: boolean) => void;
  /** 对比时间步变更 */
  onComparisonTimestepChange: (timestep: number) => void;
}

const DensityHistogram: React.FC<DensityHistogramProps> = ({
  logBins,
  logBinEdges,
  onRangeSelect,
  selectedRange,
  statistics,
  globalLogMin,
  globalLogMax,
  comparisonLogBins,
  comparisonLogBinEdges,
  comparisonTimestep,
  comparisonEnabled,
  onComparisonToggle,
  onComparisonTimestepChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  // 始终使用对数分箱（直方图本质是对数密度直方图）
  const currentBins = logBins;
  const currentBinEdges = logBinEdges;

  // ── 确定横轴范围 ──
  const xMin = useMemo(() => {
    if (globalLogMin !== undefined && globalLogMax !== undefined) return globalLogMin;
    return currentBinEdges.length > 0 ? currentBinEdges[0] : 0;
  }, [globalLogMin, globalLogMax, currentBinEdges]);

  const xMax = useMemo(() => {
    if (globalLogMin !== undefined && globalLogMax !== undefined) return globalLogMax;
    return currentBinEdges.length > 0 ? currentBinEdges[currentBinEdges.length - 1] : 1;
  }, [globalLogMin, globalLogMax, currentBinEdges]);

  const xSpan = useMemo(() => xMax - xMin || 1, [xMax, xMin]);

  // ── 计算统计数据（统一 y 轴上限）──
  const stats = useMemo(() => {
    let maxCount = 0;
    let total = 0;

    for (let i = 0; i < currentBins.length; i++) {
      if (currentBins[i] > maxCount) maxCount = currentBins[i];
      total += currentBins[i];
    }

    // 如果有对比数据，取两者中较大的 maxCount
    if (comparisonEnabled && comparisonLogBins) {
      for (let i = 0; i < comparisonLogBins.length; i++) {
        if (comparisonLogBins[i] > maxCount) maxCount = comparisonLogBins[i];
      }
    }

    if (total === 0 && maxCount === 0) return null;
    return { total, maxCount };
  }, [currentBins, comparisonLogBins, comparisonEnabled]);

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
    // 留出下方横轴 + Y轴的空间（无上横轴）
    const padding = { top: 14, right: 15, bottom: 60, left: 55 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // ── 清空 ──
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = CH.bg;
    ctx.fillRect(0, 0, width, height);

    // ── 水平网格线 ──
    ctx.strokeStyle = CH.grid;
    ctx.lineWidth = 1;
    const yGridLines = 5;
    for (let i = 0; i <= yGridLines; i++) {
      const y = padding.top + (chartHeight / yGridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
    }

    // ── 垂直网格线 ──
    ctx.strokeStyle = CH.grid;
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

    // ── 计算当前直方图的条形宽度 (log space 均匀分箱) ──
    const currentBinLogWidth = currentBinEdges.length > 1
      ? currentBinEdges[1] - currentBinEdges[0]
      : 0;
    const currentBinDrawWidth = (currentBinLogWidth / xSpan) * chartWidth;
    const maxCount = stats.maxCount;

    // ── 直方图条形（当前时间步，先画作底层）──
    for (let i = 0; i < currentBins.length; i++) {
      const count = currentBins[i];
      if (count === 0) continue;
      const barHeight = (count / maxCount) * chartHeight;
      const edge = currentBinEdges[i];
      const x = padding.left + ((edge - xMin) / xSpan) * chartWidth;
      const y = padding.top + chartHeight - barHeight;

      // 判断是否在选中范围内
      let isSelected = false;
      if (selectedRange && currentBinEdges.length > i) {
        const binMin = currentBinEdges[i];
        const binMax = currentBinEdges[i + 1] ?? binMin;
        isSelected = binMin >= selectedRange.min && binMax <= selectedRange.max;
      }

      if (isSelected) {
        ctx.fillStyle = CH.binSelected;
      } else {
        ctx.fillStyle = CH.binUnselected;
      }

      const gap = Math.max(0.5, currentBinDrawWidth * 0.08);
      ctx.fillRect(x + gap, y, currentBinDrawWidth - gap * 2, barHeight);
    }

    // ── 绘制对比直方图条形（上层，半透明 → 重叠区颜色混合、差异区一目了然）──
    if (comparisonEnabled && comparisonLogBins && comparisonLogBinEdges && comparisonLogBinEdges.length > 1) {
      const compBinLogWidth = comparisonLogBinEdges[1] - comparisonLogBinEdges[0];
      const compBinDrawWidth = (compBinLogWidth / xSpan) * chartWidth;

      for (let i = 0; i < comparisonLogBins.length; i++) {
        const count = comparisonLogBins[i];
        if (count === 0) continue;
        const barHeight = (count / maxCount) * chartHeight;
        const edge = comparisonLogBinEdges[i];
        const x = padding.left + ((edge - xMin) / xSpan) * chartWidth;
        const y = padding.top + chartHeight - barHeight;

        ctx.fillStyle = CH.comparisonBin;
        const gap = Math.max(0.5, compBinDrawWidth * 0.08);
        ctx.fillRect(x + gap, y, compBinDrawWidth - gap * 2, barHeight);
      }
    }

    // ── 选中区域（拖拽中）──
    if (selectionStart !== null && selectionEnd !== null) {
      const sx = Math.min(selectionStart, selectionEnd);
      const ex = Math.max(selectionStart, selectionEnd);
      ctx.fillStyle = CH.dragFill;
      ctx.fillRect(sx, padding.top, ex - sx, chartHeight);
      ctx.strokeStyle = CH.dragStroke;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(sx, padding.top, ex - sx, chartHeight);
      ctx.setLineDash([]);
    }

    // ── 已确认选中范围指示 ──
    if (selectedRange && currentBinEdges.length > 0) {
      const sx = padding.left + ((selectedRange.min - xMin) / xSpan) * chartWidth;
      const ex = padding.left + ((selectedRange.max - xMin) / xSpan) * chartWidth;
      ctx.fillStyle = CH.confirmedFill;
      ctx.fillRect(sx, padding.top, ex - sx, chartHeight);
      ctx.strokeStyle = CH.confirmedStroke;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(sx, padding.top, ex - sx, chartHeight);
      ctx.setLineDash([]);
    }

    // ── 坐标轴线 ──
    ctx.strokeStyle = CH.axis;
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

    // ── Y 轴标签（频数）──
    ctx.fillStyle = CH.labelY;
    ctx.font = '10px "Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
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

    // ── 下横轴标签（使用全局范围，固定不变）──
    ctx.fillStyle = CH.labelX;
    ctx.font = '10px "Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let i = 0; i < numXLabels; i++) {
      const logValue = xMin + (xSpan / (numXLabels - 1)) * i;
      const value = Math.pow(10, logValue);
      const x = padding.left + (chartWidth / (numXLabels - 1)) * i;
      const label = value.toFixed(1);
      ctx.fillText(label, x, padding.top + chartHeight + 6);
    }

    // ── 轴标题 ──
    // Y 轴标题
    ctx.save();
    ctx.translate(14, padding.top + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = CH.labelY;
    ctx.font = '11px "Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('频数', 0, 0);
    ctx.restore();

    // ── 统计标注线 (竖线标注在直方图上) ──
    if (statistics && currentBinEdges.length >= 2) {
      const toX = (rawVal: number) => {
        if (rawVal <= 0) return null;
        const logV = Math.log10(rawVal);
        if (logV < xMin || logV > xMax) return null;
        return padding.left + ((logV - xMin) / xSpan) * chartWidth;
      };

      const annotations: { value: number; color: string; dash: number[]; label: string }[] = [
        { value: statistics.p1,    color: CH.annotationP1P99,  dash: [4, 3], label: 'P1' },
        { value: statistics.p99,   color: CH.annotationP1P99,  dash: [4, 3], label: 'P99' },
        { value: statistics.mean,  color: CH.annotationMean,   dash: [],     label: 'Mean' },
        { value: statistics.median,color: CH.annotationMedian,  dash: [5, 3], label: 'Median' },
      ];

      if (statistics.min > 0 && Math.log10(statistics.min) >= xMin) {
        annotations.push({ value: statistics.min, color: CH.annotationMinMax, dash: [2, 4], label: 'Min' });
      }
      if (statistics.max > 0 && Math.log10(statistics.max) <= xMax) {
        annotations.push({ value: statistics.max, color: CH.annotationMinMax, dash: [2, 4], label: 'Max' });
      }

      // Sort by value so staggered labels don't overlap
      annotations.sort((a, b) => a.value - b.value);

      // 2-row stagger: close values get different heights, avoiding overlap
      const ROW_COUNT = 3;
      const ROW_GAP = 14;

      for (let i = 0; i < annotations.length; i++) {
        const ann = annotations[i];
        const ax = toX(ann.value);
        if (ax === null) continue;

        // Full-height vertical line from top axis to bottom axis
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = ann.dash.length > 0 ? 1.2 : 1.6;
        ctx.setLineDash(ann.dash);
        ctx.beginPath();
        ctx.moveTo(ax, padding.top);
        ctx.lineTo(ax, padding.top + chartHeight);
        ctx.stroke();
        ctx.setLineDash([]);

        // Staggered pill label
        const row = i % ROW_COUNT;
        const offsetY = row * ROW_GAP;

        const labelW = ctx.measureText(ann.label).width + 10;
        const labelH = 16;
        const lx = ax - labelW / 2;
        const ly = padding.top + 3 + offsetY;

        // Rounded pill background
        ctx.fillStyle = ann.color;
        ctx.beginPath();
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

        // Pill border
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.stroke();

        // Pill text
        ctx.fillStyle = CH.pillText;
        ctx.font = 'bold 9px "Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ann.label, ax, ly + labelH / 2);
      }
    }

  }, [currentBins, currentBinEdges, stats, selectedRange, selectionStart, selectionEnd, statistics,
      xMin, xMax, xSpan, comparisonEnabled, comparisonLogBins, comparisonLogBinEdges]);

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
    const padding = { left: 55, right: 15 };
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
    const padding = { left: 55, right: 15 };
    const chartWidth = cssW - padding.left - padding.right;

    // 将像素坐标映射回 log 空间
    const startX = Math.min(selectionStart, selectionEnd);
    const endX = Math.max(selectionStart, selectionEnd);

    const logMin = xMin + ((startX - padding.left) / chartWidth) * xSpan;
    const logMax = xMin + ((endX - padding.left) / chartWidth) * xSpan;

    // 限制在合理范围内
    const clampedMin = Math.max(xMin, Math.min(xMax, logMin));
    const clampedMax = Math.max(xMin, Math.min(xMax, logMax));

    if (clampedMin < clampedMax) {
      onRangeSelect({ min: clampedMin, max: clampedMax });
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

  // ── 对比输入处理 ──
  const handleComparisonInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // 允许空值以方便用户清空后重新输入
    if (raw === '') {
      return;
    }
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 0 && num <= 99) {
      onComparisonTimestepChange(num);
    }
  };

  const handleComparisonInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 回车时启用对比
    if (e.key === 'Enter' && !comparisonEnabled) {
      onComparisonToggle(true);
    }
  };

  return (
    <div className="density-histogram" ref={containerRef}>
      <div className="evolution-chart-title">
        <span className="title-text">密度分布直方图</span>
        <span className="title-actions">
          {/* ── 对比输入框 + 开关 ── */}
          <span className={`comparison-group${comparisonEnabled ? ' active' : ''}`}>
            <input
              type="number"
              className="comparison-input"
              min={0}
              max={99}
              value={comparisonTimestep ?? ''}
              onChange={handleComparisonInputChange}
              onKeyDown={handleComparisonInputKeyDown}
              placeholder="步"
              title="输入对比时间步 (0-99)"
            />
            <button
              type="button"
              className={`comparison-switch${comparisonEnabled ? ' active' : ''}`}
              onClick={() => onComparisonToggle(!comparisonEnabled)}
              title={comparisonEnabled ? '取消对比' : '启用对比'}
            >
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
            </button>
          </span>

          {selectedRange && (
            <Button outlined size="small" onClick={handleClearSelection}>
              ✕ 清除选择
            </Button>
          )}
          <Button
            text
            rounded
            size="small"
            className={`legend-toggle${legendOpen ? ' active' : ''}`}
            onClick={() => setLegendOpen(!legendOpen)}
            tooltip="图例"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
              <circle cx="8" cy="6" r="2" fill="currentColor" />
              <circle cx="16" cy="12" r="2" fill="currentColor" />
              <circle cx="10" cy="18" r="2" fill="currentColor" />
            </svg>
          </Button>
        </span>
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
        {legendOpen && stats && (
          <div className="chart-legend-panel">
            <div className="legend-item">
              <span className="legend-swatch" style={{ background: CH.binUnselected }} />
              <span className="legend-label">当前步</span>
            </div>
            {comparisonEnabled && comparisonTimestep !== undefined && (
              <div className="legend-item">
                <span className="legend-swatch" style={{ background: CH.comparisonBin }} />
                <span className="legend-label">对比步 {comparisonTimestep}</span>
              </div>
            )}
            <div className="legend-item">
              <span className="legend-swatch" style={{ background: CH.binSelected }} />
              <span className="legend-label">已选</span>
            </div>
            <div className="legend-divider" />
            <div className="legend-item legend-stat">
              <span className="legend-label">N={stats.total.toLocaleString()}</span>
            </div>
            <div className="legend-item legend-stat">
              <span className="legend-label">峰值={stats.maxCount.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DensityHistogram;
