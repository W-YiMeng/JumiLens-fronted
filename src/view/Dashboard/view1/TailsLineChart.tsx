import React, { useMemo, useState, useCallback, useRef } from 'react';
import { observer } from 'mobx-react-lite';
// Import tails analysis data from project root (Vite/TS with resolveJsonModule)
import tailsRaw from '@/../tails_output.json';

// ── Types ──
interface TailsStepData {
  skewness: number;
  top1pct: {
    voxels: number;
    components: number;
    singletons: number;
    avg_size: number;
    avg_intra_rms: number;
    avg_nnd: number;
  };
  bot1pct: {
    voxels: number;
    components: number;
    singletons: number;
    avg_size: number;
    avg_intra_rms: number;
    avg_nnd: number;
  };
}

const tailsData = tailsRaw as Record<string, TailsStepData>;

// ── Series color / label config ──
const SERIES = [
  { key: 'skewness' as const, label: '偏度', color: '#ffd700' },
  { key: 'topAvgSize' as const, label: '高密度', color: '#4fc3f7' },
  { key: 'botAvgSize' as const, label: '低密度', color: '#ff6b6b' },
];

interface TailsLineChartProps {
  currentStep: number;
  thumbnailSteps: number[];
  onJumpToStep: (step: number) => void;
  onToggleThumbnailStep: (step: number) => void;
}

