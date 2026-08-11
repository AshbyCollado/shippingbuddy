const path = require("node:path");
const {spawn} = require("node:child_process");

const workspaceRoot = process.cwd();
const port = process.argv[2] || "3101";
const nextBin = path.join(workspaceRoot, "node_modules", "next", "dist", "bin", "next");
const signalExitCodes = {SIGINT: 130, SIGTERM: 143};

let activeChild = null;
let shutdownSignal = null;

function startNext(args) {
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd: workspaceRoot,
    env: process.env,
    stdio: "inherit",
  });
  activeChild = child;
  return child;
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({code, signal}));
  }).finally(() => {
    if (activeChild === child) activeChild = null;
  });
}

function exitForSignal(signal) {
  process.exit(signalExitCodes[signal] || 1);
}

function requestShutdown(signal) {
  if (shutdownSignal) return;
  shutdownSignal = signal;

  if (!activeChild || activeChild.exitCode !== null || activeChild.signalCode !== null) {
    exitForSignal(signal);
    return;
  }

  if (!activeChild.kill(signal)) exitForSignal(signal);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => requestShutdown(signal));
}

async function main() {
  const build = startNext(["build"]);
  const buildResult = await waitForChild(build);

  if (shutdownSignal) exitForSignal(shutdownSignal);
  if (buildResult.code !== 0) {
    console.error(`Shipping Buddy E2E production build failed (${buildResult.signal || buildResult.code}).`);
    process.exit(buildResult.code || 1);
  }

  const server = startNext(["start", "--hostname", "127.0.0.1", "--port", port]);
  const serverResult = await waitForChild(server);

  if (shutdownSignal) exitForSignal(shutdownSignal);
  console.error(`Shipping Buddy E2E production server exited (${serverResult.signal || serverResult.code}).`);
  process.exit(serverResult.code || 1);
}

main().catch((error) => {
  console.error("Shipping Buddy E2E server harness failed.", error);
  if (activeChild && activeChild.exitCode === null && activeChild.signalCode === null) {
    activeChild.kill("SIGTERM");
  }
  process.exit(1);
});
