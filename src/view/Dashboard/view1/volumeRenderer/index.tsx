import React, { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { VolumeScene } from './volumeScene';
import { volumeStore } from '@/store/volumeStore';
import { loadTimeStep } from './loadData';
import TimeControls from './TimeControls';
import TransferFunctionEditor from './TransferFunctionEditor';
import './index.less';

const VolumeRenderer: React.FC = observer(() => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<VolumeScene | null>(null);
  const latestStepRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const vs = new VolumeScene(containerRef.current);
    sceneRef.current = vs;

    const cached = volumeStore.getCachedData(0);
    if (cached) {
      vs.loadVolumeData(cached);
    } else {
      loadTimeStep(0).then(({ normalized, min, max }) => {
        volumeStore.cacheData(0, normalized, min, max);
        vs.loadVolumeData(normalized);
      });
    }

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        vs.resize(width, height);
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      vs.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const vs = sceneRef.current;
    if (!vs) return;

    const step = volumeStore.currentStep;
    latestStepRef.current = step;

    const cached = volumeStore.getCachedData(step);
    if (cached) {
      vs.loadVolumeData(cached);
    } else {
      volumeStore.isLoading = true;
      loadTimeStep(step).then(({ normalized, min, max }) => {
        if (step !== latestStepRef.current) return;
        volumeStore.cacheData(step, normalized, min, max);
        volumeStore.isLoading = false;
        vs.loadVolumeData(normalized);
      });
    }

    // Preload nearby steps
    for (let d = 1; d <= 3; d++) {
      for (const offset of [d, -d]) {
        const preloadStep = step + offset;
        if (preloadStep < 0 || preloadStep > 99) continue;
        if (volumeStore.getCachedData(preloadStep)) continue;
        loadTimeStep(preloadStep).then(({ normalized, min, max }) => {
          volumeStore.cacheData(preloadStep, normalized, min, max);
        });
      }
    }
  }, [volumeStore.currentStep]);

  useEffect(() => {
    sceneRef.current?.buildTFTexture(volumeStore.transferFunction);
  }, [volumeStore.transferFunction]);

  useEffect(() => {
    const range = volumeStore.selectedRange;
    const dataRange = volumeStore.getDataRange(volumeStore.currentStep);
    sceneRef.current?.updateFilterRange(range, dataRange);
  }, [volumeStore.selectedRange, volumeStore.currentStep]);

  useEffect(() => {
    sceneRef.current?.updateStepSize(volumeStore.stepSize);
  }, [volumeStore.stepSize]);

  return (
    <div className="volume-renderer-root" ref={containerRef}>
      <TimeControls />
      <TransferFunctionEditor />
      {volumeStore.isLoading && (
        <div className="volume-loading">
          <span>Loading step {volumeStore.currentStep}...</span>
        </div>
      )}
    </div>
  );
});

export default VolumeRenderer;
