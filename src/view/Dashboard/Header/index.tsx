import React from 'react';
import './index.less';
import {SvgIcon} from '@/components';

const Header = () => {
    return (
        <div className='header-root'>
            <div className='header-icon'>
                <SvgIcon svgName='pill' svgClass='header-icon-svg' />
                <span className='span-hcxai'>DDInterpreter</span>
            </div>
        </div>
    );
};

export default Header;
