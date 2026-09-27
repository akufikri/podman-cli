#!/opt/homebrew/bin/bun
import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  RGBA,
  ScrollBoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  createCliRenderer,
  type KeyEvent,
  type Renderable,
  type SelectOption,
} from "@opentui/core";

import {
  containerAction,
  containerLogs,
  containerName,
  formatPorts,
  humanSize,
  imageRef,
  listContainers,
  listImages,
  listNetworks,
  listPods,
  listVolumes,
  machineStatus,
  podAction,
  pullImage,
  removeImage,
  removeNetwork,
  removeVolume,
  runContainer,
  startMachine,
  type Container,
  type ImageInfo,
  type Network,
  type Pod,
  type Volume,
} from "./podman.ts";

import { LOG_PATH, logEvent, readLogTail } from "./log.ts";

type View = "containers" | "images" | "pods" | "volumes" | "networks" | "create" | "logs" | "help";
type Group = "RESOURCES" | "TOOLS";

type MenuItem = { view: View; label: string; short: string; group: Group };

const MENU: MenuItem[] = [
  { view: "containers", label: "Containers", short: "Containers", group: "RESOURCES" },
  { view: "images", label: "Images", short: "Images", group: "RESOURCES" },
  { view: "pods", label: "Pods", short: "Pods", group: "RESOURCES" },
  { view: "volumes", label: "Volumes", short: "Volumes", group: "RESOURCES" },
  { view: "networks", label: "Networks", short: "Networks", group: "RESOURCES" },
  { view: "create", label: "New container", short: "New", group: "TOOLS" },
  { view: "logs", label: "Logs", short: "Logs", group: "TOOLS" },
  { view: "help", label: "Help", short: "Help", group: "TOOLS" },
];

const LIST_VIEWS: View[] = ["containers", "images", "pods", "volumes", "networks"];

// Narrow predicate: used by focus, zone, keypress, and switchView.
function isListView(v: View): boolean {
  return LIST_VIEWS.includes(v);
}

function fit(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length <= width) return text;
  return text.slice(0, Math.max(0, width - 1)) + "…";
}

function compact(): boolean {
  return terminalSize().w < 62;
}

const FG = RGBA.defaultForeground();
const ACCENT = RGBA.fromHex("#7fd6ff");
const OK = RGBA.fromHex("#8de08d");
const WARN = RGBA.fromHex("#ffd479");
const ERR = RGBA.fromHex("#ff8080");
const DIM = RGBA.fromInts(130, 130, 140);
const PANEL_BG = RGBA.fromHex("#161a20");
const MENU_SELECT_BG = RGBA.fromHex("#243244");
const MENU_HOVER_BG = RGBA.fromHex("#1d2531");
const BORDER = RGBA.fromInts(70, 80, 95);

const CREATE_FIELDS = [
  { id: "image", label: "image", placeholder: "docker.io/library/nginx:latest" },
  { id: "name", label: "name", placeholder: "my-nginx" },
  { id: "ports", label: "ports", placeholder: "8080:80, 8443:443" },
  { id: "volumes", label: "volumes", placeholder: "/host/path:/container/path" },
  { id: "env", label: "env", placeholder: "KEY=VALUE, FOO=bar" },
  { id: "restart", label: "restart", placeholder: "unless-stopped" },
  { id: "command", label: "command", placeholder: "optional, e.g. sleep infinity" },
];

const renderer = await createCliRenderer({ exitOnCtrlC: true, targetFps: 30 });

// ── layout ───────────────────────────────────────────────────────────────────
const root = new BoxRenderable(renderer, {
  id: "root",
  width: "100%",
  height: "100%",
  flexDirection: "column",
});

const topBar = new TextRenderable(renderer, { id: "topBar", content: "", fg: ACCENT });
root.add(topBar);

const body = new BoxRenderable(renderer, {
  id: "body",
  width: "100%",
  flexGrow: 1,
  flexDirection: "row",
  gap: 1,
});
root.add(body);

const sidebar = new BoxRenderable(renderer, {
  id: "sidebar",
  width: 24,
  border: true,
  borderStyle: "rounded",
  borderColor: BORDER,
  title: " Menu ",
  titleColor: ACCENT,
  backgroundColor: PANEL_BG,
  flexDirection: "column",
  paddingX: 1,
});
body.add(sidebar);

const menuScroll = new ScrollBoxRenderable(renderer, {
  id: "menuScroll",
  width: "100%",
  flexGrow: 1,
  scrollY: true,
  scrollX: false,
  backgroundColor: PANEL_BG,
  verticalScrollbarOptions: { visible: false },
});
sidebar.add(menuScroll);

const menuHeaders: TextRenderable[] = [];
const menuSeparators: TextRenderable[] = [];
const menuRows: { row: BoxRenderable; label: TextRenderable; count: TextRenderable }[] = [];

