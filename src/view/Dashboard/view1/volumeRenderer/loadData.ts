export interface LoadedData {
  normalized: Float32Array;
  min: number;
  max: number;
}

export async function loadTimeStep(step: number): Promise<LoadedData> {
  const filename = `${step.toString().padStart(4, '0')}.dat`;
  const response = await fetch(`/assets/Nyx/${filename}`);

  if (!response.ok) {
    throw new Error(`Failed to load ${filename}: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const raw = new Float32Array(buffer);

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] < min) min = raw[i];
    if (raw[i] > max) max = raw[i];
  }

  const N = 128;
  const N2 = N * N;
  const normalized = new Float32Array(raw.length);
  const range = max - min;

  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        const colMajorIdx = z + N * y + N2 * x;
        const rowMajorIdx = x + N * y + N2 * z;
        normalized[rowMajorIdx] = (raw[colMajorIdx] - min) / range;
      }
    }
  }

  return { normalized, min, max };
}
