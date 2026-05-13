import type { FillAction, PageField, StoredResumeFile } from "./types.js";

export function extractPageFields(): PageField[] {
  const elements = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement>(
      'input:not([type="hidden"]), textarea, select, [contenteditable="true"]',
    ),
  ).filter((element) => !isHidden(element));

  return elements.map((element) => {
    const input = element as HTMLInputElement;
    const tag = element.matches('[contenteditable="true"]') ? "contenteditable" : element.tagName.toLowerCase();
    const type = tag === "input" ? input.type?.toLowerCase() : undefined;

    return {
      selector: getUniqueSelector(element),
      tag,
      type,
      id: element.id || undefined,
      name: "name" in element ? (element.name || undefined) : undefined,
      placeholder: "placeholder" in element ? (element.placeholder || undefined) : undefined,
      ariaLabel: element.getAttribute("aria-label") ?? undefined,
      label: getFieldLabel(element),
      nearbyText: getNearbyText(element),
      options: getOptions(element),
      isFileInput: type === "file",
    };
  });
}

export function applyFillActions(actions: FillAction[], resumeFile?: StoredResumeFile): void {
  for (const action of actions) {
    const element = document.querySelector(action.selector);
    if (!element) continue;

    if (isFileInput(element)) {
      attachResumeFile(element, resumeFile);
      continue;
    }

    if (action.action === "highlight" || action.action === "skip") {
      highlightElement(element, action.reason);
      continue;
    }

    if (!action.value) {
      highlightElement(element, action.reason ?? "No value available for this field.");
      continue;
    }

    if (action.action === "fill") fillElement(element, action.value);
    if (action.action === "select") selectElement(element, action.value);
    if (action.action === "check") checkElement(element, action.value);

    if (action.confidence < 0.75) highlightElement(element, action.reason ?? "Please review this field.");
  }
}

function attachResumeFile(element: Element, resumeFile?: StoredResumeFile): void {
  if (!(element instanceof HTMLInputElement)) return;
  if (!resumeFile) {
    highlightElement(element, "Please manually upload your resume PDF here.");
    return;
  }

  if (!acceptsPdf(element)) {
    highlightElement(element, "This upload field does not appear to accept PDFs. Please review it manually.");
    return;
  }

  try {
    const file = dataUrlToFile(resumeFile);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    element.files = transfer.files;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    highlightElement(element, `Attached ${resumeFile.name}. Please review before submitting.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to attach resume PDF.";
    highlightElement(element, `${message} Please upload your resume manually.`);
  }
}

export function getUniqueSelector(el: Element): string {
  if (el.id) return `#${cssEscape(el.id)}`;

  const name = (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).name;
  if (name) {
    const tag = el.tagName.toLowerCase();
    const selector = `${tag}[name="${cssEscape(name)}"]`;
    if (document.querySelectorAll(selector).length === 1) return selector;
  }

  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.body) {
    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(current.parentElement?.children ?? []).filter((child) => child.tagName === current?.tagName);
    const index = siblings.indexOf(current) + 1;
    parts.unshift(`${tag}:nth-of-type(${index})`);
    current = current.parentElement;
  }

  return `body > ${parts.join(" > ")}`;
}

export function getFieldLabel(el: Element): string | undefined {
  const ariaLabelledBy = el.getAttribute("aria-labelledby");
  if (ariaLabelledBy) {
    const text = ariaLabelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }

  const id = el.id;
  if (id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${cssEscape(id)}"]`);
    if (label?.textContent?.trim()) return compact(label.textContent);
  }

  const wrappingLabel = el.closest("label");
  if (wrappingLabel?.textContent?.trim()) return compact(wrappingLabel.textContent);

  const parentLabel = el.parentElement?.querySelector("label");
  if (parentLabel?.textContent?.trim()) return compact(parentLabel.textContent);

  return undefined;
}

export function getNearbyText(el: Element): string {
  const container = el.closest("fieldset, .form-group, .field, .input, div, section") ?? el.parentElement;
  const text = compact(container?.textContent ?? "");
  return text.slice(0, 240);
}

export function setNativeValue(el: Element, value: string): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const prototype = Object.getPrototypeOf(el) as HTMLInputElement | HTMLTextAreaElement;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  if (el instanceof HTMLElement && el.isContentEditable) {
    el.textContent = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

export function highlightElement(el: Element, reason?: string): void {
  if (!(el instanceof HTMLElement)) return;
  el.style.outline = "3px solid #f59e0b";
  el.style.outlineOffset = "2px";
  el.title = reason ?? "Please review this field.";

  const id = `job-form-filler-note-${hash(getUniqueSelector(el))}`;
  if (document.getElementById(id)) return;

  const note = document.createElement("div");
  note.id = id;
  note.textContent = reason ?? "Please review this field.";
  note.style.cssText =
    "margin:4px 0;padding:6px 8px;border:1px solid #f59e0b;background:#fffbeb;color:#78350f;font:12px/1.35 system-ui,sans-serif;border-radius:4px;max-width:420px;";
  el.insertAdjacentElement("afterend", note);
}

function fillElement(element: Element, value: string): void {
  setNativeValue(element, value);
}

function selectElement(element: Element, value: string): void {
  if (!(element instanceof HTMLSelectElement)) {
    setNativeValue(element, value);
    return;
  }

  const option = Array.from(element.options).find((item) => item.value === value || item.textContent?.trim() === value);
  if (option) {
    element.value = option.value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    highlightElement(element, "Please select the matching option manually.");
  }
}

function checkElement(element: Element, value: string): void {
  if (!(element instanceof HTMLInputElement) || (element.type !== "checkbox" && element.type !== "radio")) {
    setNativeValue(element, value);
    return;
  }

  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "checked");
  descriptor?.set?.call(element, true);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function getOptions(element: Element): string[] | undefined {
  if (element instanceof HTMLSelectElement) {
    return Array.from(element.options)
      .map((option) => option.textContent?.trim() || option.value)
      .filter(Boolean);
  }

  if (element instanceof HTMLInputElement && (element.type === "radio" || element.type === "checkbox") && element.name) {
    return Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${cssEscape(element.name)}"]`))
      .map((input) => getFieldLabel(input) ?? input.value)
      .filter(Boolean);
  }

  return undefined;
}

function isHidden(element: Element): boolean {
  const style = window.getComputedStyle(element);
  return style.display === "none" || style.visibility === "hidden" || (element as HTMLElement).offsetParent === null;
}

function isFileInput(element: Element): boolean {
  return element instanceof HTMLInputElement && element.type === "file";
}

function acceptsPdf(element: HTMLInputElement): boolean {
  const accept = element.accept.trim().toLowerCase();
  if (!accept) return true;
  return accept
    .split(",")
    .map((item) => item.trim())
    .some((item) => item === ".pdf" || item === "application/pdf" || item === "application/*" || item === "*/*");
}

function dataUrlToFile(resumeFile: StoredResumeFile): File {
  const [header, base64] = resumeFile.dataUrl.split(",");
  if (!header?.startsWith("data:application/pdf") || !base64) throw new Error("Saved resume PDF is invalid.");

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], resumeFile.name, {
    type: "application/pdf",
    lastModified: resumeFile.lastModified,
  });
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cssEscape(value: string): string {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value.replace(/"/g, '\\"').replace(/\\/g, "\\\\");
}

function hash(value: string): string {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result.toString(16);
}