MENU.forEach((item, index) => {
  if (index === 0 || MENU[index - 1]!.group !== item.group) {
    if (menuHeaders.length) {
      const sep = new TextRenderable(renderer, { id: `menu-sep-${item.group}`, content: "", fg: BORDER, height: 1 });
      menuSeparators.push(sep);
      menuScroll.add(sep);
    }
    const head = new TextRenderable(renderer, {
      id: `menu-head-${item.group}`,
      content: item.group,
      fg: DIM,
      height: 1,
      truncate: true,
      wrapMode: "none",
    });
    menuHeaders.push(head);
    menuScroll.add(head);
  }

  const row = new BoxRenderable(renderer, {
    id: `menu-row-${item.view}`,
    width: "100%",
    height: 1,
    flexDirection: "row",
    gap: 1,
    justifyContent: "space-between",
  });
  const label = new TextRenderable(renderer, {
    id: `menu-label-${item.view}`,
    content: "",
    fg: FG,
    height: 1,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    wrapMode: "none",
  });
  const count = new TextRenderable(renderer, {
    id: `menu-count-${item.view}`,
    content: "",
    fg: DIM,
    height: 1,
    flexShrink: 0,
    wrapMode: "none",
  });
  row.add(label);
  row.add(count);
  row.onMouseDown = (event) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    menuHover = null;
    activateMenu(item.view);
  };
  row.onMouseOver = () => {
    if (menuHover === item.view) return;
    menuHover = item.view;
    renderMenu();
  };
  row.onMouseOut = () => {
    if (menuHover !== item.view) return;
    menuHover = null;
    renderMenu();
  };
  menuScroll.add(row);
  menuRows.push({ row, label, count });
});

const main = new BoxRenderable(renderer, {
  id: "main",
  flexGrow: 1,
  flexDirection: "column",
});
body.add(main);

const panelTitle = new TextRenderable(renderer, { id: "panelTitle", content: "", fg: FG });
main.add(panelTitle);

const mainContent = new BoxRenderable(renderer, {
  id: "mainContent",
  width: "100%",
  flexGrow: 1,
  flexDirection: "column",
  border: true,
  borderStyle: "rounded",
  borderColor: BORDER,
  backgroundColor: PANEL_BG,
});
main.add(mainContent);

const listSelect = new SelectRenderable(renderer, {
  id: "list",
  width: "100%",
  flexGrow: 1,
  options: [],
  showDescription: true,
});
mainContent.add(listSelect);

const details = new BoxRenderable(renderer, {
  id: "details",
  width: "100%",
  height: 8,
  border: true,
  borderStyle: "rounded",
  borderColor: BORDER,
  title: " Details ",
  titleColor: DIM,
  backgroundColor: PANEL_BG,
  paddingX: 1,
});
main.add(details);

const detailsText = new TextRenderable(renderer, { id: "detailsText", content: "", fg: FG });
details.add(detailsText);

const messageBar = new TextRenderable(renderer, { id: "messageBar", content: "", fg: DIM });
root.add(messageBar);

const helpBar = new TextRenderable(renderer, { id: "helpBar", content: "", fg: DIM });
root.add(helpBar);

renderer.root.add(root);

// create form (lives in mainContent when view === "create")
const createForm = new BoxRenderable(renderer, {
  id: "createForm",
  width: "100%",
  height: "100%",
  flexDirection: "column",
  paddingX: 1,
});
const createInputs: Record<string, InputRenderable> = {};
for (const f of CREATE_FIELDS) {
  const row = new BoxRenderable(renderer, {
    id: `row-${f.id}`,
    width: "100%",
    flexDirection: "row",
    gap: 1,
  });
  row.add(new TextRenderable(renderer, { content: f.label.padEnd(8), fg: DIM }));
  const input = new InputRenderable(renderer, {
    id: `in-${f.id}`,
    flexGrow: 1,
    placeholder: f.placeholder,
  });
  input.on(InputRenderableEvents.ENTER, () => void submitCreate());
  createInputs[f.id] = input;
  row.add(input);
  createForm.add(row);
}
createForm.add(
  new TextRenderable(renderer, {
    id: "createHint",
    content: "\n  ↑↓ / Tab next field   ·   Enter run (podman run -d)   ·   Esc back to list",
    fg: DIM,
  }),
);

const helpScroll = new ScrollBoxRenderable(renderer, {
  id: "helpScroll",
  width: "100%",
  flexGrow: 1,
  scrollY: true,
  scrollX: false,
  backgroundColor: PANEL_BG,
  verticalScrollbarOptions: { visible: false },
});
const helpText = new TextRenderable(renderer, {
  id: "helpText",
  content: "",
  fg: FG,
  width: "100%",
  wrapMode: "word",
});
helpScroll.add(helpText);

const logScroll = new ScrollBoxRenderable(renderer, {
  id: "logScroll",
  width: "100%",
  flexGrow: 1,
  scrollY: true,
  scrollX: false,
  stickyScroll: true,
  stickyStart: "bottom",
  backgroundColor: PANEL_BG,
  verticalScrollbarOptions: { visible: false },
});
const logText = new TextRenderable(renderer, {
  id: "logText",
  content: "",
  fg: FG,
  width: "100%",
  wrapMode: "word",
});
logScroll.add(logText);

