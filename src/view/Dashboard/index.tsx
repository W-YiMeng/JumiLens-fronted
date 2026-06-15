import React from 'react';
import { observer } from 'mobx-react-lite';
import { volumeStore } from '@/store/volumeStore';
import { EvolutionChart } from '@/components';
import './index.less';
import View1 from './view1/view1';
import HistogramPanel from './view2/HistogramPanel';

const Dashboard: React.FC = () => {
    return (
        <div className='dashboard-root'>
            <header className='header-root'>
                <span className='header-title'>ChinaVIS2026</span>
                <span className='header-step'>Step {volumeStore.currentStep} / 99</span>
            </header>
            <main className='main-content'>
                {/* ======== 左侧: 3D立方体 + 传递函数 + 时间轴 ======== */}
                <div className='left-panel'>
                    <View1 />
                </div>
                {/* ======== 右侧: 密度直方图 | 密度统计演化 ======== */}
                <div className='right-panel'>
                    <div className='histogram-panel'>
                        <HistogramPanel />
                    </div>
                    <div className='evolution-panel'>
                        <EvolutionChart
                            currentStep={volumeStore.currentStep}
                            onJumpToStep={(step) => volumeStore.setTimeStep(step)}
                        />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default observer(Dashboard);
