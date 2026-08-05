import { describe, expect, it } from "bun:test";

import * as path from "node:path";
import {
	stealthIgnoreDefaultArgsForTest,
	systemChromiumCandidatesForTest,
} from "@oh-my-pi/pi-coding-agent/tools/browser/launch";
import { TempDir } from "@oh-my-pi/pi-utils";

const EXECUTABLE_PROBE = path.resolve(import.meta.dir, "../fixtures/browser-executable-probe.ts");

const AUTOMATION_FLAG = "--enable-automation";

const EDGE_EXECUTABLE_PATHS = [
	"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
	"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
	"/usr/bin/microsoft-edge-stable",
] as const;

const CHROME_EXECUTABLE_PATHS = [
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/usr/bin/chromium",
] as const;

describe("browser launch stealth defaults", () => {
	it("keeps Puppeteer's automation default for Microsoft Edge executables", () => {
		for (const executablePath of EDGE_EXECUTABLE_PATHS) {
			const ignoreDefaultArgs = stealthIgnoreDefaultArgsForTest(executablePath);

			expect(ignoreDefaultArgs).not.toContain(AUTOMATION_FLAG);
			expect(ignoreDefaultArgs).toContain("--disable-extensions");
		}
	});

	it("continues filtering Puppeteer's automation default for Chrome and Chromium executables", () => {
		for (const executablePath of CHROME_EXECUTABLE_PATHS) {
			const ignoreDefaultArgs = stealthIgnoreDefaultArgsForTest(executablePath);

			expect(ignoreDefaultArgs).toContain(AUTOMATION_FLAG);
		}
	});
});

const UNGOOGLED_CHROMIUM_FLATPAK_ID = "io.github.ungoogled_software.ungoogled_chromium";

describe("system Chromium candidates", () => {
	const linuxCandidates = (which: (name: string) => string | undefined = () => undefined) =>
		systemChromiumCandidatesForTest("linux", "/home/test", which);

	it("offers Ungoogled Chromium executables on Linux", () => {
		const candidates = linuxCandidates();

		expect(candidates).toContain("/usr/bin/ungoogled-chromium");
		expect(candidates).toContain("/usr/bin/ungoogled-chromium-browser");
		expect(candidates).toContain(`/var/lib/flatpak/exports/bin/${UNGOOGLED_CHROMIUM_FLATPAK_ID}`);
		expect(candidates).toContain(`/home/test/.local/share/flatpak/exports/bin/${UNGOOGLED_CHROMIUM_FLATPAK_ID}`);
	});

	it("keeps the previously supported Linux executables", () => {
		const candidates = linuxCandidates();

		for (const executablePath of [
			"/usr/bin/google-chrome-stable",
			"/usr/bin/google-chrome",
			"/usr/bin/chromium",
			"/usr/bin/chromium-browser",
			"/snap/bin/chromium",
			"/var/lib/flatpak/exports/bin/com.google.Chrome",
			"/var/lib/flatpak/exports/bin/org.chromium.Chromium",
		]) {
			expect(candidates).toContain(executablePath);
		}
	});

	it("ranks PATH-resolved Ungoogled Chromium below stock builds", () => {
		const ungoogledPath = "/custom/bin/ungoogled-chromium";
		const candidates = linuxCandidates(name => (name === "ungoogled-chromium" ? ungoogledPath : undefined));
		const ungoogled = candidates.indexOf(ungoogledPath);

		for (const executablePath of [
			"/usr/bin/google-chrome-stable",
			"/usr/bin/chromium",
			"/snap/bin/chromium",
			"/var/lib/flatpak/exports/bin/org.chromium.Chromium",
		]) {
			expect(ungoogled).toBeGreaterThan(candidates.indexOf(executablePath));
		}
	});

	it("does not add Ungoogled Chromium candidates on macOS or Windows", () => {
		for (const platform of ["darwin", "win32"] as const) {
			const candidates = systemChromiumCandidatesForTest(platform, "/home/test", () => "/custom/ungoogled");
			expect(candidates.some(candidate => candidate.toLowerCase().includes("ungoogled"))).toBeFalse();
		}
	});
});

describe("browser executable selection", () => {
	it("honors PUPPETEER_EXECUTABLE_PATH before a detected Windows system Chrome", async () => {
		const tempDir = TempDir.createSync("@browser-executable-");
		try {
			const override = path.join(tempDir.path(), "chrome-headless-shell.exe");
			const systemChrome = path.join(tempDir.path(), "Google\\Chrome\\Application\\chrome.exe");
			await Bun.write(override, "override");
			await Bun.write(systemChrome, "system");

			const result = Bun.spawnSync([process.execPath, EXECUTABLE_PROBE], {
				env: {
					...process.env,
					OMP_BROWSER_PROBE_PLATFORM: "win32",
					ProgramFiles: tempDir.path(),
					"ProgramFiles(x86)": path.join(tempDir.path(), "missing-x86"),
					LOCALAPPDATA: path.join(tempDir.path(), "missing-local"),
					PUPPETEER_EXECUTABLE_PATH: override,
				},
				stdout: "pipe",
				stderr: "pipe",
			});
			const stderr = new TextDecoder().decode(result.stderr);

			expect(result.exitCode, stderr).toBe(0);
			expect(new TextDecoder().decode(result.stdout)).toBe(override);
		} finally {
			await tempDir.remove();
		}
	});
});