// ── state ────────────────────────────────────────────────────────────────────
let view: View = "containers";
let message = "";
let messageColor: RGBA = DIM;
let busy = 0;
let pendingConfirm: (() => Promise<void>) | null = null;

let containers: Container[] = [];
let images: ImageInfo[] = [];
let pods: Pod[] = [];
let volumes: Volume[] = [];
let networks: Network[] = [];
let machine: "running" | "stopped" | "unknown" = "unknown";
let overlay: BoxRenderable | null = null;
let zone: "menu" | "list" = "menu";
let menuIndex = 0;
let menuHover: View | null = null;
let lastListView: View = "containers";
// Sidebar inner width derived from terminal size; never read back sidebar.width (the Yoga
// value only updates after a layout pass, so a read-back can return the stale width on resize).
let menuInner = 20;

function terminalSize(): { w: number; h: number } {
  return {
    w: renderer.terminalWidth || 80,
    h: renderer.terminalHeight || 24,
  };
}

function applyLayout() {
  const { w } = terminalSize();
  const sidebarWidth = Math.max(14, Math.min(24, Math.round(w * 0.28)));
  sidebar.width = sidebarWidth;
  menuInner = Math.max(8, sidebarWidth - 4);
  syncDetails();
  renderTop();
  renderPanelTitle();
  renderMenu();
  renderBottom();
}

function renderPanelTitle() {
  const label = MENU.find((m) => m.view === view)?.label ?? view;
  panelTitle.content = fit(view === "logs" ? ` Logs · ${LOG_PATH}` : ` ${label}`, terminalSize().w);
}

function syncDetails() {
  const { h } = terminalSize();
  const show = h >= 20 && view !== "create" && view !== "help";
  details.visible = show;
  if (show) details.height = Math.max(4, Math.min(8, Math.round(h * 0.3)));
  listSelect.showDescription = h >= 16;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function setMessage(text: string, color: RGBA = DIM) {
  message = text;
  messageColor = color;
  renderBottom();
}

function renderBottom() {
  const w = terminalSize().w;
  if (pendingConfirm) {
    messageBar.content = fit(" Confirm: y = yes · n / Esc = cancel", w);
    messageBar.fg = WARN;
  } else {
    messageBar.content = fit(" " + message, w);
    messageBar.fg = busy > 0 ? ACCENT : messageColor;
  }
  helpBar.content = fit(" " + (compact() ? HELP_SHORT[view] : HELP[view]), w);
}

const LIST_HELP_SHORT = "↑↓ move · Enter open · Esc menu · ←→ section · q";
const LIST_HELP =
  "↑↓ move (menu/list) · Enter open · Esc back to menu · ←→ switch section · r refresh · q quit";

const HELP_SHORT: Record<View, string> = {
  containers: LIST_HELP_SHORT,
  images: LIST_HELP_SHORT,
  pods: LIST_HELP_SHORT,
  volumes: LIST_HELP_SHORT,
  networks: LIST_HELP_SHORT,
  create: "↑↓/Tab field · Enter run · Esc back · ctrl+c",
  logs: "↑↓/PgUp · r reload · Esc back · q",
  help: "Esc back · q quit",
};

const HELP: Record<View, string> = {
  containers: LIST_HELP,
  images: LIST_HELP,
  pods: LIST_HELP,
  volumes: LIST_HELP,
  networks: LIST_HELP,
  create: "↑↓ / Tab next field · Enter run · Esc back to list · ctrl+c quit",
  logs: "↑↓ / PgUp / PgDn scroll log · r reload · Esc back · q quit",
  help: "Esc back to previous section · ↑↓ pick section · 1..8 jump · click menu · q quit",
};

function renderTop() {
  const running = containers.filter((c) => c.State === "running").length;
  const full =
    ` podman-cli` +
    `   machine: ${machine}` +
    `   |   ${containers.length} containers (${running} up)` +
    `   ·   ${images.length} images` +
    `   ·   ${pods.length} pods` +
    `   ·   ${volumes.length} volumes` +
    `   ·   ${networks.length} networks`;
  const short = ` podman-cli · ${machine} · ${running}/${containers.length}c · ${images.length}i · ${pods.length}p · ${volumes.length}v · ${networks.length}n`;
  const w = terminalSize().w;
  topBar.content = fit(compact() ? short : full, w);
}

function counts(v: View): string {
  if (v === "containers") return String(containers.length);
  if (v === "images") return String(images.length);
  if (v === "pods") return String(pods.length);
  if (v === "volumes") return String(volumes.length);
  if (v === "networks") return String(networks.length);
  return "";
}

function renderMenu() {
  const inner = menuInner;
  const narrow = compact();
  // Short terminal: hide group headers + separators so the 7 menu rows still fit.
  const showGroups = terminalSize().h - 5 >= 10;

  for (const head of menuHeaders) head.visible = showGroups;
  for (const sep of menuSeparators) {
    sep.content = "─".repeat(inner);
    sep.visible = showGroups;
  }

  MENU.forEach((item, index) => {
    const el = menuRows[index];
    if (!el) return;
    const active = index === menuIndex;
    const count = counts(item.view);
    const room = inner - 2 - (count ? count.length + 1 : 0);
    el.label.content = (active ? "▶ " : "  ") + fit(narrow ? item.short : item.label, room);
    el.label.fg = active ? ACCENT : FG;
    el.count.content = count;
    el.count.visible = count.length > 0;
    el.count.fg = active ? ACCENT : DIM;
    const selectedBg = active && isMenuZone() ? MENU_SELECT_BG : PANEL_BG;
    el.row.backgroundColor = menuHover === item.view ? MENU_HOVER_BG : selectedBg;
  });

  const selected = menuRows[menuIndex];
  if (selected) menuScroll.scrollChildIntoView(selected.row.id);
}

// Zona menu aktif kalau panel kiri yang pegang fokus (view form tetap menyorot menu).
function isMenuZone(): boolean {
  return view !== "create" && zone === "menu";
}

function setMainContent(r: Renderable) {
  for (const c of mainContent.getChildren()) mainContent.remove(c);
  mainContent.add(r);
}

function focusCurrent() {
  if (view === "create") {
    listSelect.blur();
    createInputs.image?.focus();
    renderZone();
    return;
  }
  if (isMenuZone() || !isListView(view)) listSelect.blur();
  else listSelect.focus();
  renderMenu();
  renderZone();
}

function renderZone() {
  const menuActive = isMenuZone();
  const listActive = isListView(view) && zone === "list";
  sidebar.borderColor = menuActive ? ACCENT : BORDER;
  sidebar.titleColor = menuActive ? ACCENT : DIM;
  mainContent.borderColor = listActive ? ACCENT : BORDER;
}

function activeList(): SelectRenderable {
  return listSelect;
}

async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  busy++;
  renderBottom();
  setMessage(label + "…", ACCENT);
  try {
    return await fn();
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    logEvent("error", "ui", `${label}: ${text}`);
    setMessage(text, ERR);
    return undefined;
  } finally {
    busy--;
    renderBottom();
  }
}

