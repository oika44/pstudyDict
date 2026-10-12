import { Injectable } from '@angular/core';

export type SaveResult =
  | { ok: true; path: string }
  | { ok: false; reason: 'invalid' | 'exists' | 'error'; message: string };

/** electron/preload.cjs が公開する API */
interface PstudyDesktopApi {
  defaultSavePath(): Promise<string>;
  chooseSavePath(current: string): Promise<string | null>;
  saveFile(path: string, data: Uint8Array, overwrite: boolean): Promise<SaveResult>;
}

declare global {
  interface Window {
    pstudyDesktop?: PstudyDesktopApi;
  }
}

/**
 * デスクトップ版 (Electron) でのファイル保存。
 * ブラウザで動いているときは available が false になり、各メソッドは使えない。
 */
@Injectable({
  providedIn: 'root',
})
export class DesktopFileService {
  private readonly api = window.pstudyDesktop;

  get available(): boolean {
    return !!this.api;
  }

  defaultSavePath(): Promise<string> {
    return this.required().defaultSavePath();
  }

  /** 保存ダイアログを開く。キャンセル時は null */
  chooseSavePath(current: string): Promise<string | null> {
    return this.required().chooseSavePath(current);
  }

  /** 絶対パスに保存する。overwrite が false で既にファイルがあれば reason: 'exists' */
  async save(path: string, blob: Blob, overwrite = false): Promise<SaveResult> {
    const data = new Uint8Array(await blob.arrayBuffer());
    return this.required().saveFile(path, data, overwrite);
  }

  private required(): PstudyDesktopApi {
    if (!this.api) throw new Error('デスクトップ版でのみ使用できます');
    return this.api;
  }
}
