import { Command } from "commander";
import { startServer } from "../serve.js";

export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .aliases(["dashboard", "dash", "gui"])
    .description("Launch a local web dashboard to manage proxies visually")
    .option("-p, --port <n>", "Port to listen on", "4747")
    .action(async (opts: { port: string }) => {
      await startServer(parseInt(opts.port, 10));
      // startServer blocks until Ctrl+C; exit cleanly after
      process.exit(0);
    });
}
