import React, { useCallback, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { volumeStore } from '@/store/volumeStore';
import VolumeRenderer from './volumeRenderer';
import TimeControls from './volumeRenderer/TimeControls';
import TransferFunctionEditor from './volumeRenderer/TransferFunctionEditor';
import ThumbnailControls from './volumeRenderer/ThumbnailControls';
import TailsLineChart from './TailsLineChart';
import './index.less';

type TopRightTab = 'tf' | 'controls';

const View1 = observer(() => {
    const [topRightTab, setTopRightTab] = useState<TopRightTab>('tf');

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
        volumeStore.setDiffStep(step);
        volumeStore.addComparisonStep(step);
    }, []);

    const handleSetReference = useCallback((step: number) => {
        volumeStore.setReferenceStep(step);
    }, []);

    const handleToggleThumbnailStep = useCallback((step: number) => {
        volumeStore.toggleThumbnailStep(step);
    }, []);

    return (
        <div className="view1-root">
            {/* ════ 左上: 3D立方体 + 传递函数 ════ */}
            <div className="view1-top">
                <div className="view1-cube">
                    <div className="block-label">3D 立方体</div>
                    <div className="block-body cube-body">
                        <VolumeRenderer />
                    </div>
                </div>
                <div className="view1-tf">
                    <div className="block-label tf-tabs">
                        <button
                            className={`tf-tab${topRightTab === 'tf' ? ' active' : ''}`}
                            onClick={() => setTopRightTab('tf')}
                        >
                            传递函数
                        </button>
                        <button
                            className={`tf-tab${topRightTab === 'controls' ? ' active' : ''}`}
                            onClick={() => setTopRightTab('controls')}
                        >
                            视角控制
                        </button>
                    </div>
                    <div className="block-body tf-body">
                        {topRightTab === 'tf' ? (
                            <TransferFunctionEditor mode="embedded" />
                        ) : (
                            <ThumbnailControls />
                        )}
                    </div>
                </div>
            </div>

            {/* ════ 左下: 播放图表 + 缩略图 ════ */}
            <div className="view1-bottom">
               

                {/* Row: [▶3%] [图表94%] [倍速3%] */}
                <div className="chart-row">
                    <button
                        className="play-btn-inline"
                        onClick={() => volumeStore.togglePlay()}
                        title={volumeStore.isPlaying ? '暂停' : '播放'}
                        disabled={volumeStore.isLoading}
                    >
                        {volumeStore.isPlaying ? '⏸' : '▶'}
                    </button>
                    <div className="tails-chart-wrapper">
                        <TailsLineChart
                            currentStep={volumeStore.currentStep}
                            thumbnailSteps={volumeStore.thumbnailSteps}
                            onJumpToStep={handleJumpToStep}
                            onToggleThumbnailStep={handleToggleThumbnailStep}
                        />
                    </div>
                    <select
                        className="speed-select-inline"
                        value={volumeStore.playSpeed}
                        onChange={(e) => volumeStore.setPlaySpeed(Number(e.target.value))}
                    >
                        <option value={1}>1x</option>
                        <option value={2}>2x</option>
                        <option value={4}>4x</option>
                        <option value={8}>8x</option>
                    </select>
                </div>

                {/* Thumbnail rows */}
                <div className="timeline-body">
                    <TimeControls
                        onSortByChange={handleSortByChange}
                        onJumpToStep={handleJumpToStep}
                        onSetReference={handleSetReference}
                        onToggleThumbnailStep={handleToggleThumbnailStep}
                    />
                </div>
            </div>
        </div>
    );
});

export default View1;
