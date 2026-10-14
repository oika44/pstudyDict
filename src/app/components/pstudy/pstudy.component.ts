import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, concatMap, EMPTY, finalize, from, Subscription, tap } from 'rxjs';
import { WordLookupService, WordNotFoundError } from '../../services/word-lookup.service';
import {
  AudioPaths,
  CsvEncoding,
  PStudyBuilderService,
} from '../../services/pstudy-builder.service';
import { DesktopFileService } from '../../services/desktop-file.service';

const SAVE_PATH_KEY = 'pstudy.savePath';

interface FailedWord {
  word: string;
  reason: string;
  /** 手入力する訳 */
  meaning: string;
}

@Component({
  selector: 'app-pstudy',
  imports: [FormsModule],
  templateUrl: './pstudy.component.html',
  styleUrls: ['./pstudy.component.css'],
})
export class PstudyComponent {
  private readonly wordLookup = inject(WordLookupService);
  readonly builder = inject(PStudyBuilderService);
  readonly desktop = inject(DesktopFileService);

  inputWords = '';
  fileName = 'pstudy_words';
  /** デスクトップ版での保存先 (絶対パス) */
  readonly savePath = signal('');
  readonly saveMessage = signal<{ error: boolean; text: string } | null>(null);
  readonly saving = signal(false);
  /** デスクトップ版: CSV と一緒に単語の発音 (MP3) を保存し、wavfile 列にパスを書く */
  withAudio = true;
  encoding: CsvEncoding = 'SJIS';
  /** 発音記号 (IPA) は Shift_JIS にない文字を含むので、その場合に注意を出す */
  readonly hasPronunciation = computed(() => this.builder.entries().some((e) => e.pronunciation));
  readonly progress = signal<{ done: number; total: number } | null>(null);
  readonly failed = signal<FailedWord[]>([]);
  readonly skipped = signal<string[]>([]);
  private running?: Subscription;

  constructor() {
    if (this.desktop.available) this.initSavePath();
  }

  /** 前回の保存先を復元し、なければ「ドキュメント/pstudy_words.csv」にする */
  private async initSavePath(): Promise<void> {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(SAVE_PATH_KEY);
    } catch {
      // 保存領域が使えない環境では毎回既定のパスにする
    }
    this.savePath.set(saved || (await this.desktop.defaultSavePath()));
  }

  lookup(): void {
    const words = this.parseInput(this.inputWords);
    if (words.length === 0) return;

    const duplicates = words.filter((w) => this.builder.has(w));
    const targets = words.filter((w) => !this.builder.has(w));
    this.skipped.set(duplicates);
    this.failed.set([]);
    if (targets.length === 0) return;

    this.progress.set({ done: 0, total: targets.length });
    // Weblio に負荷をかけないよう 1 語ずつ順番に問い合わせる
    this.running = from(targets)
      .pipe(concatMap((w) => this.lookupOne(w)))
      .subscribe({
        complete: () => {
          this.progress.set(null);
          this.inputWords = this.failed().map((f) => f.word).join('\n');
        },
      });
  }

  cancel(): void {
    this.running?.unsubscribe();
    this.progress.set(null);
  }

  private lookupOne(word: string) {
    return this.wordLookup.lookup(word).pipe(
      tap((res) =>
        this.builder.addEntry(res.word, res.meaning, {
          example: res.example,
          pronunciation: res.pronunciation,
          audioUrl: res.audioUrl,
        }),
      ),
      catchError((err) => {
        const reason = err instanceof WordNotFoundError ? '辞書に見つかりません' : '通信エラー';
        this.failed.update((list) => [...list, { word, reason, meaning: '' }]);
        return EMPTY;
      }),
      finalize(() => this.step()),
    );
  }

  private step(): void {
    this.progress.update((p) => (p ? { ...p, done: p.done + 1 } : p));
  }

  /** 改行・カンマ・タブ区切りで単語を分割し、重複を除く (熟語のスペースは保持) */
  private parseInput(text: string): string[] {
    const seen = new Set<string>();
    return text
      .split(/[\r\n,\t]+/)
      .map((w) => w.trim().replace(/\s+/g, ' '))
      .filter((w) => {
        const key = w.toLowerCase();
        if (!w || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  addManual(f: FailedWord): void {
    if (this.builder.addEntry(f.word, f.meaning)) {
      this.dismissFailed(f);
    }
  }

  /** 失敗リストと入力欄の両方からその単語を取り除く */
  dismissFailed(f: FailedWord): void {
    this.failed.update((list) => list.filter((x) => x !== f));
    this.inputWords = this.parseInput(this.inputWords)
      .filter((w) => w.toLowerCase() !== f.word.toLowerCase())
      .join('\n');
  }

  clearAll(): void {
    if (confirm('一覧をすべて削除しますか？')) this.builder.clear();
  }

  async chooseSavePath(): Promise<void> {
    const path = await this.desktop.chooseSavePath(this.savePath());
    if (path) this.savePath.set(path);
  }

  /** デスクトップ版: 指定の絶対パスに保存する (既存ファイルは確認してから上書き) */
  async saveCsv(): Promise<void> {
    this.saving.set(true);
    try {
      await this.saveCsvWithAudio();
    } finally {
      this.saving.set(false);
    }
  }

  private async saveCsvWithAudio(): Promise<void> {
    let audioPaths: AudioPaths = {};
    let audioNote = '';
    if (this.withAudio) {
      const items = this.builder
        .entries()
        .filter((e) => e.audioUrl)
        .map((e) => ({ word: e.word, url: e.audioUrl }));
      if (items.length > 0) {
        this.saveMessage.set({ error: false, text: `音声を保存中… (${items.length} 件)` });
        const audio = await this.desktop.saveAudio(this.savePath(), items);
        if (!audio.ok) {
          this.saveMessage.set({ error: true, text: audio.message });
          return;
        }
        audioPaths = audio.paths;
      }
      const missing = this.builder.entries().filter((e) => !audioPaths[e.word]).length;
      if (missing > 0) audioNote = `（音声なし: ${missing} 語）`;
    }

    const blob = this.builder.exportCsv(this.encoding, {
      title: csvTitle(this.savePath()),
      audioPaths,
    });
    let result = await this.desktop.save(this.savePath(), blob);
    if (!result.ok && result.reason === 'exists') {
      if (!confirm(`${result.message} は既にあります。上書きしますか？`)) return;
      result = await this.desktop.save(this.savePath(), blob, true);
    }

    if (result.ok) {
      this.savePath.set(result.path);
      this.saveMessage.set({ error: false, text: `保存しました: ${result.path}${audioNote}` });
      try {
        localStorage.setItem(SAVE_PATH_KEY, result.path);
      } catch {
        // 次回の初期値に使うだけなので失敗しても構わない
      }
    } else {
      this.saveMessage.set({ error: true, text: result.message });
    }
  }

  downloadCsv(): void {
    const blob = this.builder.exportCsv(this.encoding, { title: this.fileName });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.fileName.trim() || 'pstudy_words'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

/** 問題集の名称にする CSV のファイル名: C:\words\list.csv → list */
function csvTitle(path: string): string {
  return (path.split(/[\\/]/).pop() ?? '').replace(/\.csv$/i, '');
}
