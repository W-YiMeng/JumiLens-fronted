import { makeAutoObservable, runInAction } from 'mobx';

export interface TFControlPoint {
  position: number;
  color: [number, number, number];
  opacity: number;
}

export interface ThumbnailStats {
  low: number;
  high: number;
  bins: number[];
}

export type ThumbnailView = 'current' | 'top' | 'front' | 'side';
export type ThumbnailCompareMode = 'off' | 'prev' | 'ref';

class VolumeStore {
  currentStep = 0;
  isPlaying = false;
  playSpeed = 2;
  isLoading = false;
  stepSize = 1 / 64;
  densityScale = 1.0;
  lightAzimuth = 45; // degrees
  lightElevation = 30; // degrees
  lightIntensity = 1.0;

  thumbnailStats = new Map<number, ThumbnailStats>();
  thumbnailImages = new Map<string, string>();
  thumbnailSteps = [0, 20, 40, 60, 80, 99];
  thumbnailLowRange: [number, number] = [0.05, 0.25];
  thumbnailHighRange: [number, number] = [0.6, 0.9];
  thumbnailView: ThumbnailView = 'current';
  thumbnailCompareMode: ThumbnailCompareMode = 'off';
  thumbnailCompareRefIndex = 1;
  thumbnailCompareOverlay = true;
  thumbnailRefreshToken = 0;

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

  setLightAzimuth = (deg: number) => {
    this.lightAzimuth = deg;
  };

  setLightElevation = (deg: number) => {
    this.lightElevation = deg;
  };

  setLightIntensity = (v: number) => {
    this.lightIntensity = v;
  };

  setTransferFunction = (points: TFControlPoint[]) => {
    this.transferFunction = [...points].sort((a, b) => a.position - b.position);
  };

  setThumbnailStats = (step: number, stats: ThumbnailStats) => {
    this.thumbnailStats.set(step, stats);
  };

  getThumbnailStats = (step: number): ThumbnailStats | undefined => {
    return this.thumbnailStats.get(step);
  };

  private buildThumbnailKey = (step: number, type: 'low' | 'high') => {
    const range = type === 'low' ? this.thumbnailLowRange : this.thumbnailHighRange;
    const compareFlag = `${this.thumbnailCompareMode}-r${this.thumbnailCompareRefIndex}-${this.thumbnailCompareOverlay ? 'o1' : 'o0'}`;
    return `${step}-${type}-${this.thumbnailView}-${range[0].toFixed(2)}-${range[1].toFixed(2)}-${compareFlag}`;
  };

  setThumbnailImage = (step: number, type: 'low' | 'high', dataUrl: string) => {
    const key = this.buildThumbnailKey(step, type);
    this.thumbnailImages.set(key, dataUrl);
  };

  getThumbnailImage = (step: number, type: 'low' | 'high'): string | undefined => {
    const key = this.buildThumbnailKey(step, type);
    return this.thumbnailImages.get(key);
  };

  setThumbnailLowRange = (min: number, max: number) => {
    this.thumbnailLowRange = [Math.min(min, max), Math.max(min, max)];
  };

  setThumbnailHighRange = (min: number, max: number) => {
    this.thumbnailHighRange = [Math.min(min, max), Math.max(min, max)];
  };

  setThumbnailView = (view: ThumbnailView) => {
    this.thumbnailView = view;
  };

  setThumbnailCompareMode = (mode: ThumbnailCompareMode) => {
    this.thumbnailCompareMode = mode;
  };

  setThumbnailCompareRefIndex = (idx: number) => {
    this.thumbnailCompareRefIndex = Math.max(0, Math.min(this.thumbnailSteps.length - 1, idx));
  };

  toggleThumbnailCompareOverlay = () => {
    this.thumbnailCompareOverlay = !this.thumbnailCompareOverlay;
  };

  refreshThumbnails = () => {
    this.thumbnailRefreshToken += 1;
    if (this.thumbnailView === 'current') {
      const keys = Array.from(this.thumbnailImages.keys());
      for (const key of keys) {
        if (key.includes('-current-')) {
          this.thumbnailImages.delete(key);
        }
      }
    }
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
