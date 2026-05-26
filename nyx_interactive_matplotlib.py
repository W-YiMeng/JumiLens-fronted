"""
Nyx宇宙学数据交互式可视化仪表盘 (Matplotlib版本)
支持相空间刷选和三维可视化联动
"""

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.widgets import Slider, Button, RangeSlider, RadioButtons
from matplotlib.patches import Rectangle
from mpl_toolkits.mplot3d import Axes3D
import os

# 设置中文字体
plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False


def load_nyx_data(filepath):
    """加载Nyx数据文件"""
    data = np.fromfile(filepath, dtype=np.float32)
    return data.reshape((128, 128, 128))


class NyxInteractiveDashboard:
    """Nyx交互式可视化仪表盘"""
    
    def __init__(self, data_dir=r'd:\Chinavis2026\Nyx'):
        self.data_dir = data_dir
        self.current_timestep = 50
        self.data_cache = {}
        
        # 加载初始数据
        self.current_data = self.get_timestep_data(self.current_timestep)
        
        # 创建图形
        self.fig = plt.figure(figsize=(20, 12))
        self.fig.patch.set_facecolor('#f0f0f0')
        
        # 创建子图
        self.setup_layout()
        
        # 设置交互控件 (必须在update_display之前)
        self.setup_controls()
        
        # 初始化显示
        self.update_display()
        
        plt.tight_layout(rect=[0, 0.15, 1, 0.95])
        plt.show()
    
    def get_timestep_data(self, ts):
        """获取时间步数据（带缓存）"""
        if ts not in self.data_cache:
            filepath = os.path.join(self.data_dir, f"{ts:04d}.dat")
            self.data_cache[ts] = np.fromfile(filepath, dtype=np.float32)
        return self.data_cache[ts]
    
    def setup_layout(self):
        """设置布局"""
        # 1. 密度分布直方图 (左上)
        self.ax_hist = self.fig.add_axes([0.05, 0.55, 0.25, 0.35])
        self.ax_hist.set_facecolor('white')
        self.ax_hist.set_title('Density Distribution Histogram', fontsize=12, fontweight='bold')
        self.ax_hist.set_xlabel('Density')
        self.ax_hist.set_ylabel('Frequency (Log Scale)')
        
        # 2. 统计信息面板 (左中)
        self.ax_stats = self.fig.add_axes([0.05, 0.35, 0.25, 0.15])
        self.ax_stats.set_facecolor('#2c3e50')
        self.ax_stats.axis('off')
        
        # 3. 时间演化图 (左下)
        self.ax_evolution = self.fig.add_axes([0.05, 0.18, 0.25, 0.12])
        self.ax_evolution.set_facecolor('white')
        self.ax_evolution.set_title('Density Evolution', fontsize=10)
        self.ax_evolution.set_xlabel('Timestep')
        self.ax_evolution.set_ylabel('Mean Density')
        
        # 4. 3D散点图 (右侧主要区域)
        self.ax_3d = self.fig.add_axes([0.35, 0.18, 0.60, 0.72], projection='3d')
        self.ax_3d.set_facecolor('black')
        self.ax_3d.set_title('3D Volume Visualization (Top 1% High Density)', 
                            fontsize=14, fontweight='bold', color='white')
        self.ax_3d.set_xlabel('X', color='white')
        self.ax_3d.set_ylabel('Y', color='white')
        self.ax_3d.set_zlabel('Z', color='white')
        self.ax_3d.tick_params(colors='white')
        
        # 5. 密度切片图 (右下)
        self.ax_slice = self.fig.add_axes([0.35, 0.02, 0.28, 0.12])
        self.ax_slice.set_facecolor('black')
        self.ax_slice.set_title('Density Slice (Z=64)', fontsize=10, color='white')
        
        # 6. 密度范围指示器 (右下)
        self.ax_range = self.fig.add_axes([0.67, 0.02, 0.28, 0.12])
        self.ax_range.set_facecolor('white')
        self.ax_range.set_title('Selected Density Range', fontsize=10)
    
    def setup_controls(self):
        """设置交互控件"""
        # 时间步滑块
        ax_timestep = self.fig.add_axes([0.35, 0.93, 0.40, 0.03])
        self.slider_timestep = Slider(
            ax_timestep, 'Timestep', 0, 99, valinit=self.current_timestep,
            valstep=1, color='#3498db'
        )
        self.slider_timestep.on_changed(self.on_timestep_change)
        
        # 密度范围滑块
        ax_density = self.fig.add_axes([0.05, 0.08, 0.25, 0.03])
        self.slider_density = RangeSlider(
            ax_density, 'Density Range', 
            7.5, 15.0, valinit=(10.0, 12.0),
            color='#e74c3c'
        )
        self.slider_density.on_changed(self.on_density_range_change)
        
        # 模式选择按钮
        ax_mode = self.fig.add_axes([0.82, 0.93, 0.13, 0.05])
        self.radio_mode = RadioButtons(
            ax_mode, ('Top 1%', 'Custom Range', 'All Data'),
            active=0
        )
        self.radio_mode.on_clicked(self.on_mode_change)
        
        # 刷新按钮
        ax_refresh = self.fig.add_axes([0.05, 0.02, 0.08, 0.04])
        self.btn_refresh = Button(ax_refresh, 'Refresh', color='#2ecc71', hovercolor='#27ae60')
        self.btn_refresh.on_clicked(self.on_refresh)
        
        # 保存按钮
        ax_save = self.fig.add_axes([0.15, 0.02, 0.08, 0.04])
        self.btn_save = Button(ax_save, 'Save View', color='#9b59b6', hovercolor='#8e44ad')
        self.btn_save.on_clicked(self.on_save)
    
    def on_timestep_change(self, val):
        """时间步改变回调"""
        self.current_timestep = int(val)
        self.current_data = self.get_timestep_data(self.current_timestep)
        self.update_display()
    
    def on_density_range_change(self, val):
        """密度范围改变回调"""
        self.density_min, self.density_max = val
        if self.radio_mode.value_selected == 'Custom Range':
            self.update_3d_view()
    
    def on_mode_change(self, label):
        """模式改变回调"""
        self.update_3d_view()
    
    def on_refresh(self, event):
        """刷新按钮回调"""
        self.update_display()
    
    def on_save(self, event):
        """保存按钮回调"""
        filename = f'nyx_view_timestep{self.current_timestep:04d}.png'
        self.fig.savefig(filename, dpi=150, bbox_inches='tight', facecolor='#f0f0f0')
        print(f"Saved: {filename}")
    
    def update_display(self):
        """更新所有显示"""
        self.update_histogram()
        self.update_stats()
        self.update_evolution()
        self.update_3d_view()
        self.update_slice()
        self.update_range_indicator()
        self.fig.canvas.draw_idle()
    
    def update_histogram(self):
        """更新直方图"""
        self.ax_hist.clear()
        
        data_flat = self.current_data
        
        # 绘制直方图
        n, bins, patches = self.ax_hist.hist(
            data_flat, bins=100, alpha=0.7, color='#3498db',
            edgecolor='black', linewidth=0.5
        )
        
        # 根据模式添加阈值线
        mode = self.radio_mode.value_selected
        if mode == 'Top 1%':
            threshold = np.percentile(data_flat, 99)
            self.ax_hist.axvline(threshold, color='red', linestyle='--', linewidth=2, label=f'Top 1%: {threshold:.2f}')
        elif mode == 'Custom Range':
            dmin, dmax = self.slider_density.val
            self.ax_hist.axvline(dmin, color='green', linestyle='--', linewidth=2)
            self.ax_hist.axvline(dmax, color='green', linestyle='--', linewidth=2)
            self.ax_hist.axvspan(dmin, dmax, alpha=0.2, color='green')
        
        # 添加均值线
        mean_val = data_flat.mean()
        self.ax_hist.axvline(mean_val, color='orange', linestyle=':', linewidth=2, label=f'Mean: {mean_val:.2f}')
        
        self.ax_hist.set_yscale('log')
        self.ax_hist.set_title(f'Density Distribution - Timestep {self.current_timestep}', fontsize=12, fontweight='bold')
        self.ax_hist.set_xlabel('Density')
        self.ax_hist.set_ylabel('Frequency (Log Scale)')
        self.ax_hist.legend(fontsize=8)
        self.ax_hist.grid(True, alpha=0.3)
    
    def update_stats(self):
        """更新统计信息"""
        self.ax_stats.clear()
        self.ax_stats.set_facecolor('#2c3e50')
        self.ax_stats.axis('off')
        
        data_flat = self.current_data
        
        stats_text = f"""
TIMESTEP {self.current_timestep} STATISTICS
{'='*40}
Mean:     {data_flat.mean():.4f}
Std Dev:  {data_flat.std():.4f}
Min:      {data_flat.min():.4f}
Max:      {data_flat.max():.4f}
Range:    {data_flat.max() - data_flat.min():.4f}

PERCENTILES
{'='*40}
1%:   {np.percentile(data_flat, 1):.4f}
5%:   {np.percentile(data_flat, 5):.4f}
50%:  {np.percentile(data_flat, 50):.4f}
95%:  {np.percentile(data_flat, 95):.4f}
99%:  {np.percentile(data_flat, 99):.4f}

TOP 1% REGIONS
{'='*40}
Threshold: {np.percentile(data_flat, 99):.4f}
Cell Count: {np.sum(data_flat >= np.percentile(data_flat, 99)):,}
Percentage: 1.00%
        """
        
        self.ax_stats.text(0.05, 0.95, stats_text, transform=self.ax_stats.transAxes,
                          fontsize=9, verticalalignment='top', fontfamily='monospace',
                          color='white', bbox=dict(boxstyle='round', facecolor='#34495e', alpha=0.8))
    
    def update_evolution(self):
        """更新时间演化图"""
        self.ax_evolution.clear()
        
        # 计算所有时间步的均值
        timesteps = range(100)
        means = []
        stds = []
        
        for ts in timesteps:
            data = self.get_timestep_data(ts)
            means.append(data.mean())
            stds.append(data.std())
        
        # 绘制演化曲线
        self.ax_evolution.plot(timesteps, means, 'b-', linewidth=2, label='Mean')
        self.ax_evolution.fill_between(timesteps, 
                                      np.array(means) - np.array(stds),
                                      np.array(means) + np.array(stds),
                                      alpha=0.3, color='blue')
        
        # 标记当前时间步
        self.ax_evolution.axvline(self.current_timestep, color='red', linestyle='--', linewidth=2)
        self.ax_evolution.scatter([self.current_timestep], [means[self.current_timestep]], 
                                 color='red', s=100, zorder=5)
        
        self.ax_evolution.set_xlabel('Timestep')
        self.ax_evolution.set_ylabel('Mean Density')
        self.ax_evolution.set_title('Mean Density Evolution')
        self.ax_evolution.grid(True, alpha=0.3)
    
    def update_3d_view(self):
        """更新3D视图"""
        self.ax_3d.clear()
        self.ax_3d.set_facecolor('black')
        
        # 重塑数据
        data_vol = self.current_data.reshape((128, 128, 128))
        
        # 根据模式选择阈值
        mode = self.radio_mode.value_selected
        if mode == 'Top 1%':
            threshold = np.percentile(self.current_data, 99)
            mask = data_vol >= threshold
            title_suffix = f"(Top 1%, Threshold: {threshold:.2f})"
        elif mode == 'Custom Range':
            dmin, dmax = self.slider_density.val
            mask = (data_vol >= dmin) & (data_vol <= dmax)
            title_suffix = f"(Range: {dmin:.2f} - {dmax:.2f})"
        else:
            # 采样显示所有数据
            mask = data_vol > np.percentile(self.current_data, 50)
            title_suffix = "(Sampled)"
        
        # 获取坐标
        z_idx, y_idx, x_idx = np.where(mask)
        
        if len(z_idx) > 0:
            # 如果点太多，进行采样
            if len(z_idx) > 50000:
                indices = np.random.choice(len(z_idx), 50000, replace=False)
                z_idx = z_idx[indices]
                y_idx = y_idx[indices]
                x_idx = x_idx[indices]
            
            # 获取颜色值
            values = data_vol[z_idx, y_idx, x_idx]
            
            # 绘制3D散点
            scatter = self.ax_3d.scatter(x_idx, y_idx, z_idx, 
                                        c=values, cmap='plasma', 
                                        s=1, alpha=0.6)
            
            # 添加颜色条
            if hasattr(self, 'cbar'):
                self.cbar.remove()
            self.cbar = self.fig.colorbar(scatter, ax=self.ax_3d, shrink=0.5, aspect=10)
            self.cbar.set_label('Density', color='white')
            self.cbar.ax.yaxis.set_tick_params(color='white')
            plt.setp(plt.getp(self.cbar.ax.axes, 'yticklabels'), color='white')
        
        self.ax_3d.set_xlabel('X', color='white')
        self.ax_3d.set_ylabel('Y', color='white')
        self.ax_3d.set_zlabel('Z', color='white')
        self.ax_3d.tick_params(colors='white')
        self.ax_3d.set_title(f'3D Volume Visualization {title_suffix}', 
                            fontsize=12, fontweight='bold', color='white')
    
    def update_slice(self):
        """更新切片图"""
        self.ax_slice.clear()
        self.ax_slice.set_facecolor('black')
        
        # 显示中间切片
        data_vol = self.current_data.reshape((128, 128, 128))
        mid_slice = data_vol[64, :, :]
        
        im = self.ax_slice.imshow(mid_slice, cmap='viridis', origin='lower')
        self.ax_slice.set_title('Density Slice (Z=64)', fontsize=10, color='white')
        self.ax_slice.set_xlabel('X', color='white')
        self.ax_slice.set_ylabel('Y', color='white')
        self.ax_slice.tick_params(colors='white')
        
        # 添加颜色条
        plt.colorbar(im, ax=self.ax_slice, fraction=0.046, pad=0.04)
    
    def update_range_indicator(self):
        """更新范围指示器"""
        self.ax_range.clear()
        self.ax_range.set_facecolor('white')
        
        data_flat = self.current_data
        
        # 绘制密度分布曲线
        hist, bins = np.histogram(data_flat, bins=100)
        bin_centers = (bins[:-1] + bins[1:]) / 2
        
        self.ax_range.fill_between(bin_centers, hist, alpha=0.5, color='lightblue')
        
        # 标记当前选择范围
        mode = self.radio_mode.value_selected
        if mode == 'Top 1%':
            threshold = np.percentile(data_flat, 99)
            self.ax_range.axvline(threshold, color='red', linestyle='--', linewidth=2)
            self.ax_range.axvspan(threshold, data_flat.max(), alpha=0.3, color='red')
            self.ax_range.set_title(f'Selected: Top 1% (>{threshold:.2f})', fontsize=10)
        elif mode == 'Custom Range':
            dmin, dmax = self.slider_density.val
            self.ax_range.axvspan(dmin, dmax, alpha=0.3, color='green')
            self.ax_range.set_title(f'Selected Range: {dmin:.2f} - {dmax:.2f}', fontsize=10)
        else:
            self.ax_range.set_title('Showing All Data', fontsize=10)
        
        self.ax_range.set_xlabel('Density')
        self.ax_range.set_ylabel('Frequency')


if __name__ == '__main__':
    print("Starting Nyx Interactive Dashboard (Matplotlib version)...")
    print("Controls:")
    print("  - Timestep Slider: Change simulation time")
    print("  - Density Range Slider: Set custom density threshold")
    print("  - Mode Selection: Choose between Top 1%, Custom Range, or All Data")
    print("  - Refresh Button: Update display")
    print("  - Save Button: Save current view")
    print("\nClose the window to exit.")
    
    dashboard = NyxInteractiveDashboard()
