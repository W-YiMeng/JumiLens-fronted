import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { volumeStore } from '@/store/volumeStore';

interface TimeControlsProps {
  onSortByChange: () => void;
  onJumpToStep: (step: number) => void;
  onSetReference: (step: number) => void;
  onToggleThumbnailStep: (step: number) => void;
}

const TimeControls: React.FC<TimeControlsProps> = observer(
  ({ onSortByChange, onJumpToStep, onSetReference, onToggleThumbnailStep }) => {
    const { currentStep, isPlaying, playSpeed, isLoading, referenceStep } = volumeStore;
    const [enlarged, setEnlarged] = useState<{ step: number; type: 'low' | 'high'; url: string } | null>(null);

    // ── Render a thumbnail card ──
    const canRemove = volumeStore.thumbnailSteps.length > 1;

    const renderThumb = (step: number, type: 'low' | 'high') => {
      const img = volumeStore.getThumbnailImage(step, type);
      const isRef = step === referenceStep;
      const rangeLabel = type === 'low' ? '低密度' : '高密度';
      return (
        <div
          key={`${type}-${step}`}
          className={`thumb-card${isRef ? ' reference' : ''}`}
          onClick={() => onJumpToStep(step)}
          onDoubleClick={() => { if (img) setEnlarged({ step, type, url: img }); }}
          onContextMenu={(e) => { e.preventDefault(); onSetReference(step); }}
          title={`Step ${step} ${rangeLabel}${isRef ? ' ★ 参考步' : ''}\n单击跳转 · 双击放大 · 右键设参考 · ${canRemove ? '✕ 移除缩略图' : ''}`}
        >
          <div className="thumb-card-img" style={{ backgroundImage: img ? `url(${img})` : undefined }}>
            {!img && <span className="thumb-card-loading">加载中...</span>}
            {isRef && <span className="thumb-card-star">★</span>}
            {img && (
              <button
                className="thumb-card-expand"
                onClick={(e) => { e.stopPropagation(); setEnlarged({ step, type, url: img }); }}
                title="放大查看"
              >⛶</button>
            )}
            {canRemove && (
              <button
                className="thumb-card-remove"
                onClick={(e) => { e.stopPropagation(); onToggleThumbnailStep(step); }}
                title="移除缩略图"
              >✕</button>
            )}
          </div>
          <span className="thumb-card-label">{step}{isRef ? ' ★' : ''}</span>
        </div>
      );
    };

    return (
      <>
        <div className="time-controls">
          {/* ── Top bar: Playback + REF ── */}
          <div className="time-bar">
            <button className="play-btn" onClick={() => volumeStore.togglePlay()} title={isPlaying ? '暂停' : '播放'} disabled={isLoading}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <input className="time-slider" type="range" min={0} max={99} value={currentStep} onChange={(e) => volumeStore.setTimeStep(Number(e.target.value))} />
            <span className="step-label">Step {currentStep} / 99</span>
            <select className="speed-select" value={playSpeed} onChange={(e) => volumeStore.setPlaySpeed(Number(e.target.value))}>
              <option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option><option value={8}>8x</option>
            </select>
            <div className="ref-badge-inline">
              <span className="ref-label">参考步</span>
              <span className="ref-value">{referenceStep}</span>
              <span className="ref-hint">右键缩略图设定</span>
            </div>
          </div>

          {/* ── Thumbnail rows ── */}
          <div className="thumb-rows">
            <div className="thumb-row-label">低密度范围</div>
            <div className="thumb-cards">{volumeStore.thumbnailSteps.map(s => renderThumb(s, 'low'))}</div>
          </div>
          <div className="thumb-rows">
            <div className="thumb-row-label">高密度范围</div>
            <div className="thumb-cards">{volumeStore.thumbnailSteps.map(s => renderThumb(s, 'high'))}</div>
          </div>

        </div>

        {/* ── Enlarged thumbnail modal ── */}
        {enlarged && (
          <div className="thumb-modal-overlay" onClick={() => setEnlarged(null)}>
            <div className="thumb-modal" onClick={(e) => e.stopPropagation()}>
              <div className="thumb-modal-header">
                <span>Step {enlarged.step} — {enlarged.type === 'low' ? '低密度' : '高密度'}{enlarged.step === referenceStep ? ' ★ 参考步' : ''}</span>
                <button className="thumb-modal-close" onClick={() => setEnlarged(null)}>✕</button>
              </div>
              <img src={enlarged.url} alt={`Step ${enlarged.step}`} />
              <div className="thumb-modal-actions">
                <button onClick={() => { onSetReference(enlarged.step); setEnlarged(null); }}>设为首选步</button>
                <button onClick={() => setEnlarged(null)}>关闭</button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }
);

export default TimeControls;
