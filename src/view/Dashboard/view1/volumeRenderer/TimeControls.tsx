import React, { useRef, useCallback, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { volumeStore } from '@/store/volumeStore';

interface TimeControlsProps {
  onSortByChange: () => void;
  onJumpToStep: (step: number) => void;
  onSetReference: (step: number) => void;
}

const TimeControls: React.FC<TimeControlsProps> = observer(
  ({ onSortByChange, onJumpToStep, onSetReference }) => {
    const { currentStep, isPlaying, playSpeed, isLoading, referenceStep, comparisonSteps } =
      volumeStore;
    // Read thumbnailVersion to trigger re-render when batch completes
    void volumeStore.thumbnailVersion;
    const stripRef = useRef<HTMLDivElement>(null);
    const [addInput, setAddInput] = useState('');

    const handleAddStep = useCallback(() => {
      const step = parseInt(addInput, 10);
      if (!isNaN(step) && step >= 0 && step <= 99) {
        volumeStore.addComparisonStep(step);
        setAddInput('');
      }
    }, [addInput]);

    const handleAddCurrent = useCallback(() => {
      volumeStore.addComparisonStep(currentStep);
    }, [currentStep]);

    return (
      <div className="time-controls-wrapper">
        {/* ── Playback bar ─────────────────────────────────── */}
        <div className="time-controls">
          <button
            className="play-btn"
            onClick={() => volumeStore.togglePlay()}
            title={isPlaying ? 'Pause' : 'Play'}
            disabled={isLoading}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          <input
            className="time-slider"
            type="range"
            min={0}
            max={99}
            value={currentStep}
            onChange={(e) => volumeStore.setTimeStep(Number(e.target.value))}
          />

          <span className="step-label">
            Step {currentStep} / 99
          </span>

          <select
            className="speed-select"
            value={playSpeed}
            onChange={(e) => volumeStore.setPlaySpeed(Number(e.target.value))}
          >
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
            <option value={8}>8x</option>
          </select>
        </div>

        {/* ── Diff timeline ────────────────────────────────── */}
        <div className="diff-timeline">
          <div className="diff-timeline-header">
            <div className="diff-ref-info">
              <span className="diff-ref-label">REF:</span>
              <span className="diff-ref-step-static">Step {referenceStep}</span>
              <span className="diff-ref-hint">(right-click thumbnail to change)</span>
            </div>
            <div className="diff-timeline-actions">
              <button
                className="diff-sort-btn"
                onClick={handleAddCurrent}
                title="Add current step to comparison"
              >
                + Current
              </button>
              <div className="diff-add-group">
                <input
                  className="diff-add-input"
                  type="number"
                  min={0}
                  max={99}
                  placeholder="Step #"
                  value={addInput}
                  onChange={(e) => setAddInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddStep();
                  }}
                />
                <button className="diff-sort-btn" onClick={handleAddStep}>
                  Add
                </button>
              </div>
              <button
                className="diff-sort-btn"
                onClick={onSortByChange}
                title="Sort comparison steps by most change"
              >
                Sort ▾
              </button>
            </div>
          </div>

          <div className="diff-thumbnail-strip" ref={stripRef}>
            {comparisonSteps.length === 0 && (
              <div className="diff-empty-hint">
                No comparison steps. Click "+ Current" or enter a step number and click "Add".
              </div>
            )}
            {comparisonSteps.map((step) => {
              const isRef = step === referenceStep;
              const isCurrent = step === currentStep;
              const thumbUrl = volumeStore.diffThumbnails.get(step);
              const stats = volumeStore.getCachedDiffStats(step);
              const hasData = volumeStore.getCachedData(step) !== undefined;

              const totalVoxels = 128 * 128 * 128;
              const growthPct = stats
                ? ((stats.growthCount / totalVoxels) * 100).toFixed(1)
                : null;
              const declinePct = stats
                ? ((stats.declineCount / totalVoxels) * 100).toFixed(1)
                : null;

              return (
                <div
                  key={step}
                  className={`diff-thumbnail${isCurrent ? ' active' : ''}${
                    isRef ? ' reference' : ''
                  }`}
                  data-step={step}
                  onClick={() => onJumpToStep(step)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onSetReference(step);
                  }}
                  title={
                    isRef
                      ? `Reference Step ${step}`
                      : `Step ${step} vs Ref ${referenceStep}` +
                        (growthPct ? `\nGrowth: ${growthPct}%` : '') +
                        (declinePct ? `\nDecline: ${declinePct}%` : '') +
                        '\nRight-click to set as reference'
                  }
                >
                  {/* Remove button (not on reference) */}
                  {!isRef && (
                    <button
                      className="diff-thumb-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        volumeStore.removeComparisonStep(step);
                      }}
                      title="Remove from comparison"
                    >
                      ×
                    </button>
                  )}

                  {/* Thumbnail image */}
                  <div className="diff-thumb-img">
                    {isRef ? (
                      <div className="diff-thumb-ref-icon">★</div>
                    ) : thumbUrl ? (
                      <img src={thumbUrl} alt={`Step ${step}`} />
                    ) : hasData ? (
                      <div className="diff-thumb-loading">...</div>
                    ) : (
                      <div className="diff-thumb-empty">—</div>
                    )}
                  </div>

                  {/* Step number */}
                  <span className="diff-thumb-label">
                    {isRef ? `${step} ★` : String(step)}
                  </span>

                  {/* Stats bar */}
                  {!isRef && stats && (
                    <div className="diff-stats-bar">
                      <div className="diff-stats-track">
                        <div
                          className="diff-stats-growth"
                          style={{ width: `${Math.min(100, Number(growthPct) * 3)}%` }}
                        />
                        <div
                          className="diff-stats-decline"
                          style={{ width: `${Math.min(100, Number(declinePct) * 3)}%` }}
                        />
                      </div>
                      <span className="diff-stats-text">
                        {growthPct !== null && Number(growthPct) > 0
                          ? `+${growthPct}%`
                          : ''}
                        {declinePct !== null && Number(declinePct) > 0
                          ? ` -${declinePct}%`
                          : ''}
                        {stats && stats.growthCount === 0 && stats.declineCount === 0
                          ? '0%'
                          : ''}
                      </span>
                    </div>
                  )}
                  {!isRef && !stats && (
                    <div className="diff-stats-bar diff-stats-empty">
                      {hasData ? 'computing...' : 'no data'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sorted-by-change quick nav — only within comparison steps */}
          {volumeStore.sortedByChange.length > 0 && (
            <div className="diff-sorted-strip">
              <span className="diff-sorted-label">Top changes:</span>
              {volumeStore.sortedByChange
                .filter((s) => comparisonSteps.includes(s))
                .slice(0, 8)
                .map((step) => {
                  const stats = volumeStore.getCachedDiffStats(step);
                  const total = stats
                    ? stats.growthCount + stats.declineCount
                    : 0;
                  return (
                    <button
                      key={step}
                      className="diff-sorted-chip"
                      onClick={() => onJumpToStep(step)}
                    >
                      Step {step}
                      <span className="diff-chip-dot">
                        {total > 1000 ? '🔴' : total > 100 ? '🟡' : '🟢'}
                      </span>
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    );
  }
);

export default TimeControls;
