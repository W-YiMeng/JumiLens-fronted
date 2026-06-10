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
  numBins: number = 80,
  valMin?: number,
  valMax?: number
): HistogramData {
  // Scan directly on Float32Array — no Array.from() copy
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }

  // Data is already log10(density), bin directly
  const histMin = valMin ?? minVal;
  const histMax = valMax ?? maxVal;

  const range = histMax - histMin;
  if (range <= 0) return { bins: [], binEdges: [], logBins: [], logBinEdges: [] };

  const binWidth = range / numBins;

  // Init bins as Int32Array
  const bins = new Int32Array(numBins);

  for (let i = 0; i < data.length; i++) {
    let bi = Math.floor((data[i] - histMin) / binWidth);
    // Clamp out-of-range values to first/last bin
    if (bi < 0) bi = 0;
    if (bi >= numBins) bi = numBins - 1;
    bins[bi]++;
  }

  // Convert to regular arrays for return
  const binsArr = new Array(numBins);
  const logBinsArr = new Array(numBins);
  for (let i = 0; i < numBins; i++) {
    binsArr[i] = bins[i];
    logBinsArr[i] = bins[i];
  }

  const binEdges: number[] = [];
  const logBinEdges: number[] = [];
  for (let i = 0; i <= numBins; i++) {
    const edge = histMin + i * binWidth;
    logBinEdges.push(edge);
    binEdges.push(edge);  // data IS log10, so both are the same
  }

  return { bins: binsArr, binEdges, logBins: logBinsArr, logBinEdges };
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

  // Histogram-based percentile approximation (no full sort)
  const NUM_HIST = 200;
  const histMin = min;
  const histMax = max;
  const histRange = histMax - histMin || 1;
  const hist = new Int32Array(NUM_HIST);

  for (let i = 0; i < data.length; i++) {
    let bi = Math.floor(((data[i] - histMin) / histRange) * NUM_HIST);
    if (bi < 0) bi = 0;
    if (bi >= NUM_HIST) bi = NUM_HIST - 1;
    hist[bi]++;
  }

  const percentileAt = (p: number): number => {
    const target = Math.floor(n * p);
    let cum = 0;
    for (let i = 0; i < NUM_HIST; i++) {
      cum += hist[i];
      if (cum >= target) {
        return histMin + (i + 0.5) * (histRange / NUM_HIST);
      }
    }
    return histMax;
  };

  return {
    min,
    max,
    mean,
    std,
    median: percentileAt(0.5),
    p1: percentileAt(0.01),
    p5: percentileAt(0.05),
    p95: percentileAt(0.95),
    p99: percentileAt(0.99),
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