const TailsLineChart: React.FC<TailsLineChartProps> = observer(({ currentStep, thumbnailSteps, onJumpToStep, onToggleThumbnailStep }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; step: number } | null>(null);

  // ── Process raw data into ordered arrays ──
  const { steps, series } = useMemo(() => {
    const keys = Object.keys(tailsData)
      .map(Number)
      .sort((a, b) => a - b);
    const maxStep = keys[keys.length - 1];

    const skewness: number[] = [];
    const topAvgSize: number[] = [];
    const botAvgSize: number[] = [];

    for (let i = 0; i <= maxStep; i++) {
      const d = tailsData[String(i)];
      if (d) {
        skewness.push(d.skewness);
        topAvgSize.push(d.top1pct.avg_size);
        botAvgSize.push(d.bot1pct.avg_size);
      }
    }

    return {
      steps: maxStep,
      series: { skewness, topAvgSize, botAvgSize },
    };
  }, []);

  // ── Min-max normalize each series independently ──
  const normalized = useMemo(() => {
    const norm = (arr: number[]) => {
      const min = Math.min(...arr);
      const max = Math.max(...arr);
      const range = max - min || 1;
      return arr.map((v) => (v - min) / range);
    };
    return {
      skewness: norm(series.skewness),
      topAvgSize: norm(series.topAvgSize),
      botAvgSize: norm(series.botAvgSize),
    };
  }, [series]);

  // ── Build SVG polyline points ──
  const polylines = useMemo(() => {
    const toPoints = (arr: number[]) =>
      arr.map((v, i) => `${i},${((1 - v) * 100).toFixed(2)}`).join(' ');
    return {
      skewness: toPoints(normalized.skewness),
      topAvgSize: toPoints(normalized.topAvgSize),
      botAvgSize: toPoints(normalized.botAvgSize),
    };
  }, [normalized]);

  // ── Click → jump to step, Shift+Click → toggle thumbnail ──
  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      const step = Math.round(ratio * steps);
      const clamped = Math.max(0, Math.min(steps, step));
      if (e.shiftKey) {
        onToggleThumbnailStep(clamped);
        onJumpToStep(clamped); // Shift+Click 同时导航到该步，使差异图层可见
      } else {
        onJumpToStep(clamped);
      }
    },
    [steps, onJumpToStep, onToggleThumbnailStep],
  );

  // ── Hover → tooltip ──
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      const step = Math.round(ratio * steps);
      const clamped = Math.max(0, Math.min(steps, step));
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, step: clamped });
    },
    [steps],
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // ── Tooltip display values ──
  const tooltipValues =
    tooltip && series.skewness[tooltip.step] !== undefined
      ? {
          skewness: series.skewness[tooltip.step].toFixed(5),
          topAvgSize: series.topAvgSize[tooltip.step].toFixed(2),
          botAvgSize: series.botAvgSize[tooltip.step].toFixed(2),
        }
      : null;

  const hasData = currentStep < normalized.skewness.length;

  return (
    <div className="tails-chart">
      {/* ── Legend (top-right, tiny) ── */}
      <div className="tails-chart-legend">
        {SERIES.map((s) => (
          <span key={s.key} style={{ color: s.color }}>
            ● {s.label}
          </span>
        ))}
      </div>

      {/* ── SVG chart ── */}
      <svg
        ref={svgRef}
        viewBox="0 0 99 100"
        preserveAspectRatio="none"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="tails-chart-svg"
      >
        {/* Grid lines */}
        <line x1={0} y1={25} x2={99} y2={25} stroke="rgba(255,255,255,0.05)" strokeWidth={0.3} />
        <line x1={0} y1={50} x2={99} y2={50} stroke="rgba(255,255,255,0.05)" strokeWidth={0.3} />
        <line x1={0} y1={75} x2={99} y2={75} stroke="rgba(255,255,255,0.05)" strokeWidth={0.3} />

        {/* Three data polylines */}
        <polyline
          points={polylines.skewness}
          fill="none"
          stroke="#ffd700"
          strokeWidth={0.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
        />
        <polyline
          points={polylines.topAvgSize}
          fill="none"
          stroke="#4fc3f7"
          strokeWidth={0.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
        />
        <polyline
          points={polylines.botAvgSize}
          fill="none"
          stroke="#ff6b6b"
          strokeWidth={0.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
        />

        {/* Thumbnail step markers (small triangles at bottom) */}
        {thumbnailSteps.map((ts) => {
          const cx = ts; // x correlates to step index
          const cy = 96;
          const sz = 2.2;
          return (
            <polygon
              key={`thumb-marker-${ts}`}
              points={`${cx},${cy} ${cx - sz},${cy + sz + 1.5} ${cx + sz},${cy + sz + 1.5}`}
              fill="#ffd700"
              opacity={0.7}
              style={{ pointerEvents: 'none' }}
            />
          );
        })}

        {/* Current step vertical indicator */}
        {hasData && (
          <>
            <line
              x1={currentStep}
              y1={0}
              x2={currentStep}
              y2={100}
              stroke="rgba(255,255,255,0.55)"
              strokeWidth={0.4}
              strokeDasharray="3,3"
            />
            {/* Dots on each line at current step */}
            <circle
              cx={currentStep}
              cy={((1 - normalized.skewness[currentStep]) * 100).toFixed(2)}
              r={1.4}
              fill="#ffd700"
            />
            <circle
              cx={currentStep}
              cy={((1 - normalized.topAvgSize[currentStep]) * 100).toFixed(2)}
              r={1.4}
              fill="#4fc3f7"
            />
            <circle
              cx={currentStep}
              cy={((1 - normalized.botAvgSize[currentStep]) * 100).toFixed(2)}
              r={1.4}
              fill="#ff6b6b"
            />
          </>
        )}
      </svg>

      {/* ── Tooltip ── */}
      {tooltip && tooltipValues && (
        <div className="tails-chart-tooltip" style={{ left: tooltip.x + 10, top: Math.max(0, tooltip.y - 60) }}>
          <div className="tails-chart-tooltip-step">Step {tooltip.step}</div>
          <div style={{ color: '#ffd700' }}>偏度 {tooltipValues.skewness}</div>
          <div style={{ color: '#4fc3f7' }}>高avg {tooltipValues.topAvgSize}</div>
          <div style={{ color: '#ff6b6b' }}>低avg {tooltipValues.botAvgSize}</div>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 'clamp(6px, 0.45vw, 8px)', marginTop: 2, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 2 }}>
            {thumbnailSteps.includes(tooltip.step) ? 'Shift+点击 移除缩略图' : 'Shift+点击 加入缩略图'}
          </div>
        </div>
      )}
    </div>
  );
});

export default TailsLineChart;
