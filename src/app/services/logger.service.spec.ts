import { LoggerService, LogLevel } from './logger.service';

describe('LoggerService', () => {
  it('設定レベル未満のログは出力しない', () => {
    const logger = new LoggerService();
    logger.level = LogLevel.Warn;
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.info('hidden');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('設定レベル以上のログはレベル付きで出力する', () => {
    const logger = new LoggerService();
    logger.level = LogLevel.Debug;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('boom', 42);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[ERROR] boom'), 42);
    spy.mockRestore();
  });
});
