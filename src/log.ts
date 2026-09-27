// Logs podman-cli activity to a file (append) plus a reader for the Logs view.
// Bun FileSink always truncates, so append goes through node:fs appendFileSync.
import { appendFileSync, mkdirSync } from "node:fs";

export type LogLevel = "info" | "ok" | "warn" | "error";

const HOME = process.env.HOME ?? "/tmp";
export const LOG_DIR = `${process.env.XDG_STATE_HOME ?? `${HOME}/.local/state`}/podman-cli`;
export const LOG_PATH = `${LOG_DIR}/podman-cli.log`;

const MAX_MESSAGE = 400;

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_MESSAGE ? `${flat.slice(0, MAX_MESSAGE)}…` : flat;
}

export function logEvent(level: LogLevel, scope: string, message: string): void {
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const line = `${stamp} ${level.padEnd(5)} ${oneLine(message)} [${scope}]\n`;
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_PATH, line, "utf8");
  } catch {
    // A failed write (e.g. read-only HOME) must never take the TUI down.
  }
}

export async function readLogTail(lines = 500): Promise<string> {
  const file = Bun.file(LOG_PATH);
  if (!(await file.exists())) return `(no log yet · ${LOG_PATH})`;
  const text = (await file.text()).split("\n").filter(Boolean);
  return text.slice(-lines).join("\n") || `(no log yet · ${LOG_PATH})`;
}
