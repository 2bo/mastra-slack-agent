import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent, listEvents, searchEvents } from './google-calendar';

type RuntimeContext = Parameters<NonNullable<typeof listEvents.execute>>[0]['runtimeContext'];

const mocks = vi.hoisted(() => {
  return {
    mList: vi.fn(),
    mInsert: vi.fn(),
    mSetCredentials: vi.fn(),
  };
});

vi.mock('googleapis', () => {
  return {
    google: {
      auth: {
        OAuth2: vi.fn().mockImplementation(function () {
          return { setCredentials: mocks.mSetCredentials };
        }),
      },
      calendar: vi.fn(() => ({
        events: {
          list: mocks.mList,
          insert: mocks.mInsert,
        },
      })),
    },
  };
});

describe('Google Calendar Tools', () => {
  const mockRuntimeContext = {
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    runId: 'test-run',
  } as unknown as RuntimeContext;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation for list to return empty items
    mocks.mList.mockResolvedValue({ data: { items: [] } });
    // Default mock for insert
    mocks.mInsert.mockResolvedValue({
      data: { id: '123', htmlLink: 'http://link' },
    });

    // Mock env vars
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'test-refresh-token';
  });

  describe('listEvents', () => {
    it('should call calendar.events.list with correct parameters', async () => {
      await listEvents.execute!({
        context: { limit: 5, timeMin: '2025-01-01T00:00:00Z' },
        runtimeContext: mockRuntimeContext,
      });

      expect(mocks.mList).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'primary',
          maxResults: 5,
          timeMin: '2025-01-01T00:00:00Z',
          singleEvents: true,
          orderBy: 'startTime',
        }),
      );
    });

    it('should return parsed events', async () => {
      mocks.mList.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: '1',
              summary: 'Test Event',
              start: { dateTime: '2025-01-01T10:00:00Z' },
              end: { dateTime: '2025-01-01T11:00:00Z' },
            },
          ],
        },
      });

      const result = await listEvents.execute!({
        context: {},
        runtimeContext: mockRuntimeContext,
      });
      expect(result).toEqual({
        events: [
          {
            id: '1',
            summary: 'Test Event',
            start: '2025-01-01T10:00:00Z',
            end: '2025-01-01T11:00:00Z',
          },
        ],
      });
    });
  });

  describe('searchEvents', () => {
    it('should call events.list with query parameter', async () => {
      await searchEvents.execute!({
        context: { query: 'Lunch', timeMin: '2025-01-01T00:00:00Z' },
        runtimeContext: mockRuntimeContext,
      });

      expect(mocks.mList).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'Lunch',
          timeMin: '2025-01-01T00:00:00Z',
        }),
      );
    });
  });

  describe('createEvent', () => {
    it('should call events.insert with correct body', async () => {
      await createEvent.execute!({
        context: {
          summary: 'New Meeting',
          startDateTime: '2025-12-15T10:00:00+09:00',
          endDateTime: '2025-12-15T11:00:00+09:00',
          description: 'Discuss plans',
        },
        runtimeContext: mockRuntimeContext,
      });

      expect(mocks.mInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'primary',
          requestBody: {
            summary: 'New Meeting',
            description: 'Discuss plans',
            start: { dateTime: '2025-12-15T10:00:00+09:00', timeZone: 'Asia/Tokyo' },
            end: { dateTime: '2025-12-15T11:00:00+09:00', timeZone: 'Asia/Tokyo' },
          },
        }),
      );
    });
  });
});