// ── overlay / modals ─────────────────────────────────────────────────────────
function closeOverlay() {
  if (overlay) {
    root.remove(overlay);
    overlay = null;
  }
  pendingConfirm = null;
  renderBottom();
  focusCurrent();
}

function openOverlay(
  title: string,
  width: number,
  height: number,
  build: (panel: BoxRenderable) => void,
) {
  closeOverlay();
  const wrap = new BoxRenderable(renderer, {
    id: "overlay",
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  });
  const { w, h } = terminalSize();
  const panel = new BoxRenderable(renderer, {
    id: "overlay-panel",
    width: Math.max(20, Math.min(width, w - 2)),
    height: Math.max(4, Math.min(height, h - 2)),
    border: true,
    borderStyle: "rounded",
    borderColor: ACCENT,
    title: ` ${title} `,
    titleColor: ACCENT,
    backgroundColor: PANEL_BG,
    flexDirection: "column",
    paddingX: 1,
  });
  build(panel);
  wrap.add(panel);
  root.add(wrap);
  overlay = wrap;
}

function openConfirm(text: string, action: () => Promise<void>) {
  openOverlay("Confirm", Math.min(70, text.length + 8), 5, (panel) => {
    panel.add(new TextRenderable(renderer, { content: text, fg: WARN }));
    panel.add(
      new TextRenderable(renderer, { content: "\n  y = yes    n / Esc = cancel", fg: DIM }),
    );
  });
  pendingConfirm = action;
  renderBottom();
}

function openActions(title: string, actions: { label: string; run: () => void }[]) {
  const options = [
    ...actions.map((a) => ({ name: a.label, description: "" })),
    { name: "Cancel", description: "" },
  ];
  let select: SelectRenderable;
  openOverlay(title, 44, Math.min(options.length + 3, 16), (panel) => {
    select = new SelectRenderable(renderer, {
      id: "actions",
      width: "100%",
      flexGrow: 1,
      options,
      showDescription: false,
    });
    select.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
      const chosen = actions[index];
      closeOverlay();
      if (chosen) chosen.run();
    });
    panel.add(select);
  });
  (select! as SelectRenderable).focus();
}

function openLogs(name: string, text: string) {
  openOverlay(`Logs · ${name}`, 90, 20, (panel) => {
    const sb = new ScrollBoxRenderable(renderer, {
      id: "logScroll",
      width: "100%",
      flexGrow: 1,
      stickyScroll: true,
      stickyStart: "bottom",
    });
    sb.add(new TextRenderable(renderer, { content: text }));
    panel.add(sb);
  });
  setMessage("logs: Esc to close", DIM);
}

