import { p, request } from './client'
import type { SplitSummary, YoloSplitSummary } from './types'

// ---- Split dataset train/val/test — resep ResNet (format ImageFolder) &
// resep YOLO (format ultralytics), per-project ----

export const splitApi = {
  createSplit: (
    projectId: string,
    trainRatio: number,
    valRatio: number,
    testRatio: number,
    seed = 42,
  ) =>
    request<SplitSummary>(`${p(projectId)}/split`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        train_ratio: trainRatio,
        val_ratio: valRatio,
        test_ratio: testRatio,
        seed,
      }),
    }),

  getSplit: (projectId: string) => request<SplitSummary>(`${p(projectId)}/split`),

  // URL unduhan .zip (bukan lewat request() — ini file binary, bukan JSON;
  // browser cukup diarahkan langsung ke URL ini, Content-Disposition di
  // backend yang memicu download-nya)
  splitExportUrl: (projectId: string) => `${p(projectId)}/split/export`,

  createYoloSplit: (
    projectId: string,
    trainRatio: number,
    valRatio: number,
    testRatio: number,
    classNames: string[],
    seed = 42,
  ) =>
    request<YoloSplitSummary>(`${p(projectId)}/yolo-split`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        train_ratio: trainRatio,
        val_ratio: valRatio,
        test_ratio: testRatio,
        seed,
        class_names: classNames,
      }),
    }),

  getYoloSplit: (projectId: string) => request<YoloSplitSummary>(`${p(projectId)}/yolo-split`),
}
