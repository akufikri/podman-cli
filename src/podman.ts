// Thin typed wrappers over the podman CLI. No shell strings - args passed as arrays.
import { logEvent } from "./log.ts";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ContainerPort {
  host_ip?: string;
  host_port: number;
  container_port: number;
  protocol: string;
}

export interface Container {
  Id: string;
  Names: string[] | null;
  Image: string;
  State: string;
  Status: string;
  Ports: ContainerPort[] | null;
  PodName?: string;
  CreatedAt?: string;
  ExitCode?: number;
}

export interface ImageInfo {
  Id: string;
  Repository: string;
  Tag: string;
  Size: number;
  Containers: number;
  Dangling: boolean;
  CreatedAt: string;
}

export interface Pod {
  Id: string;
  Name: string;
  Status: string;
  Containers?: { Names: string; Status: string }[] | null;
}

export interface Volume {
  Name: string;
  Driver: string;
  MountCount: number;
  CreatedAt: string;
  Mountpoint: string;
}

export interface Network {
  name: string;
  id: string;
  driver: string;
  internal?: boolean;
  subnets?: { subnet: string; gateway?: string }[] | null;
}

export interface RunOptions {
  image: string;
  name?: string;
  ports?: string[];
  volumes?: string[];
  env?: string[];
  restart?: string;
  detach?: boolean;
  command?: string[];
}

export async function podman(args: string[]): Promise<ExecResult> {
  const started = performance.now();
  const proc = Bun.spawn(["podman", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  const ms = Math.round(performance.now() - started);
  const cmd = `podman ${args.join(" ")}`;
  if (code === 0) logEvent("info", "podman", `${cmd} → 0 (${ms}ms)`);
  else logEvent("error", "podman", `${cmd} → ${code} (${ms}ms): ${stderr.trim() || "(no stderr)"}`);
  return { code, stdout, stderr };
}

async function podmanJson<T>(args: string[]): Promise<T[]> {
  const r = await podman(args);
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || `podman ${args.join(" ")} failed`);
  }
  const text = r.stdout.trim();
  if (!text) return [];
  return JSON.parse(text) as T[];
}

export function machineStatus(): Promise<"running" | "stopped" | "unknown"> {
  return podman(["machine", "inspect", "--format", "{{.State}}"])
    .then((r) => {
      const s = r.stdout.trim() as "running" | "stopped";
      return r.code === 0 && (s === "running" || s === "stopped") ? s : "unknown";
    })
    .catch(() => "unknown" as const);
}

export const startMachine = () => podman(["machine", "start"]);
export const listContainers = (all = true) =>
  podmanJson<Container>(["ps", ...(all ? ["-a"] : []), "--format", "json"]);
export const listImages = () => podmanJson<ImageInfo>(["images", "--format", "json"]);
export const listPods = () => podmanJson<Pod>(["pod", "ps", "--format", "json"]);
export const listVolumes = () => podmanJson<Volume>(["volume", "ls", "--format", "json"]);
export const listNetworks = () => podmanJson<Network>(["network", "ls", "--format", "json"]);

export const removeVolume = (name: string) => podman(["volume", "rm", "-f", name]);
export const removeNetwork = (name: string) => podman(["network", "rm", "-f", name]);

export const containerAction = (
  action: "start" | "stop" | "restart" | "rm",
  id: string,
) => podman([action, ...(action === "rm" ? ["-f"] : []), id]);

export const containerLogs = (id: string, tail = 200) =>
  podman(["logs", "--tail", String(tail), id]);

export const pullImage = (ref: string) => podman(["pull", ref]);
export const removeImage = (ref: string) => podman(["rmi", "-f", ref]);
export const podAction = (action: "start" | "stop" | "rm", name: string) =>
  podman(["pod", action, ...(action === "rm" ? ["-f"] : []), name]);

export function runContainer(o: RunOptions): Promise<ExecResult> {
  const args = ["run"];
  if (o.detach !== false) args.push("-d");
  if (o.name) args.push("--name", o.name);
  if (o.restart) args.push("--restart", o.restart);
  for (const p of o.ports ?? []) args.push("-p", p);
  for (const v of o.volumes ?? []) args.push("-v", v);
  for (const e of o.env ?? []) args.push("-e", e);
  args.push(o.image, ...(o.command ?? []));
  return podman(args);
}

export function humanSize(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function containerName(c: Container): string {
  return c.Names?.[0] ?? c.Id.slice(0, 12);
}

export function imageRef(i: ImageInfo): string {
  return i.Repository === "<none>" ? i.Id.slice(7, 19) : `${i.Repository}:${i.Tag}`;
}

export function formatPorts(ports: ContainerPort[] | null): string {
  if (!ports?.length) return "";
  return ports.map((p) => `${p.host_port}->${p.container_port}/${p.protocol}`).join(", ");
}

// bun src/podman.ts containers | images | pods | machine  (debug, no TUI)
if (import.meta.main) {
  const cmd = process.argv[2] ?? "containers";
  try {
    if (cmd === "machine") console.log(await machineStatus());
    else if (cmd === "containers") {
      for (const c of await listContainers()) {
        console.log(`${containerName(c)}\t${c.State}\t${c.Image}\t${formatPorts(c.Ports)}`);
      }
    } else if (cmd === "images") {
      for (const i of await listImages()) console.log(`${imageRef(i)}\t${humanSize(i.Size)}`);
    } else if (cmd === "pods") {
      for (const p of await listPods()) console.log(`${p.Name}\t${p.Status}`);
    } else if (cmd === "volumes") {
      for (const v of await listVolumes()) console.log(`${v.Name}\t${v.Driver}\t${v.MountCount} mounts`);
    } else if (cmd === "networks") {
      for (const n of await listNetworks()) console.log(`${n.name}\t${n.driver}\t${n.subnets?.[0]?.subnet ?? ""}`);
    } else {
      console.error(`unknown: ${cmd}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
