/**
 * Regression: the agent hub row order must be stable while the hub is open.
 *
 * The hub is sorted by lastActivity on first open, but after that keyboard
 * selection must not jump around as agents heartbeat or update activity. New
 * agents that appear while the hub is open are appended at the end.
 */
import { afterEach, beforeAll, describe, expect, it, setSystemTime, vi } from "bun:test";
import { IrcBus } from "@oh-my-pi/pi-coding-agent/irc/bus";
import { AgentHubOverlayComponent } from "@oh-my-pi/pi-coding-agent/modes/components/agent-hub";
import { SessionObserverRegistry } from "@oh-my-pi/pi-coding-agent/modes/session-observer-registry";
import { initTheme } from "@oh-my-pi/pi-coding-agent/modes/theme/theme";
import { AgentRegistry } from "@oh-my-pi/pi-coding-agent/registry/agent-registry";
import type { AgentSession } from "@oh-my-pi/pi-coding-agent/session/agent-session";
import { visibleWidth } from "@oh-my-pi/pi-tui/utils";

interface GeometryStub {
	setRows(n: number): void;
	restore(): void;
}

function stubStdoutGeometry(cols: number): GeometryStub {
	const rowsDesc = Object.getOwnPropertyDescriptor(process.stdout, "rows");
	const colsDesc = Object.getOwnPropertyDescriptor(process.stdout, "columns");
	let rows = 24;
	Object.defineProperty(process.stdout, "rows", { configurable: true, get: () => rows, set: () => {} });
	Object.defineProperty(process.stdout, "columns", { configurable: true, get: () => cols, set: () => {} });
	const restoreOne = (key: "rows" | "columns", desc: PropertyDescriptor | undefined) => {
		if (desc) Object.defineProperty(process.stdout, key, desc);
		else Object.defineProperty(process.stdout, key, { configurable: true, value: undefined, writable: true });
	};
	return {
		setRows(n: number) {
			rows = n;
		},
		restore() {
			restoreOne("rows", rowsDesc);
			restoreOne("columns", colsDesc);
		},
	};
}

function makeHub(agents: AgentRegistry) {
	return new AgentHubOverlayComponent({
		observers: new SessionObserverRegistry(),
		hubKeys: [],
		onDone: () => {},
		requestRender: () => {},
		registry: agents,
		irc: new IrcBus(agents),
		focusAgent: async () => {},
	});
}

function renderedAgentIds(hub: AgentHubOverlayComponent): string[] {
	// Entry first lines are ` <cursor> <status-glyph> <id> …`; task lines are
	// indented deeper and chrome lines never carry the cursor slot.
	const ids: string[] = [];
	for (const raw of hub.render(120)) {
		const match = /^ (?:❯| ) (\S+) (\S+)/u.exec(Bun.stripANSI(raw));
		if (match) ids.push(match[2]!);
	}
	return ids;
}

