import React, { useRef, useEffect, useCallback, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { volumeStore } from '@/store/volumeStore';

const TF_RES = 256;

const TransferFunctionEditor: React.FC = observer(() => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const draggingRef = useRef(false);

  const CANVAS_H = 36;
  const COLOR_H = 24;
  const OPACITY_H = CANVAS_H - COLOR_H;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const points = volumeStore.transferFunction;
    const w = canvas.width;

    for (let x = 0; x < w; x++) {
      const t = x / (w - 1);
      let cr = 0, cg = 0, cb = 0, ca = 0;

      if (points.length > 0) {
        if (t <= points[0].position) {
          cr = points[0].color[0]; cg = points[0].color[1]; cb = points[0].color[2]; ca = points[0].opacity;
        } else if (t >= points[points.length - 1].position) {
          const last = points[points.length - 1];
          cr = last.color[0]; cg = last.color[1]; cb = last.color[2]; ca = last.opacity;
        } else {
          for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];
            if (t >= p0.position && t <= p1.position) {
              const frac = (t - p0.position) / (p1.position - p0.position);
              cr = p0.color[0] + (p1.color[0] - p0.color[0]) * frac;
              cg = p0.color[1] + (p1.color[1] - p0.color[1]) * frac;
              cb = p0.color[2] + (p1.color[2] - p0.color[2]) * frac;
              ca = p0.opacity + (p1.opacity - p0.opacity) * frac;
              break;
            }
          }
        }
      }

      const r = Math.round(cr * 255);
      const g = Math.round(cg * 255);
      const b = Math.round(cb * 255);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, 0, 1, COLOR_H);

      for (let py = COLOR_H; py < CANVAS_H; py++) {
        const isChecker = (Math.floor(x / 4) + Math.floor((py - COLOR_H) / 4)) % 2 === 0;
        const bg = isChecker ? 170 : 210;
        const ov = Math.round(ca * 255);
        const or = Math.round(ov * (ca) + bg * (1 - ca));
        const og = Math.round(ov * (ca) + bg * (1 - ca));
        const ob = Math.round(ov * (ca) + bg * (1 - ca));
        ctx.fillStyle = `rgb(${or},${og},${ob})`;
        ctx.fillRect(x, py, 1, 1);
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, COLOR_H);
    ctx.lineTo(w, COLOR_H);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '8px sans-serif';
    ctx.fillText('Color', 4, 9);
    ctx.fillText('Opacity', 4, COLOR_H + 9);

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const px = pt.position * w;
      const isSelected = i === selectedIndex;

      ctx.strokeStyle = isSelected ? 'rgba(255,221,0,0.6)' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = isSelected ? 1.5 : 0.5;
      ctx.setLineDash(isSelected ? [] : [3, 3]);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, COLOR_H);
      ctx.stroke();
      ctx.setLineDash([]);

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(px, COLOR_H / 2, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 0, 0.4)';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(px, COLOR_H / 2, isSelected ? 4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#ffdd00' : '#fff';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [selectedIndex]);

  useEffect(() => {
    draw();
  }, [volumeStore.transferFunction, draw]);

  const getClickTarget = useCallback(
    (clientX: number): { index: number; dist: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const t = x / rect.width;
      const points = volumeStore.transferFunction;

      let closestIdx = -1;
      let closestDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const dist = Math.abs(points[i].position - t);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      }
      return { index: closestIdx, dist: closestDist };
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const target = getClickTarget(e.clientX);
      if (!target) return;

      if (target.dist < 0.03) {
        setSelectedIndex(target.index);
        draggingRef.current = true;
      } else {
        setSelectedIndex(null);
        draggingRef.current = false;
      }
    },
    [getClickTarget]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current || selectedIndex === null) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const t = Math.max(0, Math.min(1, x / rect.width));

      const points = [...volumeStore.transferFunction];
      points[selectedIndex] = { ...points[selectedIndex], position: t };
      volumeStore.setTransferFunction(points);
    },
    [selectedIndex]
  );

  const handleMouseUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (selectedIndex === null) return;
      const hex = e.target.value;
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const points = volumeStore.transferFunction.map((p, i) =>
        i === selectedIndex ? { ...p, color: [r, g, b] as [number, number, number] } : p
      );
      volumeStore.setTransferFunction(points);
    },
    [selectedIndex]
  );

  const handleOpacityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (selectedIndex === null) return;
      const opacity = Number(e.target.value);
      const points = volumeStore.transferFunction.map((p, i) =>
        i === selectedIndex ? { ...p, opacity } : p
      );
      volumeStore.setTransferFunction(points);
    },
    [selectedIndex]
  );

  const handlePositionChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (selectedIndex === null) return;
      const position = Number(e.target.value);
      const points = volumeStore.transferFunction.map((p, i) =>
        i === selectedIndex ? { ...p, position } : p
      );
      volumeStore.setTransferFunction(points);
    },
    [selectedIndex]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const t = x / rect.width;

      const target = getClickTarget(e.clientX);
      if (target && target.dist < 0.03) {
        if (volumeStore.transferFunction.length <= 2) return;
        const points = volumeStore.transferFunction.filter((_, i) => i !== target.index);
        volumeStore.setTransferFunction(points);
        setSelectedIndex(null);
        return;
      }

      const points = volumeStore.transferFunction;
      let insertColor: [number, number, number] = [1, 1, 1];
      let insertOpacity = 0.5;
      if (points.length > 0) {
        if (t <= points[0].position) {
          insertColor = [...points[0].color];
          insertOpacity = points[0].opacity;
        } else if (t >= points[points.length - 1].position) {
          insertColor = [...points[points.length - 1].color];
          insertOpacity = points[points.length - 1].opacity;
        } else {
          for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];
            if (t >= p0.position && t <= p1.position) {
              const frac = (t - p0.position) / (p1.position - p0.position);
              insertColor = [
                p0.color[0] + (p1.color[0] - p0.color[0]) * frac,
                p0.color[1] + (p1.color[1] - p0.color[1]) * frac,
                p0.color[2] + (p1.color[2] - p0.color[2]) * frac,
              ];
              insertOpacity = p0.opacity + (p1.opacity - p0.opacity) * frac;
              break;
            }
          }
        }
      }

      const newPoints = [
        ...points,
        { position: t, color: insertColor, opacity: insertOpacity },
      ];
      volumeStore.setTransferFunction(newPoints);
      setSelectedIndex(newPoints.length - 1);
    },
    [getClickTarget]
  );

  const selectedPoint =
    selectedIndex !== null ? volumeStore.transferFunction[selectedIndex] : null;

  const colorHex = selectedPoint
    ? `#${selectedPoint.color
        .map((c) =>
          Math.round(c * 255)
            .toString(16)
            .padStart(2, '0')
        )
        .join('')}`
    : '#ffffff';

  return (
    <div className="tf-editor">
      <div className="tf-title">Transfer Function</div>
      <canvas
        ref={canvasRef}
        className="tf-ramp"
        width={TF_RES}
        height={36}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      />

      {selectedPoint && (
        <div className="tf-point-editor">
          <div className="tf-point-row">
            <label>Pos</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={selectedPoint.position}
              onChange={handlePositionChange}
            />
            <span>{selectedPoint.position.toFixed(2)}</span>
          </div>
          <div className="tf-point-row">
            <label>Color</label>
            <input type="color" value={colorHex} onChange={handleColorChange} />
          </div>
          <div className="tf-point-row">
            <label>Opacity</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={selectedPoint.opacity}
              onChange={handleOpacityChange}
            />
            <span>{selectedPoint.opacity.toFixed(2)}</span>
          </div>
        </div>
      )}

      {!selectedPoint && (
        <div className="tf-hint">Click a point to select · Double-click to add · Double-click point to delete</div>
      )}

      <div className="tf-controls">
        <label>
          Step
          <input
            type="range"
            min={0.004}
            max={0.05}
            step={0.001}
            value={volumeStore.stepSize}
            onChange={(e) => volumeStore.setStepSize(Number(e.target.value))}
          />
        </label>
        <label>
          Density
          <input
            type="range"
            min={0.1}
            max={3.0}
            step={0.1}
            value={volumeStore.densityScale}
            onChange={(e) => volumeStore.setDensityScale(Number(e.target.value))}
          />
        </label>
      </div>

      {/* ── Main: Gradient Weight ── */}
      <div className="tf-grad-controls">
        <div className="tf-grad-header">Gradient Weight (2D TF)</div>
        <label>
          Weight
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volumeStore.gradWeight}
            onChange={(e) => volumeStore.setGradWeight(Number(e.target.value))}
          />
          <span>{volumeStore.gradWeight.toFixed(2)}</span>
        </label>
        <label>
          Low
          <input
            type="range"
            min={0.001}
            max={0.2}
            step={0.001}
            value={volumeStore.gradLow}
            onChange={(e) => volumeStore.setGradLow(Number(e.target.value))}
          />
          <span>{volumeStore.gradLow.toFixed(3)}</span>
        </label>
        <label>
          High
          <input
            type="range"
            min={0.005}
            max={0.5}
            step={0.005}
            value={volumeStore.gradHigh}
            onChange={(e) => volumeStore.setGradHigh(Number(e.target.value))}
          />
          <span>{volumeStore.gradHigh.toFixed(3)}</span>
        </label>
      </div>

      {/* ── Main: Diff Layers ── */}
      <div className="tf-diff-controls">
        <div className="tf-diff-header">Diff Layers</div>
        <div className="tf-diff-toggles">
          <label
            className={`tf-diff-toggle${volumeStore.showOriginal ? ' active' : ''}`}
            onClick={() => volumeStore.setShowOriginal(!volumeStore.showOriginal)}
          >
            <span className="tf-diff-toggle-swatch tf-diff-toggle-orig" />
            Original
          </label>
          <label
            className={`tf-diff-toggle${volumeStore.showDifference ? ' active' : ''}`}
            onClick={() => volumeStore.setShowDifference(!volumeStore.showDifference)}
          >
            <span className="tf-diff-toggle-swatch tf-diff-toggle-diff" />
            Difference
          </label>
        </div>
        <label>
          Diff Opacity
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volumeStore.diffOpacity}
            onChange={(e) => volumeStore.setDiffOpacity(Number(e.target.value))}
          />
          <span>{volumeStore.diffOpacity.toFixed(2)}</span>
        </label>
        <label>
          Base Vol Opacity
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.005}
            value={volumeStore.diffBaseOpacity}
            onChange={(e) => volumeStore.setDiffBaseOpacity(Number(e.target.value))}
          />
          <span>{volumeStore.diffBaseOpacity.toFixed(3)}</span>
        </label>
        <label>
          Category
          <select
            className="tf-cat-select"
            value={volumeStore.categoryFilter}
            onChange={(e) => volumeStore.setCategoryFilter(Number(e.target.value))}
          >
            <option value={-1}>All categories</option>
            {volumeStore.classBoundaries.length >= 2 &&
              (() => {
                const loPct = volumeStore.lowPercentile;
                const hiPct = volumeStore.highPercentile;
                const midPct = (hiPct - loPct).toFixed(1);
                const names = [
                  `Low (bottom ${loPct}%)`,
                  `Normal (middle ${midPct}%)`,
                  `High (top ${(100 - hiPct).toFixed(1)}%)`,
                ];
                return Array.from(
                  { length: volumeStore.classBoundaries.length - 1 },
                  (_, i) => {
                    const lo = volumeStore.classBoundaries[i];
                    const hi = volumeStore.classBoundaries[i + 1];
                    return (
                      <option key={i} value={i}>
                        {names[i]}: [{lo.toFixed(3)}, {hi.toFixed(3)})
                      </option>
                    );
                  }
                );
              })()}
          </select>
        </label>

        <div className="tf-percentile-controls">
          <div className="tf-percentile-header">
            Classification Percentiles (from ref step)
          </div>
          <label>
            Low %
            <input
              type="range"
              min={0.1}
              max={49}
              step={0.5}
              value={volumeStore.lowPercentile}
              onChange={(e) => volumeStore.setLowPercentile(Number(e.target.value))}
            />
            <span>{volumeStore.lowPercentile.toFixed(1)}%</span>
          </label>
          {volumeStore.classBoundaries.length >= 3 && (
            <span className="tf-percentile-value">
              density &lt; {volumeStore.classBoundaries[1].toFixed(3)}
            </span>
          )}
          <label>
            High %
            <input
              type="range"
              min={51}
              max={99.9}
              step={0.5}
              value={volumeStore.highPercentile}
              onChange={(e) => volumeStore.setHighPercentile(Number(e.target.value))}
            />
            <span>{volumeStore.highPercentile.toFixed(1)}%</span>
          </label>
          {volumeStore.classBoundaries.length >= 3 && (
            <span className="tf-percentile-value">
              density &gt; {volumeStore.classBoundaries[2].toFixed(3)}
            </span>
          )}
        </div>
      </div>

      {/* ── YG: Lighting ── */}
      <div className="tf-lighting">
        <div className="tf-section-title">Lighting</div>
        <div className="tf-light-row">
          <label>Azimuth</label>
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={volumeStore.lightAzimuth}
            onChange={(e) => volumeStore.setLightAzimuth(Number(e.target.value))}
          />
          <span>{Math.round(volumeStore.lightAzimuth)}°</span>
        </div>
        <div className="tf-light-row">
          <label>Elevation</label>
          <input
            type="range"
            min={-20}
            max={80}
            step={1}
            value={volumeStore.lightElevation}
            onChange={(e) => volumeStore.setLightElevation(Number(e.target.value))}
          />
          <span>{Math.round(volumeStore.lightElevation)}°</span>
        </div>
        <div className="tf-light-row">
          <label>Intensity</label>
          <input
            type="range"
            min={0.2}
            max={2.5}
            step={0.1}
            value={volumeStore.lightIntensity}
            onChange={(e) => volumeStore.setLightIntensity(Number(e.target.value))}
          />
          <span>{volumeStore.lightIntensity.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
});

export default TransferFunctionEditor;
