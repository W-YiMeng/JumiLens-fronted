import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import * as d3 from 'd3';
import tailsRaw from '@/../tails_output.json';
import { COLORS } from '@/constants/colors';

// ── Types ──
interface TailsStepData {
  skewness: number;
  top1pct: { voxels: number; components: number; singletons: number; avg_size: number; avg_intra_rms: number; avg_nnd: number };
  bot1pct: { voxels: number; components: number; singletons: number; avg_size: number; avg_intra_rms: number; avg_nnd: number };
}
type DataPoint = { step: number; value: number };

const tailsData = tailsRaw as Record<string, TailsStepData>;

// ── Shorthand ──
const C = COLORS.timeAxis;

// ── Margins ──
const M = { top: 18, right: 14, bottom: 26, left: 38 };

interface TailsLineChartProps {
  currentStep: number;
  thumbnailSteps: number[];
  onJumpToStep: (step: number) => void;
  onToggleThumbnailStep: (step: number) => void;
}

const TailsLineChart: React.FC<TailsLineChartProps> = observer(({ currentStep, thumbnailSteps, onJumpToStep, onToggleThumbnailStep }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ w: 300, h: 80 });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; step: number } | null>(null);

  // ── Process data (raw + normalized) ──
  const { steps, normalized, rawValues } = useMemo(() => {
    const keys = Object.keys(tailsData).map(Number).sort((a, b) => a - b);
    const maxStep = keys[keys.length - 1];
    const skewRaw: number[] = [], topRaw: number[] = [], botRaw: number[] = [];
    for (let i = 0; i <= maxStep; i++) {
      const d = tailsData[String(i)];
      if (d) { skewRaw.push(d.skewness); topRaw.push(d.top1pct.avg_size); botRaw.push(d.bot1pct.avg_size); }
    }
    const norm = (arr: number[]) => {
      const min = Math.min(...arr), max = Math.max(...arr), range = max - min || 1;
      return arr.map(v => (v - min) / range);
    };
    const toPoints = (vals: number[]): DataPoint[] => vals.map((v, i) => ({ step: i, value: v }));
    return {
      steps: maxStep,
      normalized: {
        skewness: toPoints(norm(skewRaw)),
        topAvgSize: toPoints(norm(topRaw)),
        botAvgSize: toPoints(norm(botRaw)),
      },
      rawValues: { skewness: skewRaw, topAvgSize: topRaw, botAvgSize: botRaw },
    };
  }, []);

  // ── ResizeObserver → container dimensions ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) setDims({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);

  // ── D3 render ──
  useEffect(() => {
    if (dims.w <= 0 || dims.h <= 0) return;
    const iW = dims.w - M.left - M.right;
    const iH = dims.h - M.top - M.bottom;
    if (iW <= 0 || iH <= 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', dims.w).attr('height', dims.h);

    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

    // ── Scales ──
    const xScale = d3.scaleLinear().domain([0, steps]).range([0, iW]);
    const yScale = d3.scaleLinear().domain([0, 1]).range([iH, 0]);

    // ── Grid ──
    const gridY = [0, 0.25, 0.5, 0.75, 1.0];
    g.selectAll('.grid-h')
      .data(gridY)
      .join('line')
      .attr('class', 'grid-h')
      .attr('x1', 0).attr('x2', iW)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', d => d === 0 || d === 1 ? C.gridMajor : C.grid)
      .attr('stroke-width', 0.5);

    const gridX = d3.range(0, steps + 1, 10);
    g.selectAll('.grid-v')
      .data(gridX)
      .join('line')
      .attr('class', 'grid-v')
      .attr('y1', 0).attr('y2', iH)
      .attr('x1', d => xScale(d)).attr('x2', d => xScale(d))
      .attr('stroke', C.grid)
      .attr('stroke-width', 0.5)
      .attr('stroke-dasharray', '3,3');

    // ── Axes ──
    const xAxis = d3.axisBottom(xScale)
      .ticks(Math.min(steps, 10))
      .tickSize(4)
      .tickFormat(d3.format('d'));
    g.append('g').attr('class', 'x-axis')
      .attr('transform', `translate(0,${iH})`)
      .call(xAxis)
      .call(g => g.select('.domain').attr('stroke', C.axis).attr('stroke-width', 0.6))
      .call(g => g.selectAll('.tick line').attr('stroke', C.axis).attr('stroke-width', 0.4))
      .call(g => g.selectAll('.tick text').attr('fill', C.tickText).attr('font-size', 9).attr('font-family', 'sans-serif'));

    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickSize(4)
      .tickFormat(d3.format('.1f'));
    g.append('g').attr('class', 'y-axis')
      .call(yAxis)
      .call(g => g.select('.domain').attr('stroke', 'none'))
      .call(g => g.selectAll('.tick line').attr('stroke', C.axis).attr('stroke-width', 0.4))
      .call(g => g.selectAll('.tick text').attr('fill', C.tickText).attr('font-size', 9).attr('font-family', 'sans-serif').attr('x', -3));

    // ── Area generator (skewness) ──
    const areaGen = d3.area<DataPoint>()
      .x(d => xScale(d.step))
      .y0(iH)
      .y1(d => yScale(d.value))
      .curve(d3.curveLinear);

    // ── Line generator ──
    const lineGen = d3.line<DataPoint>()
      .x(d => xScale(d.step))
      .y(d => yScale(d.value))
      .curve(d3.curveLinear);

    // ── Skewness area ──
    const gradId = `areaGrad-${dims.w}-${dims.h}`;
    const defs = svg.select('defs');
    if (!defs.empty()) defs.remove();
    const defsNew = svg.append('defs');
    const grad = defsNew.append('linearGradient').attr('id', gradId)
      .attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
    grad.append('stop').attr('offset', '0%').attr('stop-color', C.skewness).attr('stop-opacity', 0.35);
    grad.append('stop').attr('offset', '50%').attr('stop-color', C.skewness).attr('stop-opacity', 0.10);
    grad.append('stop').attr('offset', '100%').attr('stop-color', C.skewness).attr('stop-opacity', 0.02);

    g.append('path').datum(normalized.skewness)
      .attr('fill', `url(#${gradId})`)
      .attr('d', areaGen);

    // ── Skewness line ──
    g.append('path').datum(normalized.skewness)
      .attr('fill', 'none').attr('stroke', C.skewness)
      .attr('stroke-width', 1.2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round')
      .attr('d', lineGen);

    // ── High density line ──
    g.append('path').datum(normalized.topAvgSize)
      .attr('fill', 'none').attr('stroke', C.highDensity)
      .attr('stroke-width', 1.0).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round')
      .attr('d', lineGen);

    // ── Low density line ──
    g.append('path').datum(normalized.botAvgSize)
      .attr('fill', 'none').attr('stroke', C.lowDensity)
      .attr('stroke-width', 1.0).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round')
      .attr('d', lineGen);

    // ── Thumbnail markers ──
    g.selectAll('.thumb-marker')
      .data(thumbnailSteps)
      .join('polygon')
      .attr('class', 'thumb-marker')
      .attr('points', d => {
        const cx = xScale(d), cy = iH;
        return `${cx - 3},${cy} ${cx + 3},${cy} ${cx},${cy - 5}`;
      })
      .attr('fill', C.thumbMarker).attr('opacity', 0.65)
      .style('pointer-events', 'none');

    // ── Current step indicator ──
    const cs = currentStep;
    if (cs >= 0 && cs <= steps) {
      const cx = xScale(cs);

      // Highlight band
      g.append('rect')
        .attr('x', cx - 1.5).attr('y', 0)
        .attr('width', 3).attr('height', iH)
        .attr('fill', C.highlightBand)
        .style('pointer-events', 'none');

      // Dashed line
      g.append('line')
        .attr('x1', cx).attr('x2', cx)
        .attr('y1', 0).attr('y2', iH)
        .attr('stroke', C.indicator).attr('stroke-width', 0.8)
        .attr('stroke-dasharray', '5,4')
        .style('pointer-events', 'none');

      // Dots at intersections
      const skewY = yScale(normalized.skewness[cs]?.value ?? 0);
      const topY = yScale(normalized.topAvgSize[cs]?.value ?? 0);
      const botY = yScale(normalized.botAvgSize[cs]?.value ?? 0);

      g.append('circle').attr('cx', cx).attr('cy', skewY).attr('r', 2.2)
        .attr('fill', C.skewness).attr('stroke', C.dotStroke).attr('stroke-width', 0.8);
      g.append('circle').attr('cx', cx).attr('cy', topY).attr('r', 1.8)
        .attr('fill', C.highDensity).attr('stroke', C.dotStroke).attr('stroke-width', 0.6);
      g.append('circle').attr('cx', cx).attr('cy', botY).attr('r', 1.8)
        .attr('fill', C.lowDensity).attr('stroke', C.dotStroke).attr('stroke-width', 0.6);
    }
  }, [dims, steps, normalized, thumbnailSteps, currentStep]);

  // ── Interaction handlers ──
  const eventToStep = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left - M.left;
    const iW = dims.w - M.left - M.right;
    const ratio = x / iW;
    return Math.max(0, Math.min(steps, Math.round(ratio * steps)));
  }, [steps, dims.w]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const step = eventToStep(e.clientX);
    if (e.shiftKey) { onToggleThumbnailStep(step); onJumpToStep(step); }
    else onJumpToStep(step);
  }, [eventToStep, onJumpToStep, onToggleThumbnailStep]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const step = eventToStep(e.clientX);
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, step });
  }, [eventToStep]);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // ── Tooltip data (uses raw values, not normalized) ──
  const tooltipValues = tooltip
    ? {
        skewness: rawValues.skewness[tooltip.step]?.toFixed(5),
        topAvgSize: rawValues.topAvgSize[tooltip.step]?.toFixed(2),
        botAvgSize: rawValues.botAvgSize[tooltip.step]?.toFixed(2),
      }
    : null;

  return (
    <div className="tails-chart" ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
     

      {/* Legend */}
      <div className="tails-chart-legend">
        <span style={{ color: C.skewness }}>▨ 偏度</span>
        <span style={{ color: C.highDensity }}>— 高密度</span>
        <span style={{ color: C.lowDensity }}>— 低密度</span>
      </div>

      {/* SVG (D3 draws into this) */}
      <svg ref={svgRef} onClick={handleClick} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'pointer' }} />

      {/* Tooltip */}
      {tooltip && tooltipValues && (
        <div className="tails-chart-tooltip" style={{ left: tooltip.x + 12, top: Math.max(2, tooltip.y - 50) }}>
          <div className="tails-chart-tooltip-step">Step {tooltip.step}</div>
          <div style={{ color: C.skewness }}>偏度 {tooltipValues.skewness}</div>
          <div style={{ color: C.highDensity }}>高密度 {tooltipValues.topAvgSize}</div>
          <div style={{ color: C.lowDensity }}>低密度 {tooltipValues.botAvgSize}</div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 'clamp(7px, 0.5vw, 9px)', marginTop: 2, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 2 }}>
            {thumbnailSteps.includes(tooltip.step) ? 'Shift+点击 移除缩略图' : 'Shift+点击 加入缩略图'}
          </div>
        </div>
      )}
    </div>
  );
});

export default TailsLineChart;
