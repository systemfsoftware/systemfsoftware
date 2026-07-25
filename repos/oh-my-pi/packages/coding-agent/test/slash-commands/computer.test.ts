import { describe, expect, it, vi } from "bun:test";
import { executeAcpBuiltinSlashCommand } from "@oh-my-pi/pi-coding-agent/slash-commands/acp-builtins";
import type { SlashCommandRuntime } from "@oh-my-pi/pi-coding-agent/slash-commands/types";

function acpRuntime(options?: { enabled?: boolean; applyResult?: boolean }) {
	const store = { "computer.enabled": options?.enabled ?? false };
	const get = vi.fn((path: string) => store[path as keyof typeof store]);
	const override = vi.fn((path: string, value: boolean) => {
		store[path as keyof typeof store] = value;
	});
	const set = vi.fn();
	const setComputerToolEnabled = vi.fn(async () => options?.applyResult ?? true);
	const output = vi.fn();
	const runtime = {
		session: { settings: { get, override, set }, setComputerToolEnabled },
		output,
	} as unknown as SlashCommandRuntime;
	return { get, override, set, setComputerToolEnabled, output, runtime };
}

describe("/computer slash command", () => {
	it("toggles a disabled session on: slate refresh first, then session-only override", async () => {
		const h = acpRuntime({ enabled: false });

		const result = await executeAcpBuiltinSlashCommand("/computer", h.runtime);

		expect(result).toEqual({ consumed: true });
		expect(h.setComputerToolEnabled).toHaveBeenCalledWith(true);
		expect(h.override).toHaveBeenCalledWith("computer.enabled", true);
		expect(h.set).not.toHaveBeenCalled();
		expect(h.output).toHaveBeenCalledWith("Computer use enabled for this session.");
	});

	it("toggles an enabled session off", async () => {
		const h = acpRuntime({ enabled: true });

		await executeAcpBuiltinSlashCommand("/computer", h.runtime);

		expect(h.setComputerToolEnabled).toHaveBeenCalledWith(false);
		expect(h.override).toHaveBeenCalledWith("computer.enabled", false);
		expect(h.output).toHaveBeenCalledWith("Computer use disabled for this session.");
	});

	it("honors explicit on/off regardless of current state", async () => {
		const on = acpRuntime({ enabled: true });
		await executeAcpBuiltinSlashCommand("/computer on", on.runtime);
		expect(on.setComputerToolEnabled).toHaveBeenCalledWith(true);
		expect(on.override).toHaveBeenCalledWith("computer.enabled", true);

		const off = acpRuntime({ enabled: false });
		await executeAcpBuiltinSlashCommand("/computer off", off.runtime);
		expect(off.setComputerToolEnabled).toHaveBeenCalledWith(false);
		expect(off.override).toHaveBeenCalledWith("computer.enabled", false);
	});

	it("reports status without touching the tool slate or settings", async () => {
		const h = acpRuntime({ enabled: true });

		await executeAcpBuiltinSlashCommand("/computer status", h.runtime);

		expect(h.setComputerToolEnabled).not.toHaveBeenCalled();
		expect(h.override).not.toHaveBeenCalled();
		expect(h.output).toHaveBeenCalledWith("Computer use is on.");
	});

	it("leaves the override untouched when the session cannot build the tool", async () => {
		const h = acpRuntime({ enabled: false, applyResult: false });

		await executeAcpBuiltinSlashCommand("/computer on", h.runtime);

		expect(h.setComputerToolEnabled).toHaveBeenCalledWith(true);
		expect(h.override).not.toHaveBeenCalled();
		expect(h.output).toHaveBeenCalledWith("Computer use is unavailable in this session.");
	});

	it("rejects unknown arguments with usage", async () => {
		const h = acpRuntime();

		await executeAcpBuiltinSlashCommand("/computer bogus", h.runtime);

		expect(h.setComputerToolEnabled).not.toHaveBeenCalled();
		expect(h.output).toHaveBeenCalledWith("Usage: /computer [on|off|status]");
	});
});
