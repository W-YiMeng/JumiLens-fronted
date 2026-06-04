import React, { useEffect, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { VolumeScene } from './volumeScene';
import { volumeStore } from '../../../../store/volumeStore';
import { loadTimeStep } from './loadData';
import TimeControls from './TimeControls';
import TransferFunctionEditor from './TransferFunctionEditor';
import './index.less';

const VolumeRenderer: React.FC = observer(() => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<VolumeScene | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const vs = new VolumeScene(containerRef.current);
    sceneRef.current = vs;

    // Load initial time step
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

  // React to time step changes
  useEffect(() => {
    const vs = sceneRef.current;
    if (!vs) return;

    const step = volumeStore.currentStep;
    const cached = volumeStore.getCachedData(step);
    if (cached) {
      vs.loadVolumeData(cached);
    } else {
      volumeStore.isLoading = true;
      loadTimeStep(step).then(({ normalized, min, max }) => {
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

  // React to TF changes
  useEffect(() => {
    sceneRef.current?.buildTFTexture(volumeStore.transferFunction);
  }, [volumeStore.transferFunction]);

  // React to step size changes
  useEffect(() => {
    sceneRef.current?.updateStepSize(volumeStore.stepSize);
  }, [volumeStore.stepSize]);

  // React to density scale changes
  useEffect(() => {
    sceneRef.current?.updateDensityScale(volumeStore.densityScale);
  }, [volumeStore.densityScale]);

  // React to lighting changes
  useEffect(() => {
    sceneRef.current?.updateLighting(
      volumeStore.lightAzimuth,
      volumeStore.lightElevation,
      volumeStore.lightIntensity
    );
  }, [
    volumeStore.lightAzimuth,
    volumeStore.lightElevation,
    volumeStore.lightIntensity,
  ]);

  // Generate thumbnails for key steps based on view/range settings
  useEffect(() => {
    const vs = sceneRef.current;
    if (!vs) return;

    let cancelled = false;

    const run = async () => {
      const steps = volumeStore.thumbnailSteps;
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (cancelled) return;

        const cached = volumeStore.getCachedData(step);
        let data = cached;
        if (!data) {
          try {
            const loaded = await loadTimeStep(step);
            if (cancelled) return;
            volumeStore.cacheData(step, loaded.normalized, loaded.min, loaded.max);
            data = loaded.normalized;
          } catch {
            continue;
          }
        }

        if (!data) continue;

        let refStep: number | null = null;
        if (volumeStore.thumbnailCompareMode === 'prev') {
          refStep = i > 0 ? steps[i - 1] : null;
        } else if (volumeStore.thumbnailCompareMode === 'ref') {
          refStep = steps[volumeStore.thumbnailCompareRefIndex] ?? null;
          if (refStep === step) {
            refStep = i > 0 ? steps[i - 1] : null;
          }
        }

        let refData: Float32Array | undefined;
        if (volumeStore.thumbnailCompareMode !== 'off' && refStep !== null) {
          refData = volumeStore.getCachedData(refStep);
          if (!refData) {
            try {
              const loadedPrev = await loadTimeStep(refStep);
              if (cancelled) return;
              volumeStore.cacheData(refStep, loadedPrev.normalized, loadedPrev.min, loadedPrev.max);
              refData = loadedPrev.normalized;
            } catch {
              refData = undefined;
            }
          }
        }

        if (!volumeStore.getThumbnailImage(step, 'low')) {
          const img =
            volumeStore.thumbnailCompareMode !== 'off' && refData
              ? vs.renderThumbnailDiff(
                  data,
                  refData,
                  volumeStore.thumbnailLowRange,
                  volumeStore.thumbnailView,
                  volumeStore.thumbnailCompareOverlay,
                  { width: 150, height: 75 }
                )
              : vs.renderThumbnail(
                  data,
                  volumeStore.thumbnailLowRange,
                  [0.3, 0.8, 1.0],
                  volumeStore.thumbnailView,
                  { width: 150, height: 75 }
                );
          volumeStore.setThumbnailImage(step, 'low', img);
        }

        if (!volumeStore.getThumbnailImage(step, 'high')) {
          const img =
            volumeStore.thumbnailCompareMode !== 'off' && refData
              ? vs.renderThumbnailDiff(
                  data,
                  refData,
                  volumeStore.thumbnailHighRange,
                  volumeStore.thumbnailView,
                  volumeStore.thumbnailCompareOverlay,
                  { width: 150, height: 75 }
                )
              : vs.renderThumbnail(
                  data,
                  volumeStore.thumbnailHighRange,
                  [1.0, 0.55, 0.2],
                  volumeStore.thumbnailView,
                  { width: 150, height: 75 }
                );
          volumeStore.setThumbnailImage(step, 'high', img);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [
    volumeStore.thumbnailView,
    volumeStore.thumbnailLowRange[0],
    volumeStore.thumbnailLowRange[1],
    volumeStore.thumbnailHighRange[0],
    volumeStore.thumbnailHighRange[1],
    volumeStore.thumbnailRefreshToken,
    volumeStore.thumbnailCompareMode,
    volumeStore.thumbnailCompareRefIndex,
    volumeStore.thumbnailCompareOverlay,
  ]);

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