function openInput(title: string, placeholder: string, onSubmit: (value: string) => void) {
  let input: InputRenderable;
  openOverlay(title, 70, 5, (panel) => {
    panel.add(new TextRenderable(renderer, { content: "Enter to confirm · Esc to cancel", fg: DIM }));
    input = new InputRenderable(renderer, {
      id: "modal-input",
      width: "100%",
      placeholder,
    });
    input.on(InputRenderableEvents.ENTER, () => {
      const v = input.value.trim();
      closeOverlay();
      if (v) onSubmit(v);
    });
    panel.add(input);
  });
  (input! as InputRenderable).focus();
}

// ── data ─────────────────────────────────────────────────────────────────────
async function loadAll() {
  machine = await machineStatus();
  const [c, i, p, v, n] = await Promise.all([
    listContainers(),
    listImages(),
    listPods(),
    listVolumes(),
    listNetworks(),
  ]);
  containers = c;
  images = i;
  pods = p;
  volumes = v;
  networks = n;
  renderTop();
  renderMenu();
  renderList();
  renderDetails();
}

async function refresh(quiet = false) {
  const prev = message;
  const prevColor = messageColor;
  if (quiet) {
    try {
      await loadAll();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e), ERR);
      return;
    }
    setMessage(prev, prevColor);
  } else {
    await run("loading data", async () => {
      await loadAll();
      setMessage(`loaded: ${containers.length} containers, ${images.length} images`, OK);
    });
  }
  if (machine !== "running") setMessage(`machine ${machine} · press m to start`, WARN);
}

function renderList() {
  const idx = activeList().getSelectedIndex();
  let options: SelectOption[] = [];
  if (view === "containers") {
    options = containers.map((c) => ({
      name: `${icon(c.State)} ${containerName(c).padEnd(22)} ${c.Image}`,
      description: formatPorts(c.Ports) + (c.PodName ? `   [pod ${c.PodName}]` : ""),
    }));
  } else if (view === "images") {
    options = images.map((i) => ({
      name: `${imageRef(i).padEnd(46)} ${humanSize(i.Size)}`,
      description: `${i.Containers} container · ${i.CreatedAt}`,
    }));
  } else if (view === "pods") {
    options = pods.map((p) => ({
      name: `${icon(p.Status)} ${p.Name}`,
      description: `${p.Containers?.length ?? 0} container`,
    }));
  } else if (view === "volumes") {
    options = volumes.map((v) => ({
      name: `${v.Name}`,
      description: `${v.Driver} · ${v.MountCount} mount · ${v.Mountpoint}`,
    }));
  } else if (view === "networks") {
    options = networks.map((n) => ({
      name: `${n.name}`,
      description: `${n.driver} · ${n.subnets?.[0]?.subnet ?? "-"}${n.internal ? " · internal" : ""}`,
    }));
  }
  if (!options.length) options = [{ name: "(empty)", description: "" }];
  activeList().options = options;
  activeList().setSelectedIndex(Math.min(idx < 0 ? 0 : idx, options.length - 1));
}

function icon(state: string): string {
  const s = (state ?? "").toLowerCase();
  if (s === "running" || s === "up") return "●";
  if (s.startsWith("exit") || s === "exited") return "○";
  return "·";
}

function renderDetails() {
  const i = activeList().getSelectedIndex();
  let lines: string[] = [];
  if (view === "containers") {
    const c = containers[i];
    if (c) {
      lines = [
        `name    ${containerName(c)}`,
        `image   ${c.Image}`,
        `state   ${c.State}   ${c.Status ?? ""}`,
        `ports   ${formatPorts(c.Ports) || "-"}`,
        `pod     ${c.PodName || "-"}     id ${c.Id.slice(0, 12)}`,
      ];
    }
  } else if (view === "images") {
    const im = images[i];
    if (im) {
      lines = [
        `ref     ${imageRef(im)}`,
        `size    ${humanSize(im.Size)}`,
        `used by ${im.Containers} container`,
        `created ${im.CreatedAt}`,
        `id      ${im.Id.slice(7, 19)}`,
      ];
    }
  } else if (view === "pods") {
    const p = pods[i];
    if (p) {
      lines = [
        `name    ${p.Name}`,
        `status  ${p.Status}`,
        `members ${p.Containers?.map((c) => c.Names).join(", ") || "-"}`,
      ];
    }
  } else if (view === "volumes") {
    const v = volumes[i];
    if (v) {
      lines = [`name    ${v.Name}`, `driver  ${v.Driver}`, `mounts  ${v.MountCount}`, `path    ${v.Mountpoint}`];
    }
  } else if (view === "networks") {
    const n = networks[i];
    if (n) {
      lines = [
        `name    ${n.name}`,
        `driver  ${n.driver}`,
        `subnet  ${n.subnets?.map((s) => s.subnet).join(", ") || "-"}`,
        `id      ${n.id.slice(0, 12)}`,
      ];
    }
  }
  detailsText.content = lines.length ? lines.join("\n") : "(no items)";
}

