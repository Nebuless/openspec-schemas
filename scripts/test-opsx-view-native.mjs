import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { access, mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const minimumNode = [26, 4, 0]
const version = process.versions.node.split(".").map(Number)
const supportedNode = version[0] > minimumNode[0]
  || (version[0] === minimumNode[0] && version[1] > minimumNode[1])
  || (version[0] === minimumNode[0] && version[1] === minimumNode[1] && version[2] >= minimumNode[2])

assert.equal(process.platform, "linux")
assert.equal(process.arch, "x64")
assert.equal(process.env.OPENTUI_LIBC ?? "glibc", "glibc")
assert.equal(supportedNode, true, "native test requires Node.js >=26.4.0")
await access(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "tui", "runtime.mjs"))

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sidecar = path.join(root, "src", "tui", "runtime.mjs")
const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`

async function runInPty(input, expectedCode = 130) {
  const evidenceDir = await mkdtemp(path.join(os.tmpdir(), "opsx-view-native-"))
  const statePath = path.join(evidenceDir, "stty")
  const sidecarPidPath = path.join(evidenceDir, "sidecar-pid")
  const nodeCommand = `${shellQuote(process.execPath)} --experimental-ffi ${shellQuote(sidecar)}`
  const command = `stty -g > ${shellQuote(statePath)}; child_pid=; trap 'if [ -n "$child_pid" ]; then kill -TERM "$child_pid" 2>/dev/null; fi' TERM INT HUP; ${nodeCommand} & child_pid=$!; printf '%s\\n' "$child_pid" > ${shellQuote(sidecarPidPath)}; wait "$child_pid"; status=$?; trap - TERM INT HUP; stty -g >> ${shellQuote(statePath)}; exit $status`
  let child = null
  let groupPid = null
  let testError = null
  try {
    child = spawn("script", ["-qefc", command, "/dev/null"], {
      cwd: root,
      env: { ...process.env, TERM: "xterm-256color" },
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    })
    groupPid = child.pid
    let output = ""
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("native sidecar did not render bootstrap frame")), 5000)
      child.stdout.on("data", chunk => {
        output += chunk.toString()
         if (output.includes("OPEN SPEC OVERVIEW")) {
          clearTimeout(timer)
          resolve()
        }
      })
      child.once("error", reject)
    })
    await ready
    assert.equal(child.exitCode, null, "sidecar must remain alive after initial frame flush")
    child.stdin.write(input)
    child.stdin.end()
    const [code, signal] = await once(child, "close")
    assert.equal(signal, null, `native sidecar terminated by ${signal ?? "unknown"} signal`)
    assert.equal(code, expectedCode, `unexpected PTY exit status ${code}`)
     assert.match(output, /OPEN SPEC OVERVIEW/)
    const states = (await readFile(statePath, "utf8")).trim().split(/\s+/)
    assert.equal(states.length, 2, "PTY harness must capture before/after terminal state")
    assert.equal(states[0], states[1], "terminal state must restore after sidecar shutdown")
    return output
  } catch (error) {
    testError = error
    throw error
  } finally {
    let cleanupError = null
    const pidExists = pid => {
      try {
        process.kill(pid, 0)
        return true
      } catch (error) {
        if (error?.code === "ESRCH") return false
        throw error
      }
    }
    const sendSignal = (pid, signal) => {
      try {
        process.kill(pid, signal)
      } catch (error) {
        if (error?.code !== "ESRCH") throw error
      }
    }
    const waitForPidExit = async pid => {
      const deadline = Date.now() + 1000
      while (pidExists(pid) && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      return !pidExists(pid)
    }
    const readSidecarPid = async () => {
      try {
        const value = (await readFile(sidecarPidPath, "utf8")).trim()
        return /^[1-9][0-9]*$/.test(value) ? Number(value) : null
      } catch (error) {
        if (error?.code === "ENOENT") return null
        throw error
      }
    }
    const waitForWrapper = async () => {
      if (!child || child.exitCode !== null || child.signalCode !== null) return true
      await Promise.race([
        once(child, "close"),
        new Promise(resolve => setTimeout(resolve, 1000)),
      ])
      return child.exitCode !== null || child.signalCode !== null
    }
    try {
      const sidecarPid = await readSidecarPid()
      if (sidecarPid !== null && pidExists(sidecarPid)) {
        sendSignal(sidecarPid, "SIGTERM")
        if (!(await waitForPidExit(sidecarPid)) && pidExists(sidecarPid)) {
          sendSignal(sidecarPid, "SIGKILL")
        }
      }
      if (child && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM")
      }
      if (!(await waitForWrapper()) && groupPid !== null && groupPid !== undefined && pidExists(groupPid)) {
        sendSignal(-groupPid, "SIGTERM")
      }
      if (groupPid !== null && groupPid !== undefined && pidExists(groupPid)) {
        if (!(await waitForWrapper()) && pidExists(groupPid)) {
          sendSignal(-groupPid, "SIGKILL")
          await waitForWrapper()
        }
      }
      if (child && child.exitCode === null && child.signalCode === null) throw new Error("native PTY process group did not exit")
    } catch (error) {
      cleanupError = error
    }
    try {
      await rm(evidenceDir, { recursive: true, force: true })
    } catch (error) {
      cleanupError ??= error
    }
    if (cleanupError && !testError) throw cleanupError
  }
}

await runInPty("\x03")
console.log("test-opsx-view-native: PASS")
