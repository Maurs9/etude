export type SightReadingStateName = 'idle' | 'preparing' | 'claiming' | 'preview' | 'countIn' | 'playing' | 'completed' | 'pendingSave' | 'saved' | 'abandoned' | 'interrupted' | 'blocked';
export type SightReadingState = {
  readonly name: SightReadingStateName;
  readonly mode: 'firstSight' | 'practice';
  readonly attemptId: string | null;
  readonly fingerprint: string | null;
  readonly reason?: string;
};
export type SightReadingEvent =
  | { readonly type: 'prepare'; readonly mode?: 'firstSight' | 'practice'; readonly fingerprint?: string; readonly attemptId?: string }
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
  | { readonly type: 'retrySave' }
  | { readonly type: 'continueWithoutSave' }
  | { readonly type: 'interrupt' }
  | { readonly type: 'abandon' };

export const SRT_INITIAL_STATE: SightReadingState = {
  name: 'idle',
  mode: 'firstSight',
  attemptId: null,
  fingerprint: null,
};

export function srtTransition(state: SightReadingState, event: SightReadingEvent): SightReadingState {
  switch (state.name) {
    case 'idle':
      if (event.type === 'prepare') {
        return {
          ...state,
          name: 'preparing',
          mode: event.mode ?? state.mode,
          fingerprint: event.fingerprint ?? state.fingerprint,
          attemptId: event.attemptId ?? state.attemptId,
        };
      }
      return state;
    case 'preparing':
      if (event.type === 'claim' && state.mode === 'firstSight') return { ...state, name: 'claiming' };
      if (event.type === 'startPreview' && state.mode === 'practice') return { ...state, name: 'countIn' };
      if (event.type === 'blocked') return { ...state, name: 'blocked', reason: event.reason };
      if (event.type === 'interrupt') return { ...state, name: 'interrupted' };
      return state;
    case 'claiming':
      if (event.type === 'claimed') return { ...state, name: 'preview' };
      if (event.type === 'blocked') return { ...state, name: 'blocked', reason: event.reason };
      if (event.type === 'interrupt') return { ...state, name: 'interrupted' };
      return state;
    case 'preview':
      if (event.type === 'startNow') return { ...state, name: 'countIn' };
      if (event.type === 'switchToPractice') return { ...state, name: 'preparing', mode: 'practice', attemptId: null };
      if (event.type === 'abandon') return { ...state, name: 'abandoned' };
      if (event.type === 'interrupt') return { ...state, name: 'interrupted' };
      return state;
    case 'countIn':
      if (event.type === 'countInDone') return { ...state, name: 'playing' };
      if (event.type === 'interrupt') return { ...state, name: 'interrupted' };
      return state;
    case 'playing':
      if (event.type === 'finish') return { ...state, name: 'completed' };
      if (event.type === 'interrupt') return { ...state, name: 'interrupted' };
      return state;
    case 'completed':
      if (event.type === 'saved') return { ...state, name: 'saved' };
      if (event.type === 'saveFailed') return { ...state, name: 'pendingSave' };
      if (event.type === 'interrupt') return { ...state, name: 'interrupted' };
      return state;
    case 'pendingSave':
      if (event.type === 'saved' || event.type === 'retrySave') return { ...state, name: event.type === 'saved' ? 'saved' : 'completed' };
      if (event.type === 'continueWithoutSave' || event.type === 'abandon') return { ...state, name: 'abandoned' };
      if (event.type === 'interrupt') return { ...state, name: 'interrupted' };
      return state;
    default:
      return state;
  }
}
