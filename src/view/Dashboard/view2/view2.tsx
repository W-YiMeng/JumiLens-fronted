import React from 'react';
import './index.less';
import {SvgIcon} from '@/components';

const View2 = () => {
    return (
        <div className='view2-root'>
            <div className='view2-icon'>
                <SvgIcon svgName='pill' svgClass='view2-icon-svg' />
                <span className='view2-title'>题目3</span>
            </div>
        </div>
    );
};

export default View2;
