import { describe, expect, it } from 'vitest';
import { createEvent, listEvents } from './google-calendar';

describe('Google Calendar Tools', () => {
  it('listEvents should be defined and have correct ID', () => {
    expect(listEvents).toBeDefined();
    expect(listEvents.id).toBe('listEvents');
    expect(listEvents.inputSchema).toBeDefined();
  });

  it('createEvent should be defined and have correct ID', () => {
    expect(createEvent).toBeDefined();
    expect(createEvent.id).toBe('createEvent');
    expect(createEvent.inputSchema).toBeDefined();
  });
});
