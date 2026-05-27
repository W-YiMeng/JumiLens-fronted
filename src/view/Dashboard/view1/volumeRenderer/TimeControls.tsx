import React from 'react';
import { observer } from 'mobx-react-lite';
import { volumeStore } from '@/store/volumeStore';

const TimeControls: React.FC = observer(() => {
  const { currentStep, isPlaying, playSpeed, isLoading } = volumeStore;

  return (
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
  );
});

export default TimeControls;
