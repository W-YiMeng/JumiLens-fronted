import React from 'react';
import './index.less';
import {SvgIcon} from '@/components';

const View1 = () => {
    return (
        <div className='view1-root'>
            <div className='view1-icon'>
                <SvgIcon svgName='pill' svgClass='view1-icon-svg' />
                <span className='view1-title'>题目1</span>
            </div>
        </div>
    );
};

export default View1;