// ── view switching ───────────────────────────────────────────────────────────
// Used by the keyboard (Enter / 1..8) and by sidebar clicks.
function activateMenu(next: View) {
  switchView(next);
  zone = isListView(next) ? "list" : "menu";
  focusCurrent();
}

async function loadLogView() {
  const text = await readLogTail();
  logText.content = text;
  logScroll.scrollTo({ x: 0, y: logScroll.scrollHeight });
}

function switchView(next: View) {
  if (view === next && next !== "create" && next !== "logs") {
    focusCurrent();
    return;
  }
  view = next;
  const mi = MENU.findIndex((m) => m.view === next);
  if (mi >= 0) menuIndex = mi;
  renderPanelTitle();
  if (next === "create") {
    setMainContent(createForm);
    syncDetails();
    createInputs.image?.focus();
  } else if (next === "logs") {
    logText.content = "loading log…";
    setMainContent(logScroll);
    zone = "menu";
    syncDetails();
    void loadLogView();
  } else if (next === "help") {
    helpText.content = HELP_TEXT;
    setMainContent(helpScroll);
    zone = "menu";
    syncDetails();
  } else {
    lastListView = next;
    setMainContent(listSelect);
    syncDetails();
    renderList();
    renderDetails();
  }
  renderMenu();
  focusCurrent();
  renderBottom();
}

const HELP_TEXT = [
  "  NAVIGATION",
  "    ↑ / ↓          move inside the active zone (lit border = active)",
  "    Enter          menu: open that section · list: open the action menu",
  "    Esc            list → menu · Help / Logs / Form → previous section",
  "    Tab            switch zone (menu ⇄ list)",
  "    ← / →  (h/l)   switch data section (Containers → … → Networks)",
  "    1..5           jump straight to a data section",
  "    6 / 7 / 8      New container / Logs / Help",
  "    r              refresh data (in Logs: reload the log file)",
  "    m              start the Podman machine (when stopped)",
  "    q / ctrl+c     quit",
  "",
  "  MOUSE",
  "    left click menu row        switch section",
  "    hover                      highlight a menu row",
  "    scroll wheel               scroll menu / list / log",
  "",
  "  SCREEN",
  "    Left     grouped menu: RESOURCES (data) + TOOLS (actions)",
  "             active row marked ▶ with the item count on the right",
  "    Middle   items of the active section",
  "    Bottom   details of the selected item",
  "    Popup    action menu / y-n confirm / container logs",
  "",
  "  LOGS",
  "    Content: every podman command (+ exit code & duration), UI errors, start/quit.",
  `    Path: ${LOG_PATH}`,
  "",
  "  NEW CONTAINER",
  "    ↑ / ↓ or Tab    next field",
  "    Enter           run `podman run -d`",
  "    Esc             back to the list",
  "",
  "  NOTE",
  "    Every remove action asks for y/n confirmation first.",
].join("\n");

// ── actions per view ─────────────────────────────────────────────────────────
function selectedContainer(): Container | undefined {
  return containers[listSelect.getSelectedIndex()];
}
function selectedImage(): ImageInfo | undefined {
  return images[listSelect.getSelectedIndex()];
}
function selectedPod(): Pod | undefined {
  return pods[listSelect.getSelectedIndex()];
}
function selectedVolume(): Volume | undefined {
  return volumes[listSelect.getSelectedIndex()];
}
function selectedNetwork(): Network | undefined {
  return networks[listSelect.getSelectedIndex()];
}

async function doContainerAction(a: "start" | "stop" | "restart") {
  const c = selectedContainer();
  if (!c) return;
  await run(`${a} ${containerName(c)}`, async () => {
    const r = await containerAction(a, c.Id);
    if (r.code !== 0) throw new Error(r.stderr.trim());
    setMessage(`${containerName(c)}: ${a} ok`, OK);
  });
  await refresh(true);
}

function askRemoveContainer() {
  const c = selectedContainer();
  if (!c) return;
  const name = containerName(c);
  openConfirm(`Remove container "${name}"? (podman rm -f)`, async () => {
    await run(`remove ${name}`, async () => {
      const r = await containerAction("rm", c.Id);
      if (r.code !== 0) throw new Error(r.stderr.trim());
      setMessage(`${name} removed`, OK);
    });
    await refresh(true);
  });
}

function askRemoveImage() {
  const i = selectedImage();
  if (!i) return;
  const ref = imageRef(i);
  openConfirm(`Remove image "${ref}"? (podman rmi -f)`, async () => {
    await run(`remove image ${ref}`, async () => {
      const r = await removeImage(ref);
      if (r.code !== 0) throw new Error(r.stderr.trim());
      setMessage(`image ${ref} removed`, OK);
    });
    await refresh(true);
  });
}

