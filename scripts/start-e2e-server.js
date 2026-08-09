const path = require("node:path");
const {spawn} = require("node:child_process");

const port = process.argv[2] || "3101";
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", port], {
  cwd: process.cwd(),
  env: {...process.env, SHIPPING_BUDDY_DIST_DIR: ".next-e2e"},
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
