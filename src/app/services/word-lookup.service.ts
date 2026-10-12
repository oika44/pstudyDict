import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';

export interface DictionaryResult {
  word: string;
  meaning: string;
}

/** 単語が辞書に存在しなかったときのエラー */
export class WordNotFoundError extends Error {
  constructor(word: string) {
    super(`「${word}」は見つかりませんでした`);
  }
}

/**
 * Weblio 英和辞書で英単語の日本語訳を調べる。
 * CORS 回避のため、開発サーバのプロキシ (/weblio → https://ejje.weblio.jp/content) 経由で取得する。
 */
@Injectable({
  providedIn: 'root',
})
export class WordLookupService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = '/weblio/';

  lookup(word: string): Observable<DictionaryResult> {
    const w = word.trim();
    return this.http.get(this.apiBase + encodeURIComponent(w), { responseType: 'text' }).pipe(
      map((html) => {
        const meaning = parseWeblioMeaning(html);
        if (!meaning) throw new WordNotFoundError(w);
        return { word: w, meaning };
      }),
      catchError((err) => {
        if (err instanceof HttpErrorResponse && err.status === 404) {
          return throwError(() => new WordNotFoundError(w));
        }
        return throwError(() => err);
      }),
    );
  }
}

/**
 * Weblio のページから要約された日本語訳を取り出す。
 * meta description が「「abandon」の意味・翻訳・日本語 - 捨てる、見捨てる…｜Weblio英和・和英辞書」
 * という形式なので、「 - 」と「｜」の間を使う。
 */
export function parseWeblioMeaning(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const desc = doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
  const m = desc.match(/の意味・翻訳・日本語 - (.+?)｜/);
  if (m) return m[1].trim();

  // meta が想定外の形式だった場合は本文の要約欄を使う
  return doc.querySelector('.content-explanation')?.textContent?.trim() ?? '';
}
