import React, { useRef, useEffect, useCallback, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { volumeStore } from '@/store/volumeStore';

const TF_RES = 256;
type TabId = 'tf' | 'lighting' | 'diff';

interface TransferFunctionEditorProps {
  /** 'floating' = toggleable overlay panel (default), 'embedded' = always visible inline */
  mode?: 'floating' | 'embedded';
}

const TransferFunctionEditor: React.FC<TransferFunctionEditorProps> = observer(({ mode = 'floating' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const draggingRef = useRef(false);
  const [open, setOpen] = useState(mode === 'embedded' ? true : false);
  const [tab, setTab] = useState<TabId>('tf');

  const CANVAS_H = 36;
  const COLOR_H = 24;

  // ── TF ramp drawing ──────────────────────────────────────
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
        ctx.fillStyle = `rgb(${Math.round(ov * ca + bg * (1 - ca))},${Math.round(ov * ca + bg * (1 - ca))},${Math.round(ov * ca + bg * (1 - ca))})`;
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
    ctx.fillText('颜色', 4, 9);
    ctx.fillText('透明度', 4, COLOR_H + 9);

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

  // ── Mouse handlers ───────────────────────────────────────
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
        if (dist < closestDist) { closestDist = dist; closestIdx = i; }
      }
      return { index: closestIdx, dist: closestDist };
    }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const target = getClickTarget(e.clientX);
    if (!target) return;
    if (target.dist < 0.03) { setSelectedIndex(target.index); draggingRef.current = true; }
    else { setSelectedIndex(null); draggingRef.current = false; }
  }, [getClickTarget]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current || selectedIndex === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = Math.max(0, Math.min(1, x / rect.width));
    const points = [...volumeStore.transferFunction];
    points[selectedIndex] = { ...points[selectedIndex], position: t };
    volumeStore.setTransferFunction(points);
  }, [selectedIndex]);

  const handleMouseUp = useCallback(() => { draggingRef.current = false; }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
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
      if (t <= points[0].position) { insertColor = [...points[0].color]; insertOpacity = points[0].opacity; }
      else if (t >= points[points.length - 1].position) { insertColor = [...points[points.length - 1].color]; insertOpacity = points[points.length - 1].opacity; }
      else {
        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[i]; const p1 = points[i + 1];
          if (t >= p0.position && t <= p1.position) {
            const frac = (t - p0.position) / (p1.position - p0.position);
            insertColor = [p0.color[0] + (p1.color[0] - p0.color[0]) * frac, p0.color[1] + (p1.color[1] - p0.color[1]) * frac, p0.color[2] + (p1.color[2] - p0.color[2]) * frac];
            insertOpacity = p0.opacity + (p1.opacity - p0.opacity) * frac;
            break;
          }
        }
      }
    }
    const newPoints = [...points, { position: t, color: insertColor, opacity: insertOpacity }];
    volumeStore.setTransferFunction(newPoints);
    setSelectedIndex(newPoints.length - 1);
  }, [getClickTarget]);

  // ── Edits ────────────────────────────────────────────────
  const handleColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedIndex === null) return;
    const hex = e.target.value;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const points = volumeStore.transferFunction.map((p, i) => i === selectedIndex ? { ...p, color: [r, g, b] as [number, number, number] } : p);
    volumeStore.setTransferFunction(points);
  }, [selectedIndex]);

  const handleOpacityChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedIndex === null) return;
    volumeStore.setTransferFunction(volumeStore.transferFunction.map((p, i) => i === selectedIndex ? { ...p, opacity: Number(e.target.value) } : p));
  }, [selectedIndex]);

  const handlePositionChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedIndex === null) return;
    volumeStore.setTransferFunction(volumeStore.transferFunction.map((p, i) => i === selectedIndex ? { ...p, position: Number(e.target.value) } : p));
  }, [selectedIndex]);

  const selectedPoint = selectedIndex !== null ? volumeStore.transferFunction[selectedIndex] : null;
  const colorHex = selectedPoint ? `#${selectedPoint.color.map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}` : '#ffffff';

  // ── Tab content ──────────────────────────────────────────
  const tabs: { id: TabId; label: string }[] = [
    { id: 'tf', label: '传递函数' },
    { id: 'lighting', label: '光照' },
    { id: 'diff', label: '差异图层' },
  ];

  const isEmbedded = mode === 'embedded';

  return (
    <>
      {/* Toggle button — only in floating mode */}
      {!isEmbedded && (
        <button
          className={`panel-toggle-btn${open ? ' open' : ''}`}
          onClick={() => setOpen(!open)}
          title={open ? '收起面板' : '展开面板'}
        >
          <span className="panel-toggle-icon">{open ? '✕' : '☰'}</span>
        </button>
      )}

      {/* Panel */}
      <div className={`${isEmbedded ? 'tf-panel-embedded' : `tf-panel${open ? ' visible' : ''}`}`}>
        {/* Tab bar */}
        <div className="tf-panel-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`tf-panel-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="tf-panel-body">
          {/* ── Tab: 传递函数 ── */}
          {tab === 'tf' && (
            <div className="tf-tab-content">
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
              {selectedPoint ? (
                <div className="tf-point-editor">
                  <div className="tf-point-row">
                    <label>位置</label>
                    <input type="range" min={0} max={1} step={0.01} value={selectedPoint.position} onChange={handlePositionChange} />
                    <span>{selectedPoint.position.toFixed(2)}</span>
                  </div>
                  <div className="tf-point-row">
                    <label>颜色</label>
                    <input type="color" value={colorHex} onChange={handleColorChange} />
                  </div>
                  <div className="tf-point-row">
                    <label>透明度</label>
                    <input type="range" min={0} max={1} step={0.01} value={selectedPoint.opacity} onChange={handleOpacityChange} />
                    <span>{selectedPoint.opacity.toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <div className="tf-hint">点击控制点选中 · 双击添加 · 双击控制点删除</div>
              )}
              <div className="tf-controls">
                <label>步长<input type="range" min={0.004} max={0.05} step={0.001} value={volumeStore.stepSize} onChange={(e) => volumeStore.setStepSize(Number(e.target.value))} /></label>
                <label>密度<input type="range" min={0.1} max={3.0} step={0.1} value={volumeStore.densityScale} onChange={(e) => volumeStore.setDensityScale(Number(e.target.value))} /></label>
              </div>
              <div className="tf-grad-controls">
                <div className="tf-section-title">梯度权重 (2D TF)</div>
                <label>权重<input type="range" min={0} max={1} step={0.01} value={volumeStore.gradWeight} onChange={(e) => volumeStore.setGradWeight(Number(e.target.value))} /><span>{volumeStore.gradWeight.toFixed(2)}</span></label>
                <label>低阈值<input type="range" min={0.001} max={0.2} step={0.001} value={volumeStore.gradLow} onChange={(e) => volumeStore.setGradLow(Number(e.target.value))} /><span>{volumeStore.gradLow.toFixed(3)}</span></label>
                <label>高阈值<input type="range" min={0.005} max={0.5} step={0.005} value={volumeStore.gradHigh} onChange={(e) => volumeStore.setGradHigh(Number(e.target.value))} /><span>{volumeStore.gradHigh.toFixed(3)}</span></label>
              </div>
            </div>
          )}

          {/* ── Tab: 光照 ── */}
          {tab === 'lighting' && (
            <div className="tf-tab-content">
              <div className="tf-section-title">方向光</div>
              <div className="tf-light-row">
                <label>方位角</label>
                <input type="range" min={0} max={360} step={1} value={volumeStore.lightAzimuth} onChange={(e) => volumeStore.setLightAzimuth(Number(e.target.value))} />
                <span>{Math.round(volumeStore.lightAzimuth)}°</span>
              </div>
              <div className="tf-light-row">
                <label>仰角</label>
                <input type="range" min={-20} max={80} step={1} value={volumeStore.lightElevation} onChange={(e) => volumeStore.setLightElevation(Number(e.target.value))} />
                <span>{Math.round(volumeStore.lightElevation)}°</span>
              </div>
              <div className="tf-light-row">
                <label>强度</label>
                <input type="range" min={0.2} max={2.5} step={0.1} value={volumeStore.lightIntensity} onChange={(e) => volumeStore.setLightIntensity(Number(e.target.value))} />
                <span>{volumeStore.lightIntensity.toFixed(1)}</span>
              </div>
            </div>
          )}

          {/* ── Tab: 差异图层 ── */}
          {tab === 'diff' && (
            <div className="tf-tab-content">
              {/* 主开关: 进入/退出差异分析模式 */}
              <div className="tf-diff-toggles">
                <label
                  className={`tf-diff-toggle master${volumeStore.diffMode ? ' active' : ''}`}
                  onClick={() => volumeStore.toggleDiffMode()}
                >
                  <span className={`tf-diff-toggle-swatch${volumeStore.diffMode ? ' tf-diff-toggle-diff' : ' tf-diff-toggle-orig'}`} />
                  {volumeStore.diffMode ? '差异分析 (开启)' : '差异分析 (关闭)'}
                </label>
              </div>
              {/* 子开关: 仅在差异模式下可用 */}
              {volumeStore.diffMode && (
                <div className="tf-diff-toggles sub">
                  <label className={`tf-diff-toggle${volumeStore.showOriginal ? ' active' : ''}`} onClick={() => volumeStore.setShowOriginal(!volumeStore.showOriginal)}>
                    <span className="tf-diff-toggle-swatch tf-diff-toggle-orig" />原始体渲染
                  </label>
                  <label className={`tf-diff-toggle${volumeStore.showDifference ? ' active' : ''}`} onClick={() => volumeStore.setShowDifference(!volumeStore.showDifference)}>
                    <span className="tf-diff-toggle-swatch tf-diff-toggle-diff" />变化着色
                  </label>
                </div>
              )}
              <label>
                分类
                <select className="tf-cat-select" value={volumeStore.categoryFilter} onChange={(e) => volumeStore.setCategoryFilter(Number(e.target.value))}>
                  <option value={-1}>全部分类</option>
                  {volumeStore.classBoundaries.length >= 2 && (() => {
                    const loPct = volumeStore.lowPercentile;
                    const hiPct = volumeStore.highPercentile;
                    const midPct = (hiPct - loPct).toFixed(1);
                    const names = [`低密度 (底部 ${loPct}%)`, `正常 (中间 ${midPct}%)`, `高密度 (顶部 ${(100 - hiPct).toFixed(1)}%)`];
                    return Array.from({ length: volumeStore.classBoundaries.length - 1 }, (_, i) => {
                      const lo = volumeStore.classBoundaries[i];
                      const hi = volumeStore.classBoundaries[i + 1];
                      return <option key={i} value={i}>{names[i]}: [{lo.toFixed(3)}, {hi.toFixed(3)})</option>;
                    });
                  })()}
                </select>
              </label>
              <div className="tf-percentile-controls">
                <div className="tf-section-title">分类百分位 (基于参考步)</div>
                <label>低 %<input type="range" min={0.1} max={49} step={0.5} value={volumeStore.lowPercentile} onChange={(e) => volumeStore.setLowPercentile(Number(e.target.value))} /><span>{volumeStore.lowPercentile.toFixed(1)}%</span></label>
                {volumeStore.classBoundaries.length >= 3 && <span className="tf-percentile-value">密度 &lt; {volumeStore.classBoundaries[1].toFixed(3)}</span>}
                <label>高 %<input type="range" min={51} max={99.9} step={0.5} value={volumeStore.highPercentile} onChange={(e) => volumeStore.setHighPercentile(Number(e.target.value))} /><span>{volumeStore.highPercentile.toFixed(1)}%</span></label>
                {volumeStore.classBoundaries.length >= 3 && <span className="tf-percentile-value">密度 &gt; {volumeStore.classBoundaries[2].toFixed(3)}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
});

export default TransferFunctionEditor;
