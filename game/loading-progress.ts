import { t } from './i18n.ts';
export interface LoadingProgress {
  percent: number;
  stage: 'connecting' | 'downloading' | 'preparing' | 'ready';
  remainingSeconds: number | null;
  stalled: boolean;
}

export const INITIAL_LOADING: LoadingProgress = {percent: 0, stage: 'connecting', remainingSeconds: null, stalled: false};
export const READY_LOADING: LoadingProgress = {percent: 100, stage: 'ready', remainingSeconds: 0, stalled: false};

/** Byte weights come from the shipped asset manifests, including cached files. */
export class LoadingTracker {
  private files: Map<string, {bytes: number; received: number; parsed: boolean}>;
  private samples: {time: number; bytes: number}[];
  private lastTransfer: number;
  private clock: () => number;

  constructor(files: {id: string; bytes: number}[], clock = () => performance.now()) {
    this.files = new Map(files.map(file => [file.id, {...file, received: 0, parsed: false}]));
    this.clock = clock;
    this.lastTransfer = clock();
    this.samples = [{time: this.lastTransfer, bytes: 0}];
  }

  update(id: string, received: number, parsed = false) {
    const file = this.files.get(id);
    if (!file) return;
    const next = parsed ? file.bytes : Math.max(file.received, Math.min(file.bytes, Math.max(0, received)));
    if (next > file.received) this.lastTransfer = this.clock();
    file.received = next;
    file.parsed ||= parsed;
  }

  snapshot(): LoadingProgress {
    const now = this.clock();
    const files = [...this.files.values()];
    const total = files.reduce((sum, file) => sum + file.bytes, 0);
    const received = files.reduce((sum, file) => sum + file.received, 0);
    const parsed = files.filter(file => file.parsed).length;
    this.samples.push({time: now, bytes: received});
    // Keep a recent window so estimates respond to a changing connection.
    while (this.samples.length > 2 && this.samples[1].time < now - 8000) this.samples.shift();
    const first = this.samples[0];
    const elapsed = (now - first.time) / 1000;
    const speed = elapsed > 0 ? (received - first.bytes) / elapsed : 0;
    const stage = total > 0 && received >= total ? 'preparing' : received > 0 ? 'downloading' : 'connecting';
    const stalled = stage !== 'preparing' && now - this.lastTransfer >= 8000;
    const remainingSeconds = stage === 'downloading' && !stalled && elapsed >= 1 && speed > 0
      ? Math.ceil((total - received) / speed) : null;
    // Reserve completion for parsed models and the constructed scene, never a timer.
    const percent = total > 0 ? Math.min(99, Math.floor(95 * received / total + 4 * parsed / files.length)) : 0;
    return {percent, stage, remainingSeconds, stalled};
  }
}

export function loadingHint(progress: LoadingProgress): string {
  if (progress.stage === 'ready') return t("赛道就绪");
  if (progress.stage === 'preparing') return t("资源已到齐，正在布置赛道…");
  if (progress.stalled) return t("网络暂时较慢，正在等待资源…");
  if (progress.remainingSeconds === null) return progress.stage === 'connecting' ? t("正在连接赛道…") : t("正在估算剩余时间…");
  const seconds = Math.max(5, Math.ceil(progress.remainingSeconds / 5) * 5);
  return seconds < 60 ? t("预计还需约 {0} 秒", [seconds]) : t("预计还需约 {0} 分{1}", [Math.floor(seconds / 60), seconds % 60 ? t(" {0} 秒", [seconds % 60]) : t("钟")]);
}
