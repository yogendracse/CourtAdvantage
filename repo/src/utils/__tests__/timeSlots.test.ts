import { getSlotSummary } from '../timeSlots';

describe('Time Slot Classification', () => {
  it('correctly classifies morning slots', () => {
    const slots = [
      { time: '6:00 a.m.', court: 'Court 1', reservationLink: 'link1' },
      { time: '11:30 a.m.', court: 'Court 2', reservationLink: 'link2' },
    ];

    const summary = getSlotSummary(slots);
    expect(summary.morning).toBe(2);
    expect(summary.afternoon).toBe(0);
    expect(summary.evening).toBe(0);
    expect(summary.total).toBe(2);
  });

  it('correctly classifies afternoon slots', () => {
    const slots = [
      { time: '12:00 p.m.', court: 'Court 1', reservationLink: 'link1' },
      { time: '4:30 p.m.', court: 'Court 2', reservationLink: 'link2' },
    ];

    const summary = getSlotSummary(slots);
    expect(summary.morning).toBe(0);
    expect(summary.afternoon).toBe(2);
    expect(summary.evening).toBe(0);
    expect(summary.total).toBe(2);
  });

  it('correctly classifies evening slots', () => {
    const slots = [
      { time: '5:00 p.m.', court: 'Court 1', reservationLink: 'link1' },
      { time: '7:30 p.m.', court: 'Court 2', reservationLink: 'link2' },
    ];

    const summary = getSlotSummary(slots);
    expect(summary.morning).toBe(0);
    expect(summary.afternoon).toBe(0);
    expect(summary.evening).toBe(2);
    expect(summary.total).toBe(2);
  });

  it('correctly classifies mixed time slots', () => {
    const slots = [
      { time: '9:00 a.m.', court: 'Court 1', reservationLink: 'link1' },
      { time: '2:30 p.m.', court: 'Court 2', reservationLink: 'link2' },
      { time: '6:00 p.m.', court: 'Court 3', reservationLink: 'link3' },
    ];

    const summary = getSlotSummary(slots);
    expect(summary.morning).toBe(1);
    expect(summary.afternoon).toBe(1);
    expect(summary.evening).toBe(1);
    expect(summary.total).toBe(3);
  });
}); 