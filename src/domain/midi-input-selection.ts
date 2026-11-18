export interface MidiInputIdentity {
  id: string;
  name: string | null;
}

export function pickArturia<T extends MidiInputIdentity>(inputs: readonly T[]): T | null {
  const controllers = inputs.filter(input => /microlab|arturia/i.test(input.name ?? ''));
  return controllers.find(input => !/daw|midiin2|control|thru/i.test(input.name ?? '')) ?? controllers[0] ?? null;
}

/** Keep the saved instrument independent of the input currently handling messages. */
export function selectMidiInput<T extends MidiInputIdentity>(
  inputs: readonly T[],
  activeId: string | null,
  preferredId: string | null,
  preferredName?: string | null,
): { input: T; temporary: boolean } | null {
  const preferred = inputs.find(input => input.id === preferredId)
    ?? (preferredName ? inputs.find(input => input.name === preferredName) : undefined);
  const input = preferred ?? inputs.find(input => input.id === activeId) ?? pickArturia(inputs) ?? inputs[0];
  return input ? { input, temporary: preferredId !== null && !preferred } : null;
}
