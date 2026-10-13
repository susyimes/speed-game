// vinext beta.5 calls process.exit(0) immediately after a successful build.
// On Windows that races Rolldown's native async-handle cleanup (libuv assertion).
// Let successful builds drain naturally; preserve every nonzero failure exit.
if (process.platform === 'win32') {
  const exit = process.exit.bind(process);
  process.exit = (code = 0) => {
    if (Number(code) !== 0) exit(code);
    process.exitCode = 0;
  };
}
process.argv = [process.execPath, 'vinext', 'build', ...process.argv.slice(2)];
await import('../node_modules/vinext/dist/cli.js');
