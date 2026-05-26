import React from 'react';
import { observer } from 'mobx-react-lite';
import './index.less';
import NyxVisualization from './NyxVisualization';

const Dashboard: React.FC = () => {
    return (
        <div className='dashboard-root'>
            <header className='header-root'>
                <span className='header-title'>Nyx宇宙学模拟可视化分析系统</span>
                <span className='header-subtitle'>ChinaVIS 2026</span>
            </header>
            <main className='main-content'>
                <NyxVisualization />
            </main>
        </div>
    );
};

export default observer(Dashboard);
