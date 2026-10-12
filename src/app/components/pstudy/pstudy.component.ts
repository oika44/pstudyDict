import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, concatMap, EMPTY, finalize, from, Subscription, tap } from 'rxjs';
import { WordLookupService, WordNotFoundError } from '../../services/word-lookup.service';
import { CsvEncoding, PStudyBuilderService } from '../../services/pstudy-builder.service';

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

  inputWords = '';
  fileName = 'pstudy_words';
  encoding: CsvEncoding = 'SJIS';
  readonly progress = signal<{ done: number; total: number } | null>(null);
  readonly failed = signal<FailedWord[]>([]);
  readonly skipped = signal<string[]>([]);
  private running?: Subscription;

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
      tap((res) => this.builder.addEntry(res.word, res.meaning)),
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

  downloadCsv(): void {
    const blob = this.builder.exportCsv(this.encoding);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.fileName.trim() || 'pstudy_words'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
