// Starts the Firebase emulators. Java 22+ on Windows fails to open its loopback socket when the
// temp path has spaces or quotes (e.g. a username with an apostrophe), so use a clean temp dir.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

const env = { ...process.env };
if (os.platform() === "win32") {
  const tmp = "C:\Users\Public\sampai-tmp";
  fs.mkdirSync(tmp, { recursive: true });
  env.JAVA_TOOL_OPTIONS = `${env.JAVA_TOOL_OPTIONS ?? ""} -Djdk.net.unixdomain.tmpdir=${tmp} -Djava.io.tmpdir=${tmp}`.trim();
}
// Keep local data between restarts (profiles, incidents, letters).
const child = spawn("npx", ["firebase", "emulators:start", "--only", "firestore,auth", "--project", "demo-sampai", "--import=.emulator-data", "--export-on-exit=.emulator-data"], { stdio: "inherit", env, shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