function askRemovePod() {
  const p = selectedPod();
  if (!p) return;
  openConfirm(`Remove pod "${p.Name}"? (podman pod rm -f)`, async () => {
    await run(`remove pod ${p.Name}`, async () => {
      const r = await podAction("rm", p.Name);
      if (r.code !== 0) throw new Error(r.stderr.trim());
      setMessage(`pod ${p.Name} removed`, OK);
    });
    await refresh(true);
  });
}

function askRemoveVolume() {
  const v = selectedVolume();
  if (!v) return;
  openConfirm(`Remove volume "${v.Name}"? its data goes with it.`, async () => {
    await run(`remove volume ${v.Name}`, async () => {
      const r = await removeVolume(v.Name);
      if (r.code !== 0) throw new Error(r.stderr.trim());
      setMessage(`volume ${v.Name} removed`, OK);
    });
    await refresh(true);
  });
}

function askRemoveNetwork() {
  const n = selectedNetwork();
  if (!n) return;
  openConfirm(`Remove network "${n.name}"?`, async () => {
    await run(`remove network ${n.name}`, async () => {
      const r = await removeNetwork(n.name);
      if (r.code !== 0) throw new Error(r.stderr.trim());
      setMessage(`network ${n.name} removed`, OK);
    });
    await refresh(true);
  });
}

async function showLogs(c: Container) {
  const name = containerName(c);
  const r = await run(`logs ${name}`, async () => containerLogs(c.Id));
  if (!r) return;
  openLogs(name, (r.stdout + r.stderr).trim() || "(no output)");
}

function openListActions() {
  if (view === "containers") {
    const c = selectedContainer();
    if (!c) return;
    openActions(`Container · ${containerName(c)}`, [
      { label: "Start", run: () => void doContainerAction("start") },
      { label: "Stop", run: () => void doContainerAction("stop") },
      { label: "Restart", run: () => void doContainerAction("restart") },
      { label: "Logs", run: () => void showLogs(c) },
      { label: "Remove", run: askRemoveContainer },
    ]);
  } else if (view === "images") {
    const i = selectedImage();
    if (!i) return;
    openActions(`Image · ${imageRef(i)}`, [
      { label: "Run container from this image", run: () => prefillCreate(i) },
      { label: "Pull / update image", run: () => askPull() },
      { label: "Remove", run: askRemoveImage },
    ]);
  } else if (view === "pods") {
    const p = selectedPod();
    if (!p) return;
    openActions(`Pod · ${p.Name}`, [
      { label: "Start", run: () => void doPodAction("start") },
      { label: "Stop", run: () => void doPodAction("stop") },
      { label: "Remove", run: askRemovePod },
    ]);
  } else if (view === "volumes") {
    const v = selectedVolume();
    if (!v) return;
    openActions(`Volume · ${v.Name}`, [{ label: "Remove", run: askRemoveVolume }]);
  } else if (view === "networks") {
    const n = selectedNetwork();
    if (!n) return;
    openActions(`Network · ${n.name}`, [{ label: "Remove", run: askRemoveNetwork }]);
  }
}

async function doPodAction(a: "start" | "stop") {
  const p = selectedPod();
  if (!p) return;
  await run(`${a} pod ${p.Name}`, async () => {
    const r = await podAction(a, p.Name);
    if (r.code !== 0) throw new Error(r.stderr.trim());
    setMessage(`pod ${p.Name}: ${a} ok`, OK);
  });
  await refresh(true);
}

function askPull() {
  openInput("Pull image", "docker.io/library/alpine:latest", async (ref) => {
    await run(`pull ${ref}`, async () => {
      const r = await pullImage(ref);
      if (r.code !== 0) throw new Error(r.stderr.trim());
      setMessage(`pulled ${ref}`, OK);
    });
    await refresh(true);
  });
}

function prefillCreate(i: ImageInfo) {
  switchView("create");
  createInputs.image!.value = imageRef(i);
  createInputs.name!.value = "";
  setMessage(`image prefilled: ${imageRef(i)} · fill the rest and press Enter`, OK);
}

