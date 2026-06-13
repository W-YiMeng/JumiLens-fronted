import React, { useState, useEffect, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { DensityHistogram, EvolutionChart } from '@/components';
import {
  loadNyxData,
  calculateLogHistogram,
  calculateStatistics,
  type HistogramData,
} from '@/utils/nyxDataLoader';
import { volumeStore } from '@/store/volumeStore';
import './index.less';

const DATA_DIMENSIONS = { x: 128, y: 128, z: 128 };

const View2: React.FC = observer(() => {
  const [histogramData, setHistogramData] = useState<HistogramData | null>(null);
  const [statistics, setStatistics] = useState<ReturnType<typeof calculateStatistics> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 保存 raw 数据的 min/max，用于直方图上横轴（归一化 0-1）的计算
  const [dataRange, setDataRange] = useState<{ min: number; max: number }>({ min: 0, max: 1 });

  const currentTimestep = volumeStore.currentStep;

  const loadData = useCallback(async (timestep: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const filename = timestep.toString().padStart(4, '0') + '.dat';
      const url = `/assets/Nyx/${filename}`;
      const data = await loadNyxData(url, timestep, DATA_DIMENSIONS);

      // 保存 raw 数据范围供直方图上横轴使用
      setDataRange({ min: data.min, max: data.max });

      // Guard against non-positive min: use min of positive data as fallback
      const safeLogMin = data.min > 0 ? Math.log10(data.min) : undefined;
      const safeLogMax = data.max > 0 ? Math.log10(data.max) : undefined;
      const histogram = calculateLogHistogram(data.data, 80, safeLogMin, safeLogMax);
      setHistogramData(histogram);

      const stats = calculateStatistics(data.data);
      setStatistics(stats);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError(`加载时间步 ${timestep} 失败`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(currentTimestep);
  }, [currentTimestep, loadData]);

  const handleRangeSelect = useCallback((range: { min: number; max: number } | null) => {
    console.log('[view2] handleRangeSelect, setting store:', range);
    volumeStore.setHighlightedRange(range);
    console.log('[view2] store.highlightedRange after set:', volumeStore.highlightedRange);
  }, []);

  const handleRetry = useCallback(() => {
    void loadData(currentTimestep);
  }, [loadData, currentTimestep]);

  const handleJumpToStep = useCallback((step: number) => {
    volumeStore.setTimeStep(step);
  }, []);

  return (
    <div className="view2-root">
      {error ? (
        <div className="error-message">
          <h3>错误</h3>
          <p>{error}</p>
          <button onClick={handleRetry}>重试</button>
        </div>
      ) : (
        <>
          <div className="view2-header">
            <span className="view2-title-text">密度分布与统计</span>
            {isLoading && <span className="loading-indicator">加载中...</span>}
            <span className="step-label">Step {currentTimestep} / 99</span>
          </div>

          <div className="histogram-section">
            {histogramData && (
              <DensityHistogram
                bins={histogramData.bins}
                binEdges={histogramData.binEdges}
                logBins={histogramData.logBins}
                logBinEdges={histogramData.logBinEdges}
                timestep={currentTimestep}
                dataMin={dataRange.min}
                dataMax={dataRange.max}
                onRangeSelect={handleRangeSelect}
                selectedRange={volumeStore.highlightedRange}
                statistics={statistics}
              />
            )}
          </div>

          <div className="charts-section">
            <EvolutionChart currentStep={currentTimestep} onJumpToStep={handleJumpToStep} />
          </div>
        </>
      )}
    </div>
  );
});

export default View2;
