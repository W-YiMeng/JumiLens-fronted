import React, { useState, useCallback, useRef, useEffect } from 'react';
import './index.less';
import type { TransferFunctionPoint } from '../VolumeRenderer';

interface TransferFunctionEditorProps {
  transferFunction: TransferFunctionPoint[];
  onChange: (tf: TransferFunctionPoint[]) => void;
}

const TransferFunctionEditor: React.FC<TransferFunctionEditorProps> = ({
  transferFunction,
  onChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const width = 300;
  const height = 150;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // 绘制传递函数编辑器
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 清空
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, width, height);

    // 绘制网格
    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);

    for (let i = 0; i <= 5; i++) {
      const x = padding.left + (chartWidth / 5) * i;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.stroke();

      const y = padding.top + (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // 排序控制点
    const sortedPoints = [...transferFunction].sort((a, b) => a.position - b.position);

    // 绘制颜色渐变预览
    const gradient = ctx.createLinearGradient(padding.left, 0, padding.left + chartWidth, 0);
    for (const point of sortedPoints) {
      gradient.addColorStop(
        point.position,
        `rgba(${point.color[0] * 255}, ${point.color[1] * 255}, ${point.color[2] * 255}, ${point.alpha})`
      );
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(padding.left, padding.top, chartWidth, chartHeight);

    // 绘制不透明度曲线
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < sortedPoints.length; i++) {
      const point = sortedPoints[i];
      const x = padding.left + point.position * chartWidth;
      const y = padding.top + chartHeight - point.alpha * chartHeight;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // 绘制控制点
    for (let i = 0; i < sortedPoints.length; i++) {
      const point = sortedPoints[i];
      const x = padding.left + point.position * chartWidth;
      const y = padding.top + chartHeight - point.alpha * chartHeight;

      const isSelected = selectedPoint === i;

      // 外圈
      ctx.fillStyle = isSelected ? '#ffd700' : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 8 : 6, 0, Math.PI * 2);
      ctx.fill();

      // 内圈（显示颜色）
      ctx.fillStyle = `rgb(${point.color[0] * 255}, ${point.color[1] * 255}, ${point.color[2] * 255})`;
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 绘制坐标轴
    ctx.strokeStyle = '#a0d2eb';
    ctx.lineWidth = 2;

    // X轴
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartHeight);
    ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
    ctx.stroke();

    // Y轴
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.stroke();

    // 标签
    ctx.fillStyle = '#a0d2eb';
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('密度', padding.left + chartWidth / 2, height - 5);

    ctx.save();
    ctx.translate(10, padding.top + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('不透明度', 0, 0);
    ctx.restore();

    // 刻度
    ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const x = padding.left + (chartWidth / 4) * i;
      ctx.fillText((i / 4).toFixed(1), x, padding.top + chartHeight + 12);
    }

    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + chartHeight - (chartHeight / 4) * i;
      ctx.fillText((i / 4).toFixed(1), padding.left - 5, y + 3);
    }

  }, [transferFunction, selectedPoint, chartWidth, chartHeight]);

  useEffect(() => {
    draw();
  }, [draw]);

  // 鼠标事件处理
  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getMousePos(e);

    // 检查是否点击了控制点
    const sortedPoints = [...transferFunction].sort((a, b) => a.position - b.position);

    for (let i = 0; i < sortedPoints.length; i++) {
      const point = sortedPoints[i];
      const px = padding.left + point.position * chartWidth;
      const py = padding.top + chartHeight - point.alpha * chartHeight;

      const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
      if (dist < 10) {
        setSelectedPoint(i);
        setIsDragging(true);
        return;
      }
    }

    // 添加新控制点
    if (x >= padding.left && x <= padding.left + chartWidth &&
        y >= padding.top && y <= padding.top + chartHeight) {
      const position = (x - padding.left) / chartWidth;
      const alpha = (padding.top + chartHeight - y) / chartHeight;

      const newPoint: TransferFunctionPoint = {
        position,
        color: [0.5, 0.5, 0.5],
        alpha,
      };

      const newTf = [...transferFunction, newPoint];
      onChange(newTf);
      setSelectedPoint(newTf.length - 1);
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || selectedPoint === null) return;

    const { x, y } = getMousePos(e);

    const position = Math.max(0, Math.min(1, (x - padding.left) / chartWidth));
    const alpha = Math.max(0, Math.min(1, (padding.top + chartHeight - y) / chartHeight));

    const newTf = [...transferFunction];
    newTf[selectedPoint] = {
      ...newTf[selectedPoint],
      position,
      alpha,
    };

    onChange(newTf);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const updateColor = (colorIndex: number, value: number) => {
    if (selectedPoint === null) return;

    const newTf = [...transferFunction];
    const newColor = [...newTf[selectedPoint].color] as [number, number, number];
    newColor[colorIndex] = value;
    newTf[selectedPoint] = {
      ...newTf[selectedPoint],
      color: newColor,
    };

    onChange(newTf);
  };

  const deleteSelectedPoint = () => {
    if (selectedPoint === null || transferFunction.length <= 2) return;

    const newTf = transferFunction.filter((_, i) => i !== selectedPoint);
    onChange(newTf);
    setSelectedPoint(null);
  };

  const selectedPointData = selectedPoint !== null ? transferFunction[selectedPoint] : null;

  return (
    <div className="transfer-function-editor">
      <div className="editor-title">传递函数编辑器</div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
      />
      {selectedPointData && (
        <div className="point-editor">
          <div className="color-controls">
            <label>
              R:
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={selectedPointData.color[0]}
                onChange={(e) => updateColor(0, parseFloat(e.target.value))}
              />
              <span>{(selectedPointData.color[0] * 255).toFixed(0)}</span>
            </label>
            <label>
              G:
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={selectedPointData.color[1]}
                onChange={(e) => updateColor(1, parseFloat(e.target.value))}
              />
              <span>{(selectedPointData.color[1] * 255).toFixed(0)}</span>
            </label>
            <label>
              B:
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={selectedPointData.color[2]}
                onChange={(e) => updateColor(2, parseFloat(e.target.value))}
              />
              <span>{(selectedPointData.color[2] * 255).toFixed(0)}</span>
            </label>
          </div>
          <button className="delete-btn" onClick={deleteSelectedPoint}>
            删除控制点
          </button>
        </div>
      )}
    </div>
  );
};

export default TransferFunctionEditor;
