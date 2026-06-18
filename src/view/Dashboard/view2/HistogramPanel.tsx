import React, { useState, useEffect, useCallback, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { DensityHistogram } from '@/components';
import { Button } from 'primereact/button';
import {
  loadNyxData,
  calculateLogHistogram,
  calculateStatistics,
  type HistogramData,
} from '@/utils/nyxDataLoader';
import { volumeStore } from '@/store/volumeStore';

const DATA_DIMENSIONS = { x: 128, y: 128, z: 128 };
const NUM_BINS = 80;

/** 用于采样计算全局范围的步长 */
const GLOBAL_SCAN_STEP = 10;
/** 全局范围缓存 (module-level, 只计算一次) */
let _cachedGlobalRange: { logMin: number; logMax: number } | null = null;

async function computeGlobalLogRange(): Promise<{ logMin: number; logMax: number }> {
  if (_cachedGlobalRange) return _cachedGlobalRange;

  let globalLogMin = Infinity;
  let globalLogMax = -Infinity;

  // 采样扫描 timestep 0, 10, 20, ..., 90, 99
  const sampleSteps: number[] = [];
  for (let s = 0; s < 100; s += GLOBAL_SCAN_STEP) {
    sampleSteps.push(s);
  }
  if (sampleSteps[sampleSteps.length - 1] !== 99) {
    sampleSteps.push(99);
  }

  const results = await Promise.allSettled(
    sampleSteps.map(async (step) => {
      const filename = step.toString().padStart(4, '0') + '.dat';
      const url = `/assets/Nyx/${filename}`;
      const data = await loadNyxData(url, step, DATA_DIMENSIONS);
      const logMin = data.min > 0 ? Math.log10(data.min) : undefined;
      const logMax = data.max > 0 ? Math.log10(data.max) : undefined;
      return { step, logMin, logMax, min: data.min, max: data.max };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { logMin, logMax } = result.value;
      if (logMin !== undefined && logMin < globalLogMin) globalLogMin = logMin;
      if (logMax !== undefined && logMax > globalLogMax) globalLogMax = logMax;
    }
  }

  // 添加少许 padding 使图表不贴边
  const pad = (globalLogMax - globalLogMin) * 0.05;
  const range = {
    logMin: globalLogMin - pad,
    logMax: globalLogMax + pad,
  };

  _cachedGlobalRange = range;
  return range;
}

const HistogramPanel: React.FC = observer(() => {
  const [histogramData, setHistogramData] = useState<HistogramData | null>(null);
  const [statistics, setStatistics] = useState<ReturnType<typeof calculateStatistics> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataRange, setDataRange] = useState<{ min: number; max: number }>({ min: 0, max: 1 });

  // ── 全局横轴范围 ──
  const [globalLogRange, setGlobalLogRange] = useState<{ logMin: number; logMax: number } | null>(
    _cachedGlobalRange
  );
  const globalScanDone = useRef(false);

  // ── 对比状态 ──
  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const [comparisonTimestep, setComparisonTimestep] = useState<number>(1);
  const [comparisonData, setComparisonData] = useState<HistogramData | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);

  const currentTimestep = volumeStore.currentStep;

  // ── 首次挂载时采样计算全局范围 ──
  useEffect(() => {
    if (globalScanDone.current || _cachedGlobalRange) return;
    globalScanDone.current = true;

    computeGlobalLogRange()
      .then((range) => {
        setGlobalLogRange(range);
      })
      .catch((err) => {
        console.warn('Failed to compute global log range:', err);
      });
  }, []);

  const loadData = useCallback(async (timestep: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const filename = timestep.toString().padStart(4, '0') + '.dat';
      const url = `/assets/Nyx/${filename}`;
      const data = await loadNyxData(url, timestep, DATA_DIMENSIONS);
      setDataRange({ min: data.min, max: data.max });
      const safeLogMin = data.min > 0 ? Math.log10(data.min) : undefined;
      const safeLogMax = data.max > 0 ? Math.log10(data.max) : undefined;
      const histogram = calculateLogHistogram(data.data, NUM_BINS, safeLogMin, safeLogMax);
      setHistogramData(histogram);
      const stats = calculateStatistics(data.data);
      setStatistics(stats);
    } catch (err) {
      console.error('Failed to load histogram data:', err);
      setError(`加载时间步 ${timestep} 失败`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(currentTimestep);
  }, [currentTimestep, loadData]);

  // ── 加载对比数据 ──
  useEffect(() => {
    if (!comparisonEnabled) {
      setComparisonData(null);
      return;
    }

    let cancelled = false;
    setComparisonLoading(true);

    const loadComparison = async () => {
      try {
        const filename = comparisonTimestep.toString().padStart(4, '0') + '.dat';
        const url = `/assets/Nyx/${filename}`;
        const data = await loadNyxData(url, comparisonTimestep, DATA_DIMENSIONS);
        if (cancelled) return;
        const safeLogMin = data.min > 0 ? Math.log10(data.min) : undefined;
        const safeLogMax = data.max > 0 ? Math.log10(data.max) : undefined;
        const histogram = calculateLogHistogram(data.data, NUM_BINS, safeLogMin, safeLogMax);
        if (!cancelled) {
          setComparisonData(histogram);
        }
      } catch (err) {
        console.error('Failed to load comparison data:', err);
        if (!cancelled) {
          setComparisonData(null);
        }
      } finally {
        if (!cancelled) {
          setComparisonLoading(false);
        }
      }
    };

    void loadComparison();
    return () => { cancelled = true; };
  }, [comparisonEnabled, comparisonTimestep]);

  const handleRangeSelect = useCallback((range: { min: number; max: number } | null) => {
    volumeStore.setHighlightedRange(range);
  }, []);

  const handleRetry = useCallback(() => {
    void loadData(currentTimestep);
  }, [loadData, currentTimestep]);

  const handleComparisonToggle = useCallback((enabled: boolean) => {
    setComparisonEnabled(enabled);
  }, []);

  const handleComparisonTimestepChange = useCallback((step: number) => {
    setComparisonTimestep(step);
  }, []);

  if (error) {
    return (
      <div className="panel-error">
        <h3>错误</h3>
        <p>{error}</p>
        <Button outlined onClick={handleRetry}>重试</Button>
      </div>
    );
  }

  return (
    <DensityHistogram
      bins={histogramData?.bins ?? []}
      binEdges={histogramData?.binEdges ?? []}
      logBins={histogramData?.logBins ?? []}
      logBinEdges={histogramData?.logBinEdges ?? []}
      timestep={currentTimestep}
      dataMin={dataRange.min}
      dataMax={dataRange.max}
      onRangeSelect={handleRangeSelect}
      selectedRange={volumeStore.highlightedRange}
      statistics={statistics}
      // 固定横轴
      globalLogMin={globalLogRange?.logMin}
      globalLogMax={globalLogRange?.logMax}
      // 对比功能
      comparisonLogBins={comparisonData?.logBins}
      comparisonLogBinEdges={comparisonData?.logBinEdges}
      comparisonTimestep={comparisonTimestep}
      comparisonEnabled={comparisonEnabled}
      onComparisonToggle={handleComparisonToggle}
      onComparisonTimestepChange={handleComparisonTimestepChange}
    />
  );
});

export default HistogramPanel;
