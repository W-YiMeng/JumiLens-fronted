import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  VolumeRenderer,
  DensityHistogram,
  TransferFunctionEditor,
  TimelineControl,
  StatisticsPanel,
} from '@/components';
import {
  loadNyxData,
  calculateLogHistogram,
  calculateStatistics,
  type NyxDataInfo,
  type HistogramData,
} from '@/utils/nyxDataLoader';
import type { TransferFunctionPoint } from '@/components/VolumeRenderer';
import './index.less';

const DEFAULT_TRANSFER_FUNCTION: TransferFunctionPoint[] = [
  { position: 0.0, color: [0.0, 0.0, 0.1], alpha: 0.0 },
  { position: 0.1, color: [0.05, 0.05, 0.3], alpha: 0.05 },
  { position: 0.3, color: [0.1, 0.1, 0.5], alpha: 0.15 },
  { position: 0.5, color: [0.3, 0.1, 0.6], alpha: 0.35 },
  { position: 0.7, color: [0.8, 0.2, 0.1], alpha: 0.65 },
  { position: 0.85, color: [1.0, 0.5, 0.0], alpha: 0.85 },
  { position: 1.0, color: [1.0, 1.0, 0.8], alpha: 1.0 },
];

const TOTAL_TIMESTEPS = 100;
const DATA_DIMENSIONS = { x: 128, y: 128, z: 128 };

const NyxVisualization: React.FC = () => {
  const [currentTimestep, setCurrentTimestep] = useState(0);
  const [nyxData, setNyxData] = useState<NyxDataInfo | null>(null);
  const [histogramData, setHistogramData] = useState<HistogramData | null>(null);
  const [statistics, setStatistics] = useState<ReturnType<typeof calculateStatistics> | null>(null);
  const [transferFunction, setTransferFunction] = useState<TransferFunctionPoint[]>(DEFAULT_TRANSFER_FUNCTION);
  const [selectedRange, setSelectedRange] = useState<{ min: number; max: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFirstLoad = useRef(true);

  // 加载数据函数
  const loadData = useCallback(async (timestep: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const filename = timestep.toString().padStart(4, '0') + '.dat';
      const url = `/assets/Nyx/${filename}`;

      const data = await loadNyxData(url, timestep, DATA_DIMENSIONS);
      setNyxData(data);

      const histogram = calculateLogHistogram(data.data, 80, data.min, data.max);
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

  // 初始加载 - 只在组件挂载时执行一次
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      void loadData(0);
    }
  }, [loadData]);

  // 时间步变化时重新加载数据
  useEffect(() => {
    if (!isFirstLoad.current) {
      void loadData(currentTimestep);
    }
  }, [currentTimestep, loadData]);

  // 播放控制
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setCurrentTimestep((prev) => {
          if (prev >= TOTAL_TIMESTEPS - 1) {
            return prev;
          }
          return prev + 1;
        });
      }, 500);
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    }

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [isPlaying]);

  // 当播放到最后一帧时停止
  useEffect(() => {
    if (currentTimestep >= TOTAL_TIMESTEPS - 1 && isPlaying) {
      setIsPlaying(false);
    }
  }, [currentTimestep, isPlaying]);

  const handleTimestepChange = useCallback((timestep: number) => {
    setCurrentTimestep(timestep);
  }, []);

  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleRangeSelect = useCallback((range: { min: number; max: number } | null) => {
    setSelectedRange(range);
  }, []);

  const handleTransferFunctionChange = useCallback((tf: TransferFunctionPoint[]) => {
    setTransferFunction(tf);
  }, []);

  const handleRetry = useCallback(() => {
    void loadData(currentTimestep);
  }, [loadData, currentTimestep]);

  const densityRange = useMemo(() => {
    if (!nyxData) return { min: 0, max: 1 };
    return { min: nyxData.min, max: nyxData.max };
  }, [nyxData]);

  return (
    <div className="nyx-visualization">
      {error ? (
        <div className="error-message">
          <h3>错误</h3>
          <p>{error}</p>
          <button onClick={handleRetry}>重试</button>
        </div>
      ) : (
        <>
          <div className="visualization-left">
            <div className="volume-view">
              <div className="view-title">
                <span>宇宙密度体渲染</span>
                {isLoading && <span className="loading-indicator">加载中...</span>}
              </div>
              <div className="volume-container">
                {nyxData && (
                  <VolumeRenderer
                    data={nyxData.data}
                    dimensions={nyxData.dimensions}
                    minDensity={densityRange.min}
                    maxDensity={densityRange.max}
                    transferFunction={transferFunction}
                    timestep={currentTimestep}
                    highlightedRange={selectedRange}
                  />
                )}
              </div>
            </div>

            <div className="timeline-section">
              <TimelineControl
                currentTimestep={currentTimestep}
                totalTimesteps={TOTAL_TIMESTEPS}
                onTimestepChange={handleTimestepChange}
                isPlaying={isPlaying}
                onPlayPause={handlePlayPause}
              />
            </div>
          </div>

          <div className="visualization-right">
            <div className="histogram-section">
              {histogramData && (
                <DensityHistogram
                  bins={histogramData.bins}
                  binEdges={histogramData.binEdges}
                  logBins={histogramData.logBins}
                  logBinEdges={histogramData.logBinEdges}
                  timestep={currentTimestep}
                  onRangeSelect={handleRangeSelect}
                  selectedRange={selectedRange}
                />
              )}
            </div>

            <div className="stats-section">
              <StatisticsPanel stats={statistics} timestep={currentTimestep} />
            </div>

            <div className="tf-editor-section">
              <TransferFunctionEditor
                transferFunction={transferFunction}
                onChange={handleTransferFunctionChange}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NyxVisualization;
