export type SightReadingStateName = 'idle' | 'preparing' | 'claiming' | 'preview' | 'countIn' | 'playing' | 'completed' | 'pendingSave' | 'saved' | 'abandoned' | 'interrupted' | 'blocked';
export type SightReadingState = {
  readonly name: SightReadingStateName;
  readonly mode: 'firstSight' | 'practice';
  readonly attemptId: string | null;
  readonly fingerprint: string | null;
  readonly reason?: string;
};
export type SightReadingEvent =
  | { readonly type: 'prepare'; readonly mode?: 'firstSight' | 'practice'; readonly fingerprint?: string }
  | { readonly type: 'claim' }
  | { readonly type: 'claimed' }
  | { readonly type: 'blocked'; readonly reason?: string }
  | { readonly type: 'startPreview' }
  | { readonly type: 'startNow' }
  | { readonly type: 'switchToPractice' }
  | { readonly type: 'countInDone' }
  | { readonly type: 'finish' }
  | { readonly type: 'saved' }
  | { readonly type: 'saveFailed' }
  | { readonly type: 'continueWithoutSave' }
  | { readonly type: 'interrupt' }
  | { readonly type: 'abandon' };

function same(state: SightReadingState): SightReadingState {
  return state;
}

export function srtTransition(state: SightReadingState, event: SightReadingEvent): SightReadingState {
  switch (state.name) {
    case 'idle':
      if (event.type === 'prepare') return { ...state, name: 'preparing', mode: event.mode ?? state.mode, fingerprint: event.fingerprint ?? state.fingerprint };
      return same(state);
    case 'preparing':
      if (event.type === 'claim') return { ...state, name: 'claiming' };
      if (event.type === 'startPreview') return { ...state, name: 'preview' };
      return same(state);
    case 'claiming':
      if (event.type === 'claimed') return { ...state, name: 'preview' };
      if (event.type === 'blocked') return { ...state, name: 'blocked', reason: event.reason };
      if (event.type === 'interrupt') return { ...state, name: 'interrupted' };
      return same(state);
    case 'preview':
      if (event.type === 'startNow') return { ...state, name: 'countIn' };
      if (event.type === 'switchToPractice' || event.type === 'abandon') return { ...state, name: 'abandoned' };
      if (event.type === 'interrupt') return { ...state, name: 'interrupted' };
      return same(state);
    case 'countIn':
      if (event.type === 'countInDone') return { ...state, name: 'playing' };
      if (event.type === 'interrupt') return { ...state, name: 'interrupted' };
      return same(state);
    case 'playing':
      if (event.type === 'finish') return { ...state, name: 'completed' };
      if (event.type === 'interrupt') return { ...state, name: 'interrupted' };
      return same(state);
    case 'completed':
      if (event.type === 'saved') return { ...state, name: 'saved' };
      if (event.type === 'saveFailed') return { ...state, name: 'pendingSave' };
      return same(state);
    case 'pendingSave':
      if (event.type === 'saved') return { ...state, name: 'saved' };
      if (event.type === 'continueWithoutSave' || event.type === 'abandon') return { ...state, name: 'abandoned' };
      return same(state);
    default:
      return same(state);
  }
}

export const SRT_INITIAL_STATE: SightReadingState = {
  name: 'idle', mode: 'firstSight', attemptId: null, fingerprint: null,
};
