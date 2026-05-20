/*
 * react-router 官方文档
 * https://reactrouter.com/7.1.5/upgrading/v6
 */
import React from 'react';
import SuspenseLazy from '@/components/SuspenseLazy';
import {Navigate, RouteObject} from 'react-router';

const Dashboard = SuspenseLazy(() => import(/* webpackChunkName:"dashboard" */ '@/view/Dashboard'));
const NotFound = SuspenseLazy(() => import(/* webpackChunkName:"not-found" */ '@/view/NotFound'));

const routes: RouteObject[] = [
    {
        path: '/',
        element: <Navigate to='/dashboard' /> // 重定向
    },
    {
        path: 'dashboard',
        element: Dashboard
    },
    // 未匹配到页面
    {
        path: '*',
        element: NotFound
    }
];

export default routes;
