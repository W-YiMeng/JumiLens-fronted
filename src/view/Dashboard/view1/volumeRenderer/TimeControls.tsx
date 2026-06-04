import React from 'react';
import { observer } from 'mobx-react-lite';
import { volumeStore, type ThumbnailCompareMode, type ThumbnailView } from '../../../../store/volumeStore';

const TimeControls: React.FC = observer(() => {
  const { currentStep, isPlaying, playSpeed, isLoading } = volumeStore;

  return (
    <div className="time-controls">
      <div className="thumb-strip">
        <div className="thumb-controls">
          <div className="thumb-control">
            <span>View</span>
            <select
              value={volumeStore.thumbnailView}
              onChange={(e) => volumeStore.setThumbnailView(e.target.value as ThumbnailView)}
            >
              <option value="current">Current</option>
              <option value="top">Top</option>
              <option value="front">Front</option>
              <option value="side">Side</option>
            </select>
            {volumeStore.thumbnailView === 'current' && (
              <button
                className="thumb-btn"
                onClick={() => volumeStore.refreshThumbnails()}
                title="Update thumbnails for current view"
              >
                Update
              </button>
            )}
          </div>
          <div className="thumb-control">
            <span>Compare</span>
            <select
              value={volumeStore.thumbnailCompareMode}
              onChange={(e) => volumeStore.setThumbnailCompareMode(e.target.value as ThumbnailCompareMode)}
            >
              <option value="off">Off</option>
              <option value="prev">Prev step</option>
              <option value="ref">Ref: 2nd step</option>
            </select>
            {volumeStore.thumbnailCompareMode === 'ref' && (
              <select
                value={volumeStore.thumbnailCompareRefIndex}
                onChange={(e) => volumeStore.setThumbnailCompareRefIndex(Number(e.target.value))}
              >
                {volumeStore.thumbnailSteps.map((step, idx) => (
                  <option key={`ref-${step}`} value={idx}>
                    Ref {step}
                  </option>
                ))}
              </select>
            )}
            <button
              className={`thumb-btn ${volumeStore.thumbnailCompareOverlay ? 'active' : ''}`}
              onClick={() => volumeStore.toggleThumbnailCompareOverlay()}
              title="Overlay base density to show where change happens"
            >
              Overlay
            </button>
          </div>
          <div className="thumb-control">
            <span>Low range</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volumeStore.thumbnailLowRange[0]}
              onChange={(e) =>
                volumeStore.setThumbnailLowRange(Number(e.target.value), volumeStore.thumbnailLowRange[1])
              }
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volumeStore.thumbnailLowRange[1]}
              onChange={(e) =>
                volumeStore.setThumbnailLowRange(volumeStore.thumbnailLowRange[0], Number(e.target.value))
              }
            />
            <span className="thumb-range">
              {volumeStore.thumbnailLowRange[0].toFixed(2)}-{volumeStore.thumbnailLowRange[1].toFixed(2)}
            </span>
          </div>
          <div className="thumb-control">
            <span>High range</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volumeStore.thumbnailHighRange[0]}
              onChange={(e) =>
                volumeStore.setThumbnailHighRange(Number(e.target.value), volumeStore.thumbnailHighRange[1])
              }
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volumeStore.thumbnailHighRange[1]}
              onChange={(e) =>
                volumeStore.setThumbnailHighRange(volumeStore.thumbnailHighRange[0], Number(e.target.value))
              }
            />
            <span className="thumb-range">
              {volumeStore.thumbnailHighRange[0].toFixed(2)}-{volumeStore.thumbnailHighRange[1].toFixed(2)}
            </span>
          </div>
        </div>
        <div className="thumb-row">
          <span className="thumb-label">Low density</span>
          <div className="thumbs">
            {volumeStore.thumbnailSteps.map((step) => {
              const img = volumeStore.getThumbnailImage(step, 'low');
              return (
                <div
                  key={`low-${step}`}
                  className="thumb low"
                  style={{ backgroundImage: img ? `url(${img})` : undefined }}
                  title={`Step ${step} low density`}
                  onClick={() => volumeStore.setTimeStep(step)}
                >
                  <span className="thumb-step">{step}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="thumb-row">
          <span className="thumb-label">High density</span>
          <div className="thumbs">
            {volumeStore.thumbnailSteps.map((step) => {
              const img = volumeStore.getThumbnailImage(step, 'high');
              return (
                <div
                  key={`high-${step}`}
                  className="thumb high"
                  style={{ backgroundImage: img ? `url(${img})` : undefined }}
                  title={`Step ${step} high density`}
                  onClick={() => volumeStore.setTimeStep(step)}
                >
                  <span className="thumb-step">{step}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="time-main">
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
    </div>
  );
});

export default TimeControls;
