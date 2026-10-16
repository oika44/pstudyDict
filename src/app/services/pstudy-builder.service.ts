import { Injectable, computed, signal } from '@angular/core';
import Encoding from 'encoding-japanese';

export type CsvEncoding = 'SJIS' | 'UTF8';

export interface PStudyEntry {
  word: string;
  meaning: string;
  example: string;
  pronunciation: string;
  /** 単語の発音の MP3 の URL (Weblio)。手入力した単語では空文字 */
  audioUrl: string;
}

export type PStudyEntryExtra = Partial<Pick<PStudyEntry, 'example' | 'pronunciation' | 'audioUrl'>>;

/** 単語 → 保存した音声ファイルの絶対パス */
export type AudioPaths = Record<string, string>;

export interface CsvOptions {
  /** 問題集の名称 (インポート後の問題集名になる) */
  title?: string;
  /** 単語の音声ファイルがあれば wavfile 列にそのパスを出す */
  audioPaths?: AudioPaths;
}

const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

/**
 * P-Study 用 CSV の列配置 (4 行目)。PssEditor が書き出す CSV と同じ並び。
 * a1 = 解答 (英単語), q1 = 問題文 (日本語訳), d1 = 解説 (例文), d2 = 解説 (発音記号), wavfile = 音声ファイル (絶対パス)
 */
const COLUMNS = [
  ...range('a', 5),
  ...range('q', 10),
  ...range('h', 10),
  ...range('d', 10),
  'wavfile',
  'qvoicefile',
  'imagefile',
  'url',
];

/**
 * P-Study System にインポートする問題リストを保持し、CSV (Shift_JIS / UTF-8) を作る。
 * 形式は PSS インポート可能 CSV (1 行目 = 識別子, 2 行目 = 問題集名, 3 行目 = 空行, 4 行目 = 列配置, 5 行目以降 = 1 行 1 問)。
 */
@Injectable({
  providedIn: 'root',
})
export class PStudyBuilderService {
  private readonly _entries = signal<PStudyEntry[]>([]);
  readonly entries = this._entries.asReadonly();
  readonly count = computed(() => this._entries().length);

  /** 追加できたら true。空欄や登録済みの単語なら false */
  addEntry(word: string, meaning: string, extra: PStudyEntryExtra = {}): boolean {
    const w = word.trim();
    const m = meaning.trim();
    if (!w || !m || this.has(w)) return false;
    const entry: PStudyEntry = {
      word: w,
      meaning: m,
      example: extra.example?.trim() ?? '',
      pronunciation: extra.pronunciation?.trim() ?? '',
      audioUrl: extra.audioUrl ?? '',
    };
    this._entries.update((list) => [...list, entry]);
    return true;
  }

  has(word: string): boolean {
    const key = word.trim().toLowerCase();
    return this._entries().some((e) => e.word.toLowerCase() === key);
  }

  updateEntry(index: number, patch: Partial<Omit<PStudyEntry, 'word'>>): void {
    this._entries.update((list) => list.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }

  removeEntry(index: number): void {
    this._entries.update((list) => list.filter((_, i) => i !== index));
  }

  clear(): void {
    this._entries.set([]);
  }

  toCsv({ title, audioPaths = {} }: CsvOptions = {}): string {
    const header = [
      'psscsvfile,100',
      `${titleField(title?.trim() || DEFAULT_TITLE)},,`,
      '',
      COLUMNS.join(','),
    ];
    const rows = this._entries().map((e) => {
      const values: Record<string, string> = {
        a1: e.word,
        q1: e.meaning,
        d1: e.example,
        d2: e.pronunciation,
        wavfile: audioPaths[e.word] ?? '',
      };
      return COLUMNS.map((c) => csvField(values[c] ?? '')).join(',');
    });
    return [...header, ...rows].join('\r\n');
  }

  /** 指定の文字コードでエンコードした CSV (既定は Shift_JIS) */
  exportCsv(encoding: CsvEncoding = 'SJIS', options: CsvOptions = {}): Blob {
    const csv = this.toCsv(options);
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

const DEFAULT_TITLE = 'pstudy_words';

function csvField(value: string): string {
  // 空欄は引用符を付けない (PSS は "" を文字として取り込む)
  if (!value) return '';
  // 改行は P-Study の 1 問 1 行を崩すので空白に置き換える
  const v = value.replace(/\r?\n/g, ' ');
  return `"${v.replace(/"/g, '""')}"`;
}

/** 2 行目の問題集名は引用符なしで書くので、区切りになる文字を除く */
function titleField(value: string): string {
  return value.replace(/[\r\n,"]+/g, ' ').trim();
}
