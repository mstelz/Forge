import { describe, expect, it } from 'vitest';
import { SetSegmentSchema, setVolumeKg } from '../session-log';
import { logFormReducer, initialLogFormState } from '../../client/lib/session/log-form';

describe('compound sets', () => {
  it('counts each effort once without combining reps into an inflated strength estimate', () => {
    const log = { weightKg: 60, reps: 8, segments: [{ weightKg: 40, reps: 5, pauseSec: 20 }] };
    expect(setVolumeKg(log)).toBe(680);
    expect(log.reps).toBe(8);
  });
  it('accepts bodyweight efforts and rejects invalid reps, weights, and pauses', () => {
    expect(SetSegmentSchema.safeParse({ weightKg: null, reps: 5, pauseSec: 20 }).success).toBe(true);
    for (const override of [{ reps: 0 }, { reps: 1.5 }, { weightKg: -1 }, { pauseSec: -1 }, { pauseSec: 3601 }]) {
      expect(SetSegmentSchema.safeParse({ weightKg: 40, reps: 5, pauseSec: 20, ...override }).success).toBe(false);
    }
  });
  it('loads a different set without leaking metrics or segments', () => {
    const previous = { ...initialLogFormState, weightDisplay: 80, weightInputStr: '80', rpe: 9, segments: [{ weight: '60', reps: '5', pause: '20' }] };
    const next = logFormReducer(previous, { type: 'load', values: { reps: 8 } });
    expect(next).toMatchObject({ weightDisplay: null, weightInputStr: '', reps: 8, rpe: null, segments: [] });
  });
  it('clears compound efforts when switching back to normal', () => {
    const state = { ...initialLogFormState, segments: [{ weight: '60', reps: '5', pause: '20' }] };
    expect(logFormReducer(state, { type: 'setSetType', setType: 'normal' }).segments).toEqual([]);
  });
});
