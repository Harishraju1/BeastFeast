/** True when a keyboard event comes from a text field / code editor, so global shortcuts must ignore it. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest("input, textarea, select, [contenteditable='true'], .monaco-editor");
}
