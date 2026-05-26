import React, { useMemo, useRef, useState, useCallback } from 'react';
import './index.less';

interface DensityHistogramProps {
  bins: number[];
  binEdges: number[];
  logBins: number[];
  logBinEdges: number[];
  timestep: number;
  onRangeSelect?: (range: { min: number; max: number } | null) => void;
  selectedRange?: { min: number; max: number } | null;
}

const DensityHistogram: React.FC<DensityHistogramProps> = ({
  bins,
  binEdges,
  logBins,
  logBinEdges,
  timestep,
  onRangeSelect,
  selectedRange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [showLogScale, setShowLogScale] = useState(true);

  const currentBins = showLogScale ? logBins : bins;
  const currentBinEdges = showLogScale ? logBinEdges : binEdges;

  // 计算统计数据
  const stats = useMemo(() => {
    if (currentBins.length === 0) return null;

    const total = currentBins.reduce((sum, count) => sum + count, 0);
    const maxCount = Math.max(...currentBins);
    
    // 计算累积分布
    const cumulative: number[] = [];
    let cumSum = 0;
    for (const count of currentBins) {
      cumSum += count;
      cumulative.push(cumSum / total);
    }

    return { total, maxCount, cumulative };
  }, [currentBins]);

  // 绘制直方图
  const drawHistogram = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || currentBins.length === 0 || !stats) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = { top: 40, right: 60, bottom: 60, left: 70 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // 清空画布
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, width, height);

    // 绘制网格
    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);

    // 水平网格线
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
    }

    // 垂直网格线
    const numVerticalLines = 10;
    for (let i = 0; i <= numVerticalLines; i++) {
      const x = padding.left + (chartWidth / numVerticalLines) * i;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // 绘制直方图条形
    const binWidth = chartWidth / currentBins.length;
    const maxCount = stats.maxCount;

    for (let i = 0; i < currentBins.length; i++) {
      const count = currentBins[i];
      const barHeight = (count / maxCount) * chartHeight;
      const x = padding.left + i * binWidth;
      const y = padding.top + chartHeight - barHeight;

      // 判断是否在选中范围内
      let isSelected = false;
      if (selectedRange && currentBinEdges.length > i) {
        const binMin = currentBinEdges[i];
        const binMax = currentBinEdges[i + 1] || binMin;
        isSelected = binMin >= selectedRange.min && binMax <= selectedRange.max;
      }

      // 渐变色
      const gradient = ctx.createLinearGradient(0, y, 0, padding.top + chartHeight);
      if (isSelected) {
        gradient.addColorStop(0, '#ff6b6b');
        gradient.addColorStop(1, '#ee5a5a');
      } else {
        gradient.addColorStop(0, '#4ecdc4');
        gradient.addColorStop(0.5, '#44a08d');
        gradient.addColorStop(1, '#093637');
      }

      ctx.fillStyle = gradient;
      ctx.fillRect(x + 1, y, binWidth - 2, barHeight);

      // 条形边框
      ctx.strokeStyle = isSelected ? '#ff8585' : '#5ee7df';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 1, y, binWidth - 2, barHeight);
    }

    // 绘制坐标轴
    ctx.strokeStyle = '#a0d2eb';
    ctx.lineWidth = 2;

    // Y轴
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.stroke();

    // X轴
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartHeight);
    ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
    ctx.stroke();

    // Y轴标签
    ctx.fillStyle = '#a0d2eb';
    ctx.font = '11px Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= 5; i++) {
      const value = (maxCount / 5) * (5 - i);
      const y = padding.top + (chartHeight / 5) * i;
      ctx.fillText(value.toExponential(1), padding.left - 10, y);
    }

    // X轴标签
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const numLabels = 6;
    for (let i = 0; i < numLabels; i++) {
      const binIndex = Math.floor((currentBinEdges.length - 1) * i / (numLabels - 1));
      const value = currentBinEdges[binIndex];
      const x = padding.left + (chartWidth / (numLabels - 1)) * i;
      
      let label: string;
      if (showLogScale) {
        label = value.toExponential(1);
      } else {
        label = value.toExponential(1);
      }
      
      ctx.save();
      ctx.translate(x, padding.top + chartHeight + 10);
      ctx.rotate(-Math.PI / 4);
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }

    // 轴标题
    ctx.save();
    ctx.translate(20, padding.top + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.font = '12px Consolas, monospace';
    ctx.fillText('频数', 0, 0);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillText(
      showLogScale ? '密度 (log₁₀)' : '密度',
      padding.left + chartWidth / 2,
      height - 10
    );

    // 绘制标题
    ctx.font = 'bold 14px Consolas, monospace';
    ctx.fillStyle = '#e0e6ed';
    ctx.textAlign = 'center';
    ctx.fillText(
      `密度分布直方图 - 时间步 ${timestep}`,
      width / 2,
      25
    );

    // 绘制选择区域
    if (selectionStart !== null && selectionEnd !== null) {
      const startX = Math.min(selectionStart, selectionEnd);
      const endX = Math.max(selectionStart, selectionEnd);
      
      ctx.fillStyle = 'rgba(255, 107, 107, 0.3)';
      ctx.fillRect(startX, padding.top, endX - startX, chartHeight);
      
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 2;
      ctx.strokeRect(startX, padding.top, endX - startX, chartHeight);
    }

    // 绘制选中范围指示
    if (selectedRange && currentBinEdges.length > 0) {
      const minIndex = currentBinEdges.findIndex(edge => edge >= selectedRange.min);
      const maxIndex = currentBinEdges.findIndex(edge => edge >= selectedRange.max);
      
      if (minIndex !== -1 && maxIndex !== -1) {
        const startX = padding.left + minIndex * binWidth;
        const endX = padding.left + maxIndex * binWidth;
        
        ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
        ctx.fillRect(startX, padding.top, endX - startX, chartHeight);
        
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(startX, padding.top, endX - startX, chartHeight);
        ctx.setLineDash([]);
      }
    }

    // 绘制统计信息
    ctx.fillStyle = '#a0d2eb';
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`总计: ${stats.total.toLocaleString()}`, padding.left + chartWidth + 10, padding.top + 20);
    ctx.fillText(`峰值: ${maxCount.toExponential(1)}`, padding.left + chartWidth + 10, padding.top + 35);

  }, [currentBins, currentBinEdges, stats, selectedRange, selectionStart, selectionEnd, showLogScale, timestep]);

  // 当数据变化时重绘
  React.useEffect(() => {
    drawHistogram();
  }, [drawHistogram]);

  // 鼠标事件处理
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padding = { top: 40, right: 60, bottom: 60, left: 70 };
    const chartWidth = canvas.width - padding.left - padding.right;

    if (x >= padding.left && x <= padding.left + chartWidth) {
      setIsSelecting(true);
      setSelectionStart(x);
      setSelectionEnd(x);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelecting) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
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

    const padding = { top: 40, right: 60, bottom: 60, left: 70 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const binWidth = chartWidth / currentBins.length;

    const startX = Math.min(selectionStart, selectionEnd);
    const endX = Math.max(selectionStart, selectionEnd);

    const startBin = Math.floor((startX - padding.left) / binWidth);
    const endBin = Math.floor((endX - padding.left) / binWidth);

    if (startBin >= 0 && endBin < currentBinEdges.length - 1 && startBin <= endBin) {
      const minDensity = currentBinEdges[Math.max(0, startBin)];
      const maxDensity = currentBinEdges[Math.min(currentBinEdges.length - 1, endBin + 1)];
      
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

  return (
    <div className="density-histogram">
      <div className="histogram-controls">
        <label className="scale-toggle">
          <input
            type="checkbox"
            checked={showLogScale}
            onChange={(e) => setShowLogScale(e.target.checked)}
          />
          <span>对数坐标</span>
        </label>
        {selectedRange && (
          <button className="clear-btn" onClick={handleClearSelection}>
            清除选择
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={600}
        height={350}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isSelecting ? 'crosshair' : 'pointer' }}
      />
      {selectedRange && (
        <div className="selection-info">
          <span>已选择密度范围:</span>
          <span className="range-value">
            [{selectedRange.min.toExponential(2)}, {selectedRange.max.toExponential(2)}]
          </span>
        </div>
      )}
    </div>
  );
};

export default DensityHistogram;
