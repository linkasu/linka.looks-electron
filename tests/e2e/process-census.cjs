function ownedProcessIds(output, platform, rootPid) {
  const validPid = (pid) => Number.isSafeInteger(pid) && pid >= 0;
  if (!validPid(rootPid) || rootPid === 0) throw new Error("Invalid root process PID");
  let rows;
  if (platform === "win32") {
    const census = JSON.parse(output);
    rows = (Array.isArray(census) ? census : [census]).map((row) => {
      if (
        !row ||
        Object.keys(row).length !== 2 ||
        !validPid(row.ProcessId) ||
        !validPid(row.ParentProcessId)
      )
        throw new Error("Invalid Windows process census row");
      return [row.ProcessId, row.ParentProcessId];
    });
  } else {
    rows = output
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        if (!/^\s*\d+\s+\d+\s*$/.test(line)) throw new Error("Invalid POSIX process census row");
        return line.trim().split(/\s+/).map(Number);
      });
  }
  if (rows.length === 0 || rows.some((row) => !row.every(validPid)))
    throw new Error("Invalid or empty process census");
  const owned = new Set([rootPid]);
  let previousSize = 0;
  while (previousSize !== owned.size) {
    previousSize = owned.size;
    for (const [pid, parent] of rows) if (owned.has(parent)) owned.add(pid);
  }
  return [...owned];
}

module.exports = { ownedProcessIds };
