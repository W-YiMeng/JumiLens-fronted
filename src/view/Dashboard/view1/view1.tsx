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

    // ── Handlers (moved from VolumeRenderer) ──
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
        volumeStore.setDiffStep(step); // 差异图层仅跟随缩略图选择
        volumeStore.addComparisonStep(step); // 同步加入差异分析系统
    }, []);

    const handleSetReference = useCallback((step: number) => {
        volumeStore.setReferenceStep(step);
    }, []);

    const handleToggleThumbnailStep = useCallback((step: number) => {
        volumeStore.toggleThumbnailStep(step);
    }, []);

    return (
        <div className="view1-root">
            {/* ════ 左上 60%: flex row (7:3) — 3D立方体 + 传递函数 ════ */}
            <div className="view1-top">
                {/* 左上左 70%: 3D立方体 */}
                <div className="view1-cube">
                    <div className="block-label">3D 立方体</div>
                    <div className="block-body cube-body">
                        <VolumeRenderer />
                    </div>
                </div>
                {/* 左上右 30%: 多Tab面板 */}
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
            {/* ════ 左下 40%: 时间轴模块 ════ */}
            <div className="view1-bottom">
                <div className="block-label">时间轴</div>
                <div className="tails-chart-wrapper">
                    <TailsLineChart
                        currentStep={volumeStore.currentStep}
                        thumbnailSteps={volumeStore.thumbnailSteps}
                        onJumpToStep={handleJumpToStep}
                        onToggleThumbnailStep={handleToggleThumbnailStep}
                    />
                </div>
                <div className="block-body timeline-body">
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
