const environment = process.env.VERCEL_ENV?.trim();
const branch = process.env.VERCEL_GIT_COMMIT_REF?.trim();
const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();

// Vercel's ignoreCommand skips the build on exit code 0. Every production
// deployment must therefore originate from the protected main branch and carry
// the commit SHA that connects it to its pull request and CI evidence.
if (environment !== "production") {
  console.log("Allowing preview deployment for pull-request review.");
  process.exit(1);
}

if (!branch || !commitSha) {
  console.log("Ignoring production deployment without Git provenance (branch and commit SHA).");
  process.exit(0);
}

if (branch !== "main") {
  console.log(
    `Ignoring production deployment from ${branch || "unknown source"}. Only main is allowed.`,
  );
  process.exit(0);
}

console.log(`Allowing production deployment from main at ${commitSha}.`);
process.exit(1);
