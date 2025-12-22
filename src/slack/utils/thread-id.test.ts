import { describe, it, expect } from 'vitest';
import { generateThreadId } from './thread-id';

describe('generateThreadId', () => {
  it('thread_ts が存在する場合はそれを使用', () => {
    const result = generateThreadId('C12345', '1703001234.567890', '1703001235.123456');
    expect(result).toBe('C12345:1703001234.567890');
  });

  it('thread_ts が undefined の場合は ts を使用', () => {
    const result = generateThreadId('C12345', undefined, '1703001235.123456');
    expect(result).toBe('C12345:1703001235.123456');
  });

  it('異なるチャンネルIDでも正しく動作', () => {
    const result = generateThreadId('C1A2B3C4D', '1703001234.567890', '1703001235.123456');
    expect(result).toBe('C1A2B3C4D:1703001234.567890');
  });

  it('同じチャンネル内の異なるスレッドは異なるIDを生成', () => {
    const thread1 = generateThreadId('C12345', undefined, '1703001234.567890');
    const thread2 = generateThreadId('C12345', undefined, '1703001235.123456');
    expect(thread1).not.toBe(thread2);
  });

  it('異なるチャンネルの同じタイムスタンプでも異なるIDを生成', () => {
    const channel1 = generateThreadId('C12345', '1703001234.567890', '1703001235.123456');
    const channel2 = generateThreadId('C67890', '1703001234.567890', '1703001235.123456');
    expect(channel1).not.toBe(channel2);
  });
});
