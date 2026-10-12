import { Injectable, computed, signal } from '@angular/core';
import Encoding from 'encoding-japanese';

export type CsvEncoding = 'SJIS' | 'UTF8';

export interface PStudyEntry {
  word: string;
  meaning: string;
}

/**
 * P-Study System にインポートする問題リストを保持し、CSV (Shift_JIS / UTF-8) を作る。
 * 1 行 = 「問題,解答」 (問題 = 英単語, 解答 = 日本語訳)。
 */
@Injectable({
  providedIn: 'root',
})
export class PStudyBuilderService {
  private readonly _entries = signal<PStudyEntry[]>([]);
  readonly entries = this._entries.asReadonly();
  readonly count = computed(() => this._entries().length);

  /** 追加できたら true。空欄や登録済みの単語なら false */
  addEntry(word: string, meaning: string): boolean {
    const w = word.trim();
    const m = meaning.trim();
    if (!w || !m || this.has(w)) return false;
    this._entries.update((list) => [...list, { word: w, meaning: m }]);
    return true;
  }

  has(word: string): boolean {
    const key = word.trim().toLowerCase();
    return this._entries().some((e) => e.word.toLowerCase() === key);
  }

  updateMeaning(index: number, meaning: string): void {
    this._entries.update((list) => list.map((e, i) => (i === index ? { ...e, meaning } : e)));
  }

  removeEntry(index: number): void {
    this._entries.update((list) => list.filter((_, i) => i !== index));
  }

  clear(): void {
    this._entries.set([]);
  }

  toCsv(): string {
    return this._entries()
      .map((e) => `${csvField(e.word)},${csvField(e.meaning)}`)
      .join('\r\n');
  }

  /** 指定の文字コードでエンコードした CSV (既定は Shift_JIS) */
  exportCsv(encoding: CsvEncoding = 'SJIS'): Blob {
    const csv = this.toCsv();
    if (encoding === 'UTF8') {
      return new Blob([csv], { type: 'text/csv;charset=utf-8' });
    }
    const sjis = Encoding.convert(Encoding.stringToCode(csv), {
      to: 'SJIS',
      from: 'UNICODE',
    });
    return new Blob([new Uint8Array(sjis)], { type: 'text/csv;charset=shift_jis' });
  }
}

function csvField(value: string): string {
  // 改行は P-Study の 1 問 1 行を崩すので空白に置き換える
  const v = value.replace(/\r?\n/g, ' ');
  return `"${v.replace(/"/g, '""')}"`;
}
