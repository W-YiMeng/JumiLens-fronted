import React from 'react';
import { observer } from 'mobx-react-lite';
import { volumeStore, type ThumbnailCompareMode, type ThumbnailView } from '@/store/volumeStore';

const ThumbnailControls: React.FC = observer(() => {
  return (
    <div className="thumb-ctls standalone">
      <div className="thumb-ctl-group">
        <label>视角</label>
        <select
          value={volumeStore.thumbnailView}
          onChange={(e) => volumeStore.setThumbnailView(e.target.value as ThumbnailView)}
        >
          <option value="current">当前视角</option>
          <option value="top">俯视</option>
          <option value="front">正视</option>
          <option value="side">侧视</option>
        </select>
        {volumeStore.thumbnailView === 'current' && (
          <button
            className="thumb-btn"
            onClick={() => volumeStore.refreshThumbnails()}
            title="刷新当前视角缩略图"
          >
            刷新
          </button>
        )}
      </div>

      <div className="thumb-ctl-group">
        <label>对比</label>
        <select
          value={volumeStore.thumbnailCompareMode}
          onChange={(e) =>
            volumeStore.setThumbnailCompareMode(e.target.value as ThumbnailCompareMode)
          }
        >
          <option value="off">关闭</option>
          <option value="prev">上一步</option>
          <option value="ref">参考步</option>
        </select>
        {volumeStore.thumbnailCompareMode === 'ref' && (
          <select
            value={volumeStore.thumbnailCompareRefIndex}
            onChange={(e) =>
              volumeStore.setThumbnailCompareRefIndex(Number(e.target.value))
            }
          >
            {volumeStore.thumbnailSteps.map((step, idx) => (
              <option key={`r-${step}`} value={idx}>
                第{step}步
              </option>
            ))}
          </select>
        )}
        <button
          className={`thumb-btn${volumeStore.thumbnailCompareOverlay ? ' active' : ''}`}
          onClick={() => volumeStore.toggleThumbnailCompareOverlay()}
          title="叠加基础密度"
        >
          叠加
        </button>
      </div>

      <div className="thumb-ctl-group">
        <label>低密度</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volumeStore.thumbnailLowRange[0]}
          onChange={(e) =>
            volumeStore.setThumbnailLowRange(
              Number(e.target.value),
              volumeStore.thumbnailLowRange[1],
            )
          }
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volumeStore.thumbnailLowRange[1]}
          onChange={(e) =>
            volumeStore.setThumbnailLowRange(
              volumeStore.thumbnailLowRange[0],
              Number(e.target.value),
            )
          }
        />
        <span className="ctl-range-val">
          {volumeStore.thumbnailLowRange[0].toFixed(2)}-{volumeStore.thumbnailLowRange[1].toFixed(2)}
        </span>
      </div>

      <div className="thumb-ctl-group">
        <label>高密度</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volumeStore.thumbnailHighRange[0]}
          onChange={(e) =>
            volumeStore.setThumbnailHighRange(
              Number(e.target.value),
              volumeStore.thumbnailHighRange[1],
            )
          }
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volumeStore.thumbnailHighRange[1]}
          onChange={(e) =>
            volumeStore.setThumbnailHighRange(
              volumeStore.thumbnailHighRange[0],
              Number(e.target.value),
            )
          }
        />
        <span className="ctl-range-val">
          {volumeStore.thumbnailHighRange[0].toFixed(2)}-{volumeStore.thumbnailHighRange[1].toFixed(2)}
        </span>
      </div>
    </div>
  );
});

export default ThumbnailControls;
