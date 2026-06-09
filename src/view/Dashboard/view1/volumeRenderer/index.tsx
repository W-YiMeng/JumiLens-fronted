import React, { useEffect, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { VolumeScene } from './volumeScene';
import { volumeStore } from '@/store/volumeStore';
import { loadTimeStep } from './loadData';
import {
  computePercentileBoundaries,
  buildPercentileBoundaries,
  buildClassLUT,
  classifyVolumeLUT,
  computeDiffVolume,
  computeDiffStats,
  generateDiffThumbnail,
  imageDataToDataURL,
  type PercentileThresholds,
} from './diffClassifier';
import TimeControls from './TimeControls';
import TransferFunctionEditor from './TransferFunctionEditor';
import './index.less';

const THUMB_W = 120;
const THUMB_H = 90;
const DEBOUNCE_MS = 150;

const VolumeRenderer: React.FC = observer(() => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<VolumeScene | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleCallbackId = useRef<number | null>(null);
  const pendingThumbSteps = useRef<Set<number>>(new Set());
  const classLutRef = useRef<Uint8Array>(new Uint8Array(256));

  // ── Init scene ──────────────────────────────────────────────
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
      if (width > 0 && height > 0) vs.resize(width, height);
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      vs.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load data for current step ──────────────────────────────
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

  // ── Sync TF texture ─────────────────────────────────────────
  useEffect(() => {
    sceneRef.current?.buildTFTexture(volumeStore.transferFunction);
  }, [volumeStore.transferFunction]);

  // ── Sync step size ──────────────────────────────────────────
  useEffect(() => {
    sceneRef.current?.updateStepSize(volumeStore.stepSize);
  }, [volumeStore.stepSize]);

  // ── Sync density scale (YG) ──────────────────────────────────
  useEffect(() => {
    sceneRef.current?.updateDensityScale(volumeStore.densityScale);
  }, [volumeStore.densityScale]);

  // ── Sync gradient params (main) ──────────────────────────────
  useEffect(() => {
    sceneRef.current?.updateGradientParams(
      volumeStore.gradLow,
      volumeStore.gradHigh,
      volumeStore.gradWeight
    );
  }, [volumeStore.gradLow, volumeStore.gradHigh, volumeStore.gradWeight]);

  // ── Sync diff params (main) ──────────────────────────────────
  useEffect(() => {
    sceneRef.current?.setDiffParams(
      volumeStore.diffOpacity,
      volumeStore.showOriginal,
      volumeStore.showDifference
    );
  }, [volumeStore.diffOpacity, volumeStore.showOriginal, volumeStore.showDifference]);

  useEffect(() => {
    sceneRef.current?.setDiffBaseOpacity(volumeStore.diffBaseOpacity);
  }, [volumeStore.diffBaseOpacity]);

  // ── Sync lighting (YG) ───────────────────────────────────────
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

  // ── Compute percentile-based class boundaries from reference step data ──
  useEffect(() => {
    const refData = volumeStore.getCachedData(volumeStore.referenceStep);
    if (!refData) return;

    const thresholds: PercentileThresholds = computePercentileBoundaries(
      refData,
      volumeStore.lowPercentile,
      volumeStore.highPercentile
    );
    const bounds = buildPercentileBoundaries(thresholds);
    volumeStore.setClassBoundaries(bounds.boundaries);
    classLutRef.current = buildClassLUT(bounds);

    // Boundaries changed → existing diffs are stale, recompute immediately
    scheduleDiffImmediate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    volumeStore.referenceStep,
    volumeStore.lowPercentile,
    volumeStore.highPercentile,
    volumeStore.dataVersion,
  ]);

  // ── Debounced diff computation ──────────────────────────────
  const doComputeDiff = useCallback(() => {
    const vs = sceneRef.current;
    if (!vs) return;

    const refStep = volumeStore.referenceStep;
    const curStep = volumeStore.currentStep;
    const lut = classLutRef.current;
    const categoryFilter = volumeStore.categoryFilter;

    const refData = volumeStore.getCachedData(refStep);
    const curData = volumeStore.getCachedData(curStep);
    if (!refData || !curData) return;

    // Classify both (LUT-based, ~5ms each)
    const refClasses = classifyVolumeLUT(refData, lut);
    volumeStore._refClassesCache = refClasses;

    const curClasses = classifyVolumeLUT(curData, lut);

    // Compute diff (single pass, ~3ms)
    const diffData = computeDiffVolume(refClasses, curClasses, categoryFilter);
    const stats = computeDiffStats(refClasses, curClasses, categoryFilter);

    // Cache
    volumeStore.cacheDiffStats(curStep, stats);
    volumeStore.cacheDiffData(curStep, diffData);

    // Upload to GPU for current step overlay
    if (curStep === volumeStore.currentStep) {
      vs.loadDiffVolume(diffData);
    }

    // Generate thumbnail asynchronously
    pendingThumbSteps.current.add(curStep);
    scheduleThumbnails();
  }, []);

  // ── Schedule diff computation with debounce ─────────────────
  const scheduleDiff = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      doComputeDiff();
      debounceTimer.current = null;
    }, DEBOUNCE_MS);
  }, [doComputeDiff]);

  // ── Immediate diff (no debounce) for first load ─────────────
  const scheduleDiffImmediate = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    doComputeDiff();
  }, [doComputeDiff]);

  // ── Debounced diff on current step change ──────────────────
  useEffect(() => {
    scheduleDiff();
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [volumeStore.currentStep, scheduleDiff]);

  // ── Debounced diff on category filter change ────────────────
  useEffect(() => {
    scheduleDiff();
  }, [volumeStore.categoryFilter, scheduleDiff]);

  // ── Process thumbnails in idle time ─────────────────────────
  const processThumbBatch = useCallback(() => {
    idleCallbackId.current = null;

    const steps = Array.from(pendingThumbSteps.current);
    if (steps.length === 0) return;

    // Process up to 2 thumbnails per idle callback
    const batch = steps.splice(0, 2);
    batch.forEach((s) => pendingThumbSteps.current.delete(s));

    const refStep = volumeStore.referenceStep;
    const refData = volumeStore.getCachedData(refStep);
    if (!refData) {
      scheduleThumbnails();
      return;
    }

    const lut = classLutRef.current;
    const categoryFilter = volumeStore.categoryFilter;

    let refClasses = volumeStore._refClassesCache;
    if (!refClasses) {
      refClasses = classifyVolumeLUT(refData, lut);
      volumeStore._refClassesCache = refClasses;
    }

    for (const step of batch) {
      if (step === refStep) continue;
      const cmpData = volumeStore.getCachedData(step);
      if (!cmpData) continue;

      const cmpClasses = classifyVolumeLUT(cmpData, lut);
      const diffData = computeDiffVolume(refClasses, cmpClasses, categoryFilter);
      const stats = computeDiffStats(refClasses, cmpClasses, categoryFilter);
      const maxClassDiff = Math.max(1, volumeStore.classBoundaries.length - 1);
      const thumb = generateDiffThumbnail(diffData, THUMB_W, THUMB_H, maxClassDiff);
      const dataUrl = imageDataToDataURL(thumb);

      volumeStore.cacheDiffData(step, diffData);
      volumeStore.cacheDiffStats(step, stats);
      volumeStore.setDiffThumbnail(step, dataUrl);
    }

    // Increment version to trigger one batched re-render
    volumeStore.bumpThumbnailVersion();

    scheduleThumbnails();
  }, []);

  const scheduleThumbnails = useCallback(() => {
    if (idleCallbackId.current !== null) return;
    if (pendingThumbSteps.current.size === 0) return;

    if (typeof requestIdleCallback !== 'undefined') {
      idleCallbackId.current = requestIdleCallback(processThumbBatch, {
        timeout: 200,
      });
    } else {
      idleCallbackId.current = window.setTimeout(processThumbBatch, 0) as unknown as number;
    }
  }, [processThumbBatch]);

  // ── Enqueue comparison steps for thumbnail generation ───────
  useEffect(() => {
    for (const s of volumeStore.comparisonSteps) {
      if (s !== volumeStore.referenceStep) {
        const hasThumb = volumeStore.diffThumbnails.has(s);
        if (!hasThumb && volumeStore.getCachedData(s)) {
          pendingThumbSteps.current.add(s);
        }
      }
    }
    scheduleThumbnails();
    return () => {
      if (idleCallbackId.current !== null) {
        if (typeof requestIdleCallback !== 'undefined') {
          cancelIdleCallback(idleCallbackId.current);
        } else {
          clearTimeout(idleCallbackId.current);
        }
        idleCallbackId.current = null;
      }
    };
  }, [
    volumeStore.comparisonSteps,
    volumeStore.referenceStep,
    volumeStore.classBoundaries,
    volumeStore.categoryFilter,
    scheduleThumbnails,
  ]);

  // ── YG: Generate GPU thumbnails for key steps ────────────────
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

  // ── Cleanup on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (idleCallbackId.current !== null) {
        if (typeof requestIdleCallback !== 'undefined') {
          cancelIdleCallback(idleCallbackId.current);
        } else {
          clearTimeout(idleCallbackId.current);
        }
      }
    };
  }, []);

  // ── Compute sorted by change ────────────────────────────────
  const handleSortByChange = useCallback(() => {
    const entries: { step: number; total: number }[] = [];
    for (const s of volumeStore.comparisonSteps) {
      if (s === volumeStore.referenceStep) continue;
      const stats = volumeStore.getCachedDiffStats(s);
      if (stats) {
        entries.push({ step: s, total: stats.growthCount + stats.declineCount });
      }
    }
    entries.sort((a, b) => b.total - a.total);
    volumeStore.setSortedByChange(entries.map((e) => e.step));
  }, []);

  const handleJumpToStep = useCallback((step: number) => {
    volumeStore.setTimeStep(step);
  }, []);

  const handleSetReference = useCallback((step: number) => {
    volumeStore.setReferenceStep(step);
  }, []);

  return (
    <div className="volume-renderer-root" ref={containerRef}>
      <TimeControls
        onSortByChange={handleSortByChange}
        onJumpToStep={handleJumpToStep}
        onSetReference={handleSetReference}
      />
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
