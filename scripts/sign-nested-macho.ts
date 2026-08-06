import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const developerId = process.env.ELECTROBUN_DEVELOPER_ID
const buildDir = process.env.ELECTROBUN_BUILD_DIR

if (!developerId || !buildDir) {
  throw new Error(
    "Nested Mach-O signing requires ELECTROBUN_DEVELOPER_ID and ELECTROBUN_BUILD_DIR",
  )
}

const appEntries = readdirSync(buildDir).filter((entry) => entry.endsWith(".app"))
if (appEntries.length !== 1) {
  throw new Error(`Expected exactly one app bundle under ${buildDir}, found ${appEntries.length}`)
}
const resourcesApp = join(buildDir, appEntries[0]!, "Contents", "Resources", "app")
const machOMagic = new Set([
  0xfeedface, // MH_MAGIC
  0xcefaedfe, // MH_CIGAM
  0xfeedfacf, // MH_MAGIC_64
  0xcffaedfe, // MH_CIGAM_64
  0xcafebabe, // FAT_MAGIC
  0xbebafeca, // FAT_CIGAM
  0xcafebabf, // FAT_MAGIC_64
  0xbfbafeca, // FAT_CIGAM_64
])

function isMachO(path: string) {
  const header = readFileSync(path, { encoding: null, flag: "r" }).subarray(0, 4)
  return header.length === 4 && machOMagic.has(header.readUInt32BE(0))
}

function findMachO(dir: string): string[] {
  const paths: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      paths.push(...findMachO(path))
    } else if (entry.isFile() && isMachO(path)) {
      paths.push(path)
    }
  }
  return paths
}

const machOFiles = findMachO(resourcesApp)
if (machOFiles.length === 0) {
  throw new Error(`No nested Mach-O files found under ${resourcesApp}`)
}

for (const path of machOFiles) {
  console.log(`Signing nested Mach-O: ${path.slice(resourcesApp.length + 1)}`)
  const signed = Bun.spawnSync(
    ["codesign", "--force", "--verbose", "--timestamp", "--sign", developerId, "--options", "runtime", path],
    { stderr: "inherit", stdout: "inherit" },
  )
  if (signed.exitCode !== 0) {
    throw new Error(`codesign failed for ${path}`)
  }

  const verified = Bun.spawnSync(["codesign", "--verify", "--strict", "--verbose=2", path], {
    stderr: "inherit",
    stdout: "inherit",
  })
  if (verified.exitCode !== 0) {
    throw new Error(`codesign verification failed for ${path}`)
  }

  const details = Bun.spawnSync(["codesign", "-d", "--verbose=4", path], {
    stderr: "pipe",
    stdout: "pipe",
  })
  const signatureDetails = new TextDecoder().decode(details.stderr)
  if (
    details.exitCode !== 0 ||
    !signatureDetails.includes("Authority=Developer ID Application") ||
    !signatureDetails.includes("Timestamp=")
  ) {
    throw new Error(`Developer ID signature or secure timestamp missing for ${path}`)
  }
}

console.log(`Verified ${machOFiles.length} nested Mach-O file(s) before Electrobun signs the app bundle`)
