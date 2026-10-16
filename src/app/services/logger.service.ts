import { Injectable, isDevMode } from '@angular/core';

export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
  Off = 4,
}

/**
 * アプリ共通のロガー。
 * 開発モードでは Debug 以上、本番ビルドでは Warn 以上のみ出力する。
 */
@Injectable({
  providedIn: 'root',
})
export class LoggerService {
  level: LogLevel = isDevMode() ? LogLevel.Debug : LogLevel.Warn;

  debug(message: string, ...data: unknown[]): void {
    this.write(LogLevel.Debug, message, data);
  }

  info(message: string, ...data: unknown[]): void {
    this.write(LogLevel.Info, message, data);
  }

  warn(message: string, ...data: unknown[]): void {
    this.write(LogLevel.Warn, message, data);
  }

  error(message: string, ...data: unknown[]): void {
    this.write(LogLevel.Error, message, data);
  }

  private write(level: LogLevel, message: string, data: unknown[]): void {
    if (level < this.level) return;

    const line = `[${new Date().toISOString()}] [${LogLevel[level].toUpperCase()}] ${message}`;
    switch (level) {
      case LogLevel.Debug:
        console.debug(line, ...data);
        break;
      case LogLevel.Info:
        console.info(line, ...data);
        break;
      case LogLevel.Warn:
        console.warn(line, ...data);
        break;
      case LogLevel.Error:
        console.error(line, ...data);
        break;
    }
  }
}
