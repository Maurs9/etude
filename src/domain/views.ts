/**
 * Typed application entry point.
 *
 * The DOM/event runtime is deliberately isolated from the domain modules so
 * the compiler can enforce the typed storage, theory, audio and notation
 * boundaries. Vite loads this module as the stable application entry.
 */
import './views-runtime.js';

export {};
