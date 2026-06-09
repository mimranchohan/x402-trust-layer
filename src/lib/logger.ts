type LogLevel = "info" | "warn" | "error" | "debug";

function emit(level: LogLevel, fields: Record<string, unknown>, msg: string): void {
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info(fields: Record<string, unknown>, msg: string): void {
    emit("info", fields, msg);
  },
  warn(fields: Record<string, unknown>, msg: string): void {
    emit("warn", fields, msg);
  },
  error(fields: Record<string, unknown>, msg: string): void {
    emit("error", fields, msg);
  },
  debug(fields: Record<string, unknown>, msg: string): void {
    if (process.env.LOG_LEVEL === "debug") emit("debug", fields, msg);
  },
};
