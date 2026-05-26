import React from 'react';
import './index.less';

interface StatisticsData {
  min: number;
  max: number;
  mean: number;
  std: number;
  median: number;
  p1: number;
  p5: number;
  p95: number;
  p99: number;
}

interface StatisticsPanelProps {
  stats: StatisticsData | null;
  timestep: number;
}

const StatisticsPanel: React.FC<StatisticsPanelProps> = ({ stats, timestep }) => {
  if (!stats) {
    return (
      <div className="statistics-panel">
        <div className="panel-title">统计信息</div>
        <div className="loading">加载中...</div>
      </div>
    );
  }

  const formatNumber = (num: number) => {
    if (num === 0) return '0';
    if (Math.abs(num) < 0.001 || Math.abs(num) > 10000) {
      return num.toExponential(3);
    }
    return num.toFixed(4);
  };

  return (
    <div className="statistics-panel">
      <div className="panel-title">统计信息 - 时间步 {timestep}</div>
      
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-label">最小值</span>
          <span className="stat-value">{formatNumber(stats.min)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">最大值</span>
          <span className="stat-value highlight">{formatNumber(stats.max)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">平均值</span>
          <span className="stat-value">{formatNumber(stats.mean)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">标准差</span>
          <span className="stat-value">{formatNumber(stats.std)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">中位数</span>
          <span className="stat-value">{formatNumber(stats.median)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">1%分位数</span>
          <span className="stat-value low">{formatNumber(stats.p1)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">5%分位数</span>
          <span className="stat-value low">{formatNumber(stats.p5)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">95%分位数</span>
          <span className="stat-value high">{formatNumber(stats.p95)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">99%分位数</span>
          <span className="stat-value high">{formatNumber(stats.p99)}</span>
        </div>
      </div>

      <div className="stats-summary">
        <div className="summary-item">
          <span className="summary-label">密度范围</span>
          <span className="summary-value">
            {formatNumber(stats.max - stats.min)}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">变异系数</span>
          <span className="summary-value">
            {formatNumber(stats.std / stats.mean)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default StatisticsPanel;