describe("Agent hub row ordering", () => {
	let geometry: GeometryStub | undefined;

	beforeAll(async () => {
		await initTheme();
	});

	afterEach(() => {
		vi.useRealTimers();
		setSystemTime();
		vi.restoreAllMocks();
		geometry?.restore();
		geometry = undefined;
		AgentRegistry.resetGlobalForTests();
	});

	it("freezes the initial lastActivity order while the hub is open", () => {
		vi.useFakeTimers();
		let hub: AgentHubOverlayComponent | undefined;
		try {
			geometry = stubStdoutGeometry(120);
			const agents = new AgentRegistry();
			setSystemTime(1000);
			const sessionA = {} as AgentSession;
			agents.register({ id: "A", displayName: "Alpha", kind: "sub", session: sessionA });

			setSystemTime(2000);
			const sessionB = {} as AgentSession;
			agents.register({ id: "B", displayName: "Beta", kind: "sub", session: sessionB });

			setSystemTime(3000);
			const sessionC = {} as AgentSession;
			agents.register({ id: "C", displayName: "Gamma", kind: "sub", session: sessionC });

			hub = makeHub(agents);
			expect(renderedAgentIds(hub)).toEqual(["C", "B", "A"]);

			// Bump A's lastActivity far ahead of the others. The hub is already open,
			// so the captured order must not change.
			setSystemTime(4000);
			agents.setActivity("A", "still running");

			// Registering a new agent schedules a coalesced row refresh; the
			// existing rows must stay put once the scheduled refresh runs.
			setSystemTime(5000);
			const sessionD = {} as AgentSession;
			agents.register({ id: "D", displayName: "Delta", kind: "sub", session: sessionD });

			expect(renderedAgentIds(hub)).toEqual(["C", "B", "A"]);
			vi.advanceTimersByTime(100);
			expect(renderedAgentIds(hub)).toEqual(["C", "B", "A", "D"]);
		} finally {
			hub?.dispose();
			vi.useRealTimers();
			setSystemTime();
		}
	});

	it("bounds observer lookups and entry rendering to the viewport on large rosters", () => {
		geometry = stubStdoutGeometry(120);
		geometry.setRows(12);
		const agents = new AgentRegistry();
		for (let i = 0; i < 10_000; i++) {
			const id = `Agent-${i.toString().padStart(5, "0")}`;
			agents.register({ id, displayName: id, kind: "sub", session: null, status: "parked" });
		}

		const observers = new SessionObserverRegistry();
		const getSessions = vi.spyOn(observers, "getSessions");
		const getSession = vi.spyOn(observers, "getSession");
		const hub = new AgentHubOverlayComponent({
			observers,
			hubKeys: [],
			onDone: () => {},
			requestRender: () => {},
			registry: agents,
			irc: new IrcBus(agents),
			focusAgent: async () => {},
		});

		try {
			getSessions.mockClear();
			getSession.mockClear();
			const visibleIds = renderedAgentIds(hub);
			// rows=12 → line budget 5 for single-line parked rows; plus one failed
			// boundary probe past the window. Must not scale with the 10_000 roster.
			expect(visibleIds).toHaveLength(5);
			expect(getSessions).not.toHaveBeenCalled();
			expect(getSession.mock.calls.length).toBeLessThanOrEqual(8);
			expect(getSession.mock.calls.length).toBeGreaterThan(0);

			const text = Bun.stripANSI(hub.render(120).join("\n"));
			expect(text).toContain("10000 parked");
			expect(text).toMatch(/… \d+ more/);

			// Moving selection re-renders only the new viewport, not the whole roster.
			getSessions.mockClear();
			getSession.mockClear();
			hub.handleInput("j");
			const afterMove = renderedAgentIds(hub);
			expect(afterMove).toHaveLength(5);
			expect(afterMove).toContain(visibleIds[1]!);
			expect(getSessions).not.toHaveBeenCalled();
			expect(getSession.mock.calls.length).toBeLessThanOrEqual(8);
		} finally {
			hub.dispose();
		}
	});

	it("sizes the lazy viewport by real entry height when rows have a task line", () => {
		geometry = stubStdoutGeometry(120);
		geometry.setRows(12);
		const agents = new AgentRegistry();
		for (let i = 0; i < 100; i++) {
			const id = `TaskAgent-${i.toString().padStart(3, "0")}`;
			agents.register({
				id,
				displayName: id,
				kind: "sub",
				session: null,
				status: "parked",
			});
		}

		const observers = new SessionObserverRegistry();
		const getSession = vi.spyOn(observers, "getSession");
		const hub = new AgentHubOverlayComponent({
			observers,
			hubKeys: [],
			onDone: () => {},
			requestRender: () => {},
			registry: agents,
			irc: new IrcBus(agents),
			focusAgent: async () => {},
		});

		try {
			// Force a second task line via observer metadata so entry height is 2.
			getSession.mockImplementation((id: string) => ({
				id,
				kind: "subagent",
				label: "Subagent",
				status: "active",
				description: `task for ${id}`,
				lastUpdate: Date.now(),
			}));
			getSession.mockClear();
			const visibleIds = renderedAgentIds(hub);
			// Each entry is 2 lines; budget 5 → at most 2 full entries + probes.
			expect(visibleIds.length).toBeGreaterThan(0);
			expect(visibleIds.length).toBeLessThanOrEqual(3);
			expect(getSession.mock.calls.length).toBeLessThanOrEqual(6);
			const text = Bun.stripANSI(hub.render(120).join("\n"));
			expect(text).toContain("task for");
			expect(text).toContain(visibleIds[0]!);
		} finally {
			hub.dispose();
		}
	});

	it("truncates lines and sanitizes newlines to prevent terminal wrapping", () => {
		geometry = stubStdoutGeometry(80);
		const agents = new AgentRegistry();
		const sessionA = {} as AgentSession;
		agents.register({
			id: "RevAgentStream",
			displayName: "Agent runtime + compaction reviewer",
			kind: "sub",
			session: sessionA,
		});

		const observers = new SessionObserverRegistry();
		vi.spyOn(observers, "getSession").mockReturnValue({
			id: "RevAgentStream",
			kind: "subagent",
			label: "Subagent",
			status: "active",
			description: "Complete the assignment below, thoroughly:\n- check performance\n- check leaks",
			lastUpdate: Date.now(),
		});

		const hub = new AgentHubOverlayComponent({
			observers,
			hubKeys: [],
			onDone: () => {},
			requestRender: () => {},
			registry: agents,
			irc: new IrcBus(agents),
			focusAgent: async () => {},
		});

		const lines = hub.render(80);
		for (const line of lines) {
			const cleanLine = Bun.stripANSI(line);
			expect(cleanLine.includes("\n")).toBe(false);
			expect(cleanLine.includes("\r")).toBe(false);
			const width = visibleWidth(line);
			expect(width).toBeLessThanOrEqual(78);
		}

		hub.dispose();
	});

	it("flags a fallback badge for observer-only rows with no live session", () => {
		geometry = stubStdoutGeometry(120);
		const agents = new AgentRegistry();
		// A collab guest / observer-only row carries no live AgentSession, so the
		// badge must come from the executor-reported progress instead.
		agents.register({ id: "GuestAgent", displayName: "Guest Agent", kind: "sub", session: null });

		const observers = new SessionObserverRegistry();
		vi.spyOn(observers, "getSession").mockReturnValue({
			id: "GuestAgent",
			kind: "subagent",
			label: "Subagent",
			status: "active",
			lastUpdate: Date.now(),
			progress: {
				resolvedModel: "openai/gpt-4o",
				resolvedModelIsFallback: true,
			} as never,
		});

		const hub = new AgentHubOverlayComponent({
			observers,
			hubKeys: [],
			onDone: () => {},
			requestRender: () => {},
			registry: agents,
			irc: new IrcBus(agents),
			focusAgent: async () => {},
		});

		try {
			expect(Bun.stripANSI(hub.render(120).join("\n"))).toContain("fallback → openai/gpt-4o");
		} finally {
			hub.dispose();
		}
	});

	it("flags a fallback badge for a live row whose fallback armed no session retry state", () => {
		geometry = stubStdoutGeometry(120);
		const agents = new AgentRegistry();
		// Live session with a resolved model but no `retryFallbackModel` — the
		// Fireworks Fast → base degrade emits `retry_fallback_applied` without
		// arming `#activeRetryFallback`, so the badge must fall back to the
		// executor-reported progress flag.
		const session = { model: { id: "kimi-k2" }, retryFallbackModel: undefined } as unknown as AgentSession;
		agents.register({ id: "FastAgent", displayName: "Fast Agent", kind: "sub", session });

		const observers = new SessionObserverRegistry();
		vi.spyOn(observers, "getSession").mockReturnValue({
			id: "FastAgent",
			kind: "subagent",
			label: "Subagent",
			status: "active",
			lastUpdate: Date.now(),
			progress: {
				resolvedModel: "fireworks/kimi-k2",
				resolvedModelIsFallback: true,
			} as never,
		});

		const hub = new AgentHubOverlayComponent({
			observers,
			hubKeys: [],
			onDone: () => {},
			requestRender: () => {},
			registry: agents,
			irc: new IrcBus(agents),
			focusAgent: async () => {},
		});

		try {
			expect(Bun.stripANSI(hub.render(120).join("\n"))).toContain("fallback → fireworks/kimi-k2");
		} finally {
			hub.dispose();
		}
	});
});
