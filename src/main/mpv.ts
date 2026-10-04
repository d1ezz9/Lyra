import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** mpv controlled via --input-ipc-server JSON IPC. Gapless via playlist append. */
export class MpvPlayer {
  private proc: ChildProcess | null = null;
  private sockPath: string;
  private seq = 0;
  private pending = new Map<number, (v: unknown) => void>();
  private conn: net.Socket | null = null;
  private buf = '';
  onEvent: (name: string, value: unknown) => void = () => {};

  constructor() {
    this.sockPath = path.join(os.tmpdir(), `lyra-mpv-${process.pid}.sock`);
  }

  start(): void {
    if (this.proc) return;
    try { fs.unlinkSync(this.sockPath); } catch { /* noop */ }
    this.proc = spawn('mpv', [
      '--idle=yes', '--no-video', '--no-terminal',
      `--input-ipc-server=${this.sockPath}`,
      '--gapless-audio=yes', '--audio-display=no',
    ], { stdio: 'ignore' });
    this.proc.on('exit', () => { this.proc = null; });
    this.connectLoop();
  }

  private connectLoop(): void {
    const tryConnect = () => {
      if (this.conn || !this.proc) return;
      const s = net.connect(this.sockPath);
      s.on('connect', () => { this.conn = s; this.observe(); });
      s.on('data', (d) => this.onData(d.toString()));
      s.on('error', () => { this.conn = null; setTimeout(tryConnect, 300); });
      s.on('close', () => { this.conn = null; });
    };
    setTimeout(tryConnect, 400);
  }

  private onData(chunk: string): void {
    this.buf += chunk;
    let i: number;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as { request_id?: number; data?: unknown; event?: string; name?: string; value?: unknown };
        if (msg.request_id !== undefined) this.pending.get(msg.request_id)?.(msg.data);
        else if (msg.event === 'property-change') this.onEvent(msg.name ?? '', msg.data ?? msg.value);
        else if (msg.event) this.onEvent(msg.event, msg);
      } catch { /* ignore */ }
    }
  }

  private cmd(command: unknown[]): Promise<{ data?: unknown; error?: string }> {
    return new Promise((resolve) => {
      if (!this.conn) { resolve({ error: 'no-connection' }); return; }
      const id = ++this.seq;
      this.pending.set(id, (v) => { this.pending.delete(id); resolve({ data: v }); });
      this.conn.write(JSON.stringify({ command, request_id: id }) + '\n');
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); resolve({ error: 'timeout' }); } }, 5000);
    });
  }

  /** Wait until IPC socket is connected (mpv still starting). */
  private async ensureConnected(timeoutMs = 8000): Promise<boolean> {
    this.start();
    const t0 = Date.now();
    while (!this.conn && Date.now() - t0 < timeoutMs) {
      await new Promise((r) => setTimeout(r, 200));
    }
    return !!this.conn;
  }

  private observe(): void {
    for (const p of ['time-pos', 'duration', 'pause', 'volume', 'eof-reached']) {
      this.conn?.write(JSON.stringify({ command: ['observe_property', 1, p] }) + '\n');
    }
  }

  async load(url: string): Promise<void> {
    const ok = await this.ensureConnected();
    if (!ok) throw new Error('mpv did not start');
    const r = await this.cmd(['loadfile', url, 'replace']);
    if (r.error === 'timeout' || r.error === 'no-connection') throw new Error(`mpv: ${r.error}`);
    // mpv keeps the previous pause state across loadfile — always start audibly
    await this.cmd(['set_property', 'pause', false]);
  }
  async enqueue(url: string): Promise<void> { await this.cmd(['loadfile', url, 'append']); }
  /** Cut current audio immediately (called before resolving the next track). */
  async halt(): Promise<void> { await this.cmd(['stop']); }
  async toggle(): Promise<void> { await this.cmd(['cycle', 'pause']); }
  async play(): Promise<void> { await this.cmd(['set_property', 'pause', false]); }
  async pause(): Promise<void> { await this.cmd(['set_property', 'pause', true]); }
  async next(): Promise<void> { await this.cmd(['playlist-next']); }
  async prev(): Promise<void> { await this.cmd(['playlist-prev']); }
  async seek(sec: number): Promise<void> { await this.cmd(['seek', sec, 'absolute']); }
  async seekRel(sec: number): Promise<void> { await this.cmd(['seek', sec, 'relative']); }
  async setVolume(v: number): Promise<void> { await this.cmd(['set_property', 'volume', v]); }
  async setReplayGain(on: boolean): Promise<void> { await this.cmd(['set_property', 'replaygain', on ? 'track' : 'no']); }
  stop(): void { this.proc?.kill(); this.proc = null; this.conn?.destroy(); this.conn = null; }
}
