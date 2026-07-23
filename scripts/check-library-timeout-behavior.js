const assert = require("assert/strict");
const { withLibraryDatabaseDeadline } = require("../api/library-state")._test;

async function run() {
  let cancelCalls = 0;
  const blockedQuery = new Promise(() => {});
  blockedQuery.cancel = async () => {
    cancelCalls += 1;
  };

  await assert.rejects(
    withLibraryDatabaseDeadline(blockedQuery, "test-blocked-query", 20),
    (error) => error?.code === "LIBRARY_DATABASE_TIMEOUT"
      && error?.statusCode === 503
      && error?.stage === "test-blocked-query",
  );
  assert.equal(cancelCalls, 1, "A timed-out query must be cancelled exactly once.");

  const nextResult = await withLibraryDatabaseDeadline(
    Promise.resolve("next-query-succeeded"),
    "test-next-query",
    20,
  );
  assert.equal(nextResult, "next-query-succeeded", "A timeout must not prevent the next query from completing.");

  console.log("Library timeout behavior checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
