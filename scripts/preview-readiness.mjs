#!/usr/bin/env node
/**
 * Phase 1.5 preview-readiness smoke check.
 * Does not print secret values. It only reports whether required env vars exist
 * and whether CLI auth/link prerequisites are likely ready.
 */
import { existsSync } from "node:fs"
import { execFileSync } from "node:child_process"

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
]
const optionalEnv = ["N8N_WEBHOOK_SECRET", "CRON_SECRET", "ANTHROPIC_API_KEY", "RESEND_API_KEY"]

function present(name) {
  return Boolean(process.env[name] && process.env[name].trim())
}

function tryCmd(cmd, args) {
  try {
    const out = execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    return out.trim().split("\n")[0] || "ok"
  } catch (err) {
    return `not ready (${err.status ?? "error"})`
  }
}

console.log("ABA Energy OS preview readiness")
console.log("=================================")
console.log(`Vercel CLI: ${tryCmd("npx", ["--yes", "vercel", "whoami"])}`)
console.log(`Supabase CLI: ${tryCmd("npx", ["--yes", "supabase", "projects", "list"])}`)
console.log(`Vercel project link: ${existsSync(".vercel/project.json") ? "linked" : "not linked"}`)
console.log(`Supabase local link: ${existsSync("supabase/.temp/project-ref") ? "linked" : "not linked"}`)
console.log("")
for (const key of requiredEnv) console.log(`${key}: ${present(key) ? "set" : "MISSING"}`)
for (const key of optionalEnv) console.log(`${key}: ${present(key) ? "set" : "optional/missing"}`)

const missing = requiredEnv.filter((key) => !present(key))
if (missing.length) {
  console.log(`\n❌ Missing required env vars: ${missing.join(", ")}`)
  process.exit(1)
}
console.log("\n✅ Required env vars are present. Ready for preview smoke when project links are configured.")
