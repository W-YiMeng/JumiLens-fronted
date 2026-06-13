import React from 'react';
import { observer } from 'mobx-react-lite';
import './index.less';
import View1 from './view1/view1';
import View2 from './view2/view2';

const Dashboard: React.FC = () => {
    return (
        <div className='dashboard-root'>
            <header className='header-root'>
                <span className='header-title'>ChinaVIS2026</span>
            </header>
            <main className='main-content'>
                {/* ======== 左侧 60%: 3D立方体 + 传递函数 + 时间轴 ======== */}
                <div className='left-panel'>
                    <View1 />
                </div>
                {/* ======== 右侧 40%: 密度直方图 + 统计表格 ======== */}
                <div className='right-panel'>
                    <View2 />
                </div>
            </main>
        </div>
    );
};

export default observer(Dashboard);
