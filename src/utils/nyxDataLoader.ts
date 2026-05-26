/**
 * Nyx宇宙学模拟数据加载器
 * 数据格式：小端字节序(little-endian) float32，列优先顺序存储 (z -> y -> x)
 */

export interface NyxDataInfo {
  data: Float32Array;
  dimensions: { x: number; y: number; z: number };
  min: number;
  max: number;
  mean: number;
  timestep: number;
}

export interface HistogramData {
  bins: number[];
  binEdges: number[];
  logBins: number[];
  logBinEdges: number[];
}

/**
 * 加载Nyx数据文件
 * @param url 数据文件URL
 * @param timestep 时间步
 * @param dimensions 数据维度 (默认 64x64x64)
 */
export async function loadNyxData(
  url: string,
  timestep: number,
  dimensions: { x: number; y: number; z: number } = { x: 64, y: 64, z: 64 }
): Promise<NyxDataInfo> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const data = new Float32Array(arrayBuffer);

  // 验证数据大小
  const expectedSize = dimensions.x * dimensions.y * dimensions.z;
  if (data.length !== expectedSize) {
    console.warn(`Data size mismatch: expected ${expectedSize}, got ${data.length}`);
  }

  // 计算统计信息
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  }

  const mean = sum / data.length;

  return {
    data,
    dimensions,
    min,
    max,
    mean,
    timestep,
  };
}

/**
 * 计算密度对数直方图
 * @param data 密度数据
 * @param numBins 分箱数量
 * @param logMin 对数最小值（可选，自动计算）
 * @param logMax 对数最大值（可选，自动计算）
 */
export function calculateLogHistogram(
  data: Float32Array,
  numBins: number = 100,
  logMin?: number,
  logMax?: number
): HistogramData {
  // 过滤正数（对数需要正数）
  const positiveData = Array.from(data).filter(v => v > 0);

  if (positiveData.length === 0) {
    return { bins: [], binEdges: [], logBins: [], logBinEdges: [] };
  }

  // 计算对数范围
  const actualLogMin = logMin ?? Math.log10(Math.min(...positiveData));
  const actualLogMax = logMax ?? Math.log10(Math.max(...positiveData));

  const logRange = actualLogMax - actualLogMin;
  const binWidth = logRange / numBins;

  // 初始化分箱
  const bins = new Array(numBins).fill(0);
  const binEdges: number[] = [];
  const logBins = new Array(numBins).fill(0);
  const logBinEdges: number[] = [];

  // 计算分箱边界
  for (let i = 0; i <= numBins; i++) {
    const logEdge = actualLogMin + i * binWidth;
    logBinEdges.push(logEdge);
    binEdges.push(Math.pow(10, logEdge));
  }

  // 填充分箱
  for (const value of positiveData) {
    const logValue = Math.log10(value);
    let binIndex = Math.floor((logValue - actualLogMin) / binWidth);

    // 处理边界情况
    if (binIndex < 0) binIndex = 0;
    if (binIndex >= numBins) binIndex = numBins - 1;

    bins[binIndex]++;
    logBins[binIndex]++;
  }

  return { bins, binEdges, logBins, logBinEdges };
}

/**
 * 计算密度统计特征
 * @param data 密度数据
 */
export function calculateStatistics(data: Float32Array) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sumSq = 0;

  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
    sumSq += value * value;
  }

  const n = data.length;
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  const std = Math.sqrt(variance);

  // 计算百分位数
  const sorted = Array.from(data).sort((a, b) => a - b);
  const median = sorted[Math.floor(n * 0.5)];
  const p1 = sorted[Math.floor(n * 0.01)];
  const p5 = sorted[Math.floor(n * 0.05)];
  const p95 = sorted[Math.floor(n * 0.95)];
  const p99 = sorted[Math.floor(n * 0.99)];

  return {
    min,
    max,
    mean,
    std,
    median,
    p1,
    p5,
    p95,
    p99,
  };
}

/**
 * 获取密度区间内的体素索引
 * @param data 密度数据
 * @param minDensity 最小密度
 * @param maxDensity 最大密度
 * @param dimensions 数据维度
 */
export function getVoxelsInRange(
  data: Float32Array,
  minDensity: number,
  maxDensity: number,
  dimensions: { x: number; y: number; z: number }
): { x: number; y: number; z: number; value: number }[] {
  const voxels: { x: number; y: number; z: number; value: number }[] = [];

  for (let z = 0; z < dimensions.z; z++) {
    for (let y = 0; y < dimensions.y; y++) {
      for (let x = 0; x < dimensions.x; x++) {
        const index = z * dimensions.y * dimensions.x + y * dimensions.x + x;
        const value = data[index];

        if (value >= minDensity && value <= maxDensity) {
          voxels.push({ x, y, z, value });
        }
      }
    }
  }

  return voxels;
}

/**
 * 将数据归一化到0-1范围
 * @param data 原始数据
 * @param min 最小值
 * @param max 最大值
 */
export function normalizeData(data: Float32Array, min: number, max: number): Float32Array {
  const range = max - min;
  if (range === 0) return new Float32Array(data.length).fill(0);

  const normalized = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    normalized[i] = (data[i] - min) / range;
  }

  return normalized;
}

/**
 * 生成所有时间步的数据URL列表
 * @param basePath 基础路径
 * @param count 时间步数量
 */
export function generateDataUrls(basePath: string, count: number = 100): string[] {
  const urls: string[] = [];
  for (let i = 0; i < count; i++) {
    const filename = i.toString().padStart(4, '0') + '.dat';
    urls.push(`${basePath}/${filename}`);
  }
  return urls;
}
