import React from 'react';
import './index.less';

interface TimelineControlProps {
  currentTimestep: number;
  totalTimesteps: number;
  onTimestepChange: (timestep: number) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
}

const TimelineControl: React.FC<TimelineControlProps> = ({
  currentTimestep,
  totalTimesteps,
  onTimestepChange,
  isPlaying,
  onPlayPause,
}) => {
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onTimestepChange(parseInt(e.target.value, 10));
  };

  const handlePrev = () => {
    const newTimestep = Math.max(0, currentTimestep - 1);
    onTimestepChange(newTimestep);
  };

  const handleNext = () => {
    const newTimestep = Math.min(totalTimesteps - 1, currentTimestep + 1);
    onTimestepChange(newTimestep);
  };

  const handleFirst = () => {
    onTimestepChange(0);
  };

  const handleLast = () => {
    onTimestepChange(totalTimesteps - 1);
  };

  return (
    <div className="timeline-control">
      <div className="timeline-header">
        <span className="timestep-label">时间步控制</span>
        <span className="timestep-value">
          {currentTimestep.toString().padStart(4, '0')} / {(totalTimesteps - 1).toString().padStart(4, '0')}
        </span>
      </div>
      
      <div className="timeline-slider-container">
        <label htmlFor="timestep-slider" className="visually-hidden">时间步选择</label>
        <input
          id="timestep-slider"
          type="range"
          className="timeline-slider"
          min={0}
          max={totalTimesteps - 1}
          value={currentTimestep}
          onChange={handleSliderChange}
          title="拖动选择时间步"
          aria-label={`当前时间步: ${currentTimestep}`}
        />
        <div className="timeline-ticks">
          <span>0</span>
          <span>{Math.floor(totalTimesteps / 4)}</span>
          <span>{Math.floor(totalTimesteps / 2)}</span>
          <span>{Math.floor(totalTimesteps * 3 / 4)}</span>
          <span>{totalTimesteps - 1}</span>
        </div>
      </div>

      <div className="timeline-buttons">
        <button className="control-btn" onClick={handleFirst} title="第一帧">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
          </svg>
        </button>
        <button className="control-btn" onClick={handlePrev} title="上一帧">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm4.5 6l8.5 6V6z"/>
          </svg>
        </button>
        <button className={`control-btn play-btn ${isPlaying ? 'playing' : ''}`} onClick={onPlayPause} title={isPlaying ? '暂停' : '播放'}>
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          )}
        </button>
        <button className="control-btn" onClick={handleNext} title="下一帧">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
          </svg>
        </button>
        <button className="control-btn" onClick={handleLast} title="最后一帧">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TimelineControl;
