import { spawnSync } from "node:child_process";

const [ownerText, targetText] = process.argv.slice(2);
const ownerPid = Number(ownerText);
const targetPid = Number(targetText);

if (
  !Number.isSafeInteger(ownerPid) ||
  ownerPid <= 0 ||
  !Number.isSafeInteger(targetPid) ||
  targetPid <= 0
)
  process.exit(2);

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const terminate = () => {
  if (process.platform === "win32")
    spawnSync("taskkill.exe", ["/pid", String(targetPid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  else {
    try {
      process.kill(-targetPid, "SIGKILL");
    } catch {
      try {
        process.kill(targetPid, "SIGKILL");
      } catch {
        // The target exited while its owner was being checked.
      }
    }
  }
};

const interval = setInterval(() => {
  if (!alive(targetPid)) {
    clearInterval(interval);
    process.exit(0);
  }
  if (!alive(ownerPid)) {
    terminate();
    clearInterval(interval);
    process.exit(0);
  }
}, 1_000);
