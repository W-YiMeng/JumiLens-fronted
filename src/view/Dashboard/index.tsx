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
                <div className='view1'>
                    <div className='panel-title'>题目12</div>
                    <div className='panel-body'><View1 /></div>
                </div>
                <div className='view2'>
                    <div className='panel-title'>题目3</div>
                    <div className='panel-body'><View2 /></div>
                </div>
            </main>
        </div>
    );
};

export default observer(Dashboard);
