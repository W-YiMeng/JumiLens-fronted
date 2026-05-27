import { makeAutoObservable, runInAction } from 'mobx';

export interface TFControlPoint {
  position: number;
  color: [number, number, number];
  opacity: number;
}

class VolumeStore {
  currentStep = 0;
  isPlaying = false;
  playSpeed = 2;
  isLoading = false;
  stepSize = 1 / 64;
  densityScale = 1.0;

  transferFunction: TFControlPoint[] = [
    { position: 0.0, color: [0.1, 0.0, 0.2], opacity: 0.0 },
    { position: 0.15, color: [0.0, 0.1, 0.5], opacity: 0.02 },
    { position: 0.3, color: [0.0, 0.4, 0.8], opacity: 0.08 },
    { position: 0.45, color: [0.2, 0.6, 0.6], opacity: 0.15 },
    { position: 0.6, color: [0.8, 0.7, 0.2], opacity: 0.35 },
    { position: 0.75, color: [1.0, 0.5, 0.1], opacity: 0.55 },
    { position: 0.9, color: [1.0, 0.2, 0.1], opacity: 0.75 },
    { position: 1.0, color: [1.0, 1.0, 1.0], opacity: 0.95 },
  ];

  private _dataCache = new Map<number, Float32Array>();
  private _dataMin = new Map<number, number>();
  private _dataMax = new Map<number, number>();
  private _playTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  setTimeStep = (step: number) => {
    this.currentStep = Math.max(0, Math.min(99, Math.round(step)));
  };

  advanceStep = (delta: number) => {
    let next = this.currentStep + delta;
    if (next > 99) next = 0;
    if (next < 0) next = 99;
    this.currentStep = next;
  };

  togglePlay = () => {
    this.isPlaying = !this.isPlaying;
    if (this.isPlaying) {
      const interval = 1000 / this.playSpeed;
      this._playTimer = setInterval(() => {
        runInAction(() => this.advanceStep(1));
      }, interval);
    } else {
      if (this._playTimer) {
        clearInterval(this._playTimer);
        this._playTimer = null;
      }
    }
  };

  setPlaySpeed = (speed: number) => {
    this.playSpeed = speed;
    if (this.isPlaying) {
      if (this._playTimer) clearInterval(this._playTimer);
      const interval = 1000 / speed;
      this._playTimer = setInterval(() => {
        runInAction(() => this.advanceStep(1));
      }, interval);
    }
  };

  setStepSize = (size: number) => {
    this.stepSize = size;
  };

  setDensityScale = (scale: number) => {
    this.densityScale = scale;
  };

  setTransferFunction = (points: TFControlPoint[]) => {
    this.transferFunction = [...points].sort((a, b) => a.position - b.position);
  };

  getCachedData = (step: number): Float32Array | undefined => {
    return this._dataCache.get(step);
  };

  getDataRange = (step: number): { min: number; max: number } | undefined => {
    const min = this._dataMin.get(step);
    const max = this._dataMax.get(step);
    if (min === undefined || max === undefined) return undefined;
    return { min, max };
  };

  cacheData = (step: number, data: Float32Array, min: number, max: number) => {
    this._dataCache.set(step, data);
    this._dataMin.set(step, min);
    this._dataMax.set(step, max);

    const MAX_CACHE = 20;
    if (this._dataCache.size > MAX_CACHE) {
      const current = this.currentStep;
      let farthest = -1;
      let farthestDist = -1;
      for (const key of this._dataCache.keys()) {
        const dist = Math.abs(key - current);
        if (dist > farthestDist) {
          farthestDist = dist;
          farthest = key;
        }
      }
      if (farthest >= 0) {
        this._dataCache.delete(farthest);
        this._dataMin.delete(farthest);
        this._dataMax.delete(farthest);
      }
    }
  };
}

export const volumeStore = new VolumeStore();