// ── create form ──────────────────────────────────────────────────────────────
function splitList(v: string): string[] {
  return v
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function submitCreate() {
  let created = false;
  const image = createInputs.image!.value.trim();
  if (!image) {
    setMessage("image is required", ERR);
    return;
  }
  const name = createInputs.name!.value.trim();
  await run(`run ${image}`, async () => {
    const r = await runContainer({
      image,
      name: name || undefined,
      ports: splitList(createInputs.ports!.value),
      volumes: splitList(createInputs.volumes!.value),
      env: splitList(createInputs.env!.value),
      restart: createInputs.restart!.value.trim() || undefined,
      command: splitList(createInputs.command!.value),
    });
    if (r.code !== 0) throw new Error(r.stderr.trim());
    setMessage(`container started: ${r.stdout.trim().slice(0, 12) || image}`, OK);
    created = true;
  });
  await refresh(true);
  if (created) {
    for (const f of CREATE_FIELDS) createInputs[f.id]!.value = "";
    switchView("containers");
    zone = "list";
    focusCurrent();
  }
}

function cycleCreateField(dir: 1 | -1) {
  const ids = CREATE_FIELDS.map((f) => f.id);
  const activeId = ids.find((id) => createInputs[id]!.focused);
  const idx = activeId ? ids.indexOf(activeId) : 0;
  createInputs[ids[(idx + dir + ids.length) % ids.length]!]!.focus();
}

// ── events ───────────────────────────────────────────────────────────────────
function moveSelection(dir: 1 | -1) {
  if (zone === "menu" || !isListView(view)) {
    menuIndex = (menuIndex + dir + MENU.length) % MENU.length;
    renderMenu();
    return;
  }
  const n = listSelect.options.length;
  if (!n) return;
  const i = listSelect.getSelectedIndex();
  listSelect.setSelectedIndex((i + dir + n) % n);
  renderDetails();
}

// ←/→ only cycles the data sections; New container/Logs/Help go through the menu or 1..8.
function cycleView(dir: 1 | -1) {
  const i = LIST_VIEWS.indexOf(view);
  const from = i < 0 ? (dir === 1 ? -1 : 0) : i;
  const next = LIST_VIEWS[(from + dir + LIST_VIEWS.length) % LIST_VIEWS.length]!;
  zone = "list";
  switchView(next);
}

renderer.keyInput.on("keypress", (key: KeyEvent) => {
  if (pendingConfirm) {
    if (key.name === "y") {
      const act = pendingConfirm;
      closeOverlay();
      void act();
    } else if (key.name === "n" || key.name === "escape") {
      closeOverlay();
      setMessage("cancelled", DIM);
    }
    key.stopPropagation();
    return;
  }

  if (overlay) {
    if (key.name === "escape") {
      closeOverlay();
      setMessage("", DIM);
    }
    return;
  }

  if (view === "create") {
    if (key.name === "escape") {
      switchView(lastListView);
      zone = "list";
      focusCurrent();
      key.stopPropagation();
      return;
    }
    if (key.name === "tab") {
      cycleCreateField(key.shift ? -1 : 1);
      key.stopPropagation();
      return;
    }
    if (key.name === "up") {
      cycleCreateField(-1);
      key.stopPropagation();
      return;
    }
    if (key.name === "down") {
      cycleCreateField(1);
      key.stopPropagation();
      return;
    }
    return;
  }

  if (key.name === "tab") {
    if (!isListView(view)) return;
    zone = zone === "menu" ? "list" : "menu";
    focusCurrent();
    key.stopPropagation();
    return;
  }

  if (key.name === "right" || key.name === "l") {
    cycleView(1);
    key.stopPropagation();
    return;
  }

  if (key.name === "left" || key.name === "h") {
    cycleView(-1);
    key.stopPropagation();
    return;
  }

  if (key.name === "up" || key.name === "k") {
    moveSelection(-1);
    key.stopPropagation();
    return;
  }

  if (key.name === "down" || key.name === "j") {
    moveSelection(1);
    key.stopPropagation();
    return;
  }

  if (key.name === "return" || key.name === "enter") {
    if (zone === "menu" || !isListView(view)) {
      const m = MENU[menuIndex];
      if (m) activateMenu(m.view);
    } else {
      openListActions();
    }
    key.stopPropagation();
    return;
  }

  if (/^[1-8]$/.test(key.name)) {
    const m = MENU[Number(key.name) - 1];
    if (m) activateMenu(m.view);
    key.stopPropagation();
    return;
  }

  if (key.name === "r") {
    if (view === "logs") void loadLogView();
    else void refresh();
    key.stopPropagation();
    return;
  }

  if (key.name === "escape") {
    if (isListView(view) && zone === "list") {
      zone = "menu";
      focusCurrent();
      key.stopPropagation();
      return;
    }
    if (!isListView(view)) {
      switchView(lastListView);
      zone = "menu";
      focusCurrent();
      key.stopPropagation();
    }
    return;
  }

  if (key.name === "m" && machine !== "running") {
    void run("start machine", async () => {
      const r = await startMachine();
      if (r.code !== 0) throw new Error(r.stderr.trim());
    }).then(() => refresh());
    key.stopPropagation();
    return;
  }

  if (key.name === "q") {
    logEvent("info", "app", "quit");
    renderer.destroy();
    return;
  }
});

// ── boot ─────────────────────────────────────────────────────────────────────
applyLayout();
// terminalWidth bisa belum ter-update saat event resize datang → hitung ulang sekali lagi.
renderer.on("resize", () => {
  applyLayout();
  setTimeout(applyLayout, 0);
});
switchView("containers");
zone = "menu";
focusCurrent();
logEvent("info", "app", `start · log ${LOG_PATH}`);
renderer.start();
await refresh();
logEvent(
  "info",
  "app",
  `machine=${machine} · ${containers.length} containers, ${images.length} images, ${pods.length} pods, ${volumes.length} volumes, ${networks.length} networks`,
);
