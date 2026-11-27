import type { ReadDrillData } from '../../domain/views.js';
import { byId, maybeById } from '../../domain/dom.js';
import type { ReadShell } from '../../domain/views.js';
import * as theory from '../../domain/theory.js';

const pc = theory.pitchClass, srKeyName = theory.circleKeyPitchClass, rdSpellMidi = theory.readingSpelling;
import type { SrState, RdnState, ReadDrillState } from './read-model.js';


/** Shell state and services createFullscreenStage reads; values are getters so shell declarations made later resolve on use. */
export interface FullscreenStageDeps {
  readonly shell: ReadShell;
  readonly anLayoutVars: () => void;
  readonly dockSync: () => void;
  readonly RD: ReadDrillState;
  readonly rdData: () => ReadDrillData;
  readonly rdEndClick: () => void;
  readonly rdFlowShow: (slide: boolean) => void;
  readonly rdFocusDispSet: (open: boolean, focusBack?: boolean) => void;
  readonly RDN: RdnState;
  readonly rdRhFit: () => void;
  readonly scoreFocusEnter: (owner: "analysis" | "read", target: HTMLElement, manual?: boolean) => void;
  readonly scoreFocusExit: (quiet?: boolean) => void;
  readonly scoreFocusUi: () => void;
  readonly SR: SrState;
  readonly srFit: () => void;
  readonly srGo: () => void;
  readonly srMeta: () => void;
  readonly syncMobileStartBars: () => void;
  readonly view0: () => string;
}

/* The full-screen stage: a running drill or piece takes the whole window; Esc (or End) leaves it. */
export function createFullscreenStage(deps: FullscreenStageDeps) {
  const { shell } = deps;
    /* ---- full-screen stage: a running drill or piece takes the whole window; Esc (or End) leaves it ---- */
  function srStartStage() {
      // Level exercises keep the expanded player through their result and the next piece.
      // Automatic expansion uses the full window without a native fullscreen request.
      if (deps.SR.lvPiece && shell.scoreFocus.readOverride === null && deps.rdData().prefs.stage)
          deps.scoreFocusEnter('read', byId('rd-fs'), false);
      else
          stageSync();
  }
    function stageWanted() {
      if (deps.view0() === 'read' && !byId('rdp-pieces').hidden && shell.scoreFocus.readOverride !== null)
          return shell.scoreFocus.readOverride && !byId('rdp-pieces').hidden && !!deps.SR.piece;
      if (deps.view0() !== 'read' || !deps.rdData().prefs.stage)
          return false;
      return (deps.RD.on && !byId('rdp-drills').hidden && !byId('rdx-stage').hidden) || (deps.SR.active && !byId('rdp-pieces').hidden);
  }
    function stageSync() {
      if (shell.scoreFocus.owner === 'read' && (deps.view0() !== 'read' || byId('rdp-pieces').hidden)) { deps.scoreFocusExit(true); return; }
      deps.scoreFocusUi();
      deps.syncMobileStartBars();
      const end = byId('rd-stage-end');
      end.hidden = shell.scoreFocus.owner === 'read' && !deps.SR.active;
      if (shell.scoreFocus.owner === 'read')
          end.removeAttribute('aria-keyshortcuts');
      else
          end.setAttribute('aria-keyshortcuts', 'Escape');
      const on = stageWanted();
      if (on === shell.stage.on)
          return;
      shell.stage.on = on;
      shell.stage.kb = null;
      if (on) {
          document.body.dataset.stage = 'immersive';
          if (!byId('rdp-pieces').hidden)
              deps.srMeta();
      }
      else if (document.body.dataset.stage === 'immersive')
          delete document.body.dataset.stage;
      const stageTop = maybeById('rd-stage-top');
      if (stageTop)
          stageTop.hidden = !on || byId('rdp-pieces').hidden;
      if (on)
          window.scrollTo(0, 0);
      deps.dockSync();
      deps.anLayoutVars();
      stageRefit();
  }
    // The staff is sized from the room the stage leaves it, so it is redrawn whenever that changes.
  function stageRefit() {
      if (deps.RD.on && deps.RD.flow)
          deps.rdFlowShow(false);
      deps.srFit();
      deps.rdRhFit();
  }
    function stageResize() { clearTimeout(shell.stage.rz); shell.stage.rz = window.setTimeout(() => { if (shell.stage.on)
      stageRefit(); }, 120); }
    // Esc leaves the stage like End or Stop; focus goes to a control that stays on screen.
  function stageKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && shell.scoreFocus.owner && shell.scoreFocus.owner !== 'analysis') {
          e.preventDefault();
          const tools = maybeById('rd-focus-tools');
          if (shell.scoreFocus.owner === 'read' && tools && !tools.hidden) {
              deps.rdFocusDispSet(false, true);
              return true;
          }
          if (shell.scoreFocus.owner === 'read' && deps.SR.active) {
              deps.srGo();
              shell.scoreFocus.returnTo = byId('rd-go');
          }
          deps.scoreFocusExit();
          return true;
      }
      if (e.key !== 'Escape' || !shell.stage.on)
          return false;
      e.preventDefault();
      if (deps.RD.on) {
          deps.rdEndClick();
          // The warm-up hides the drill's own Back: its header's Back takes the focus instead.
          if (deps.RDN.screen === 'home') return true; // warm-up exit already restored focus
          const back = byId('rdx-back');
          if (!byId('rdx-stage').contains(document.activeElement) || document.activeElement?.closest('[hidden]'))
              back.focus({ preventScroll: true });
      }
      else if (deps.SR.active) {
          deps.srGo();
          byId('rd-go').focus({ preventScroll: true });
      }
      return true;
  }

  return {
    srStartStage,
    stageWanted,
    stageSync,
    stageRefit,
    stageResize,
    stageKey,
  };
}
