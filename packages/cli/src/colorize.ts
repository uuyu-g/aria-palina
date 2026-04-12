const ANSI_RESET = "\u001b[0m";

const ANSI_CODES: Record<string, string> = {
  cyan: "\u001b[36m",
  blue: "\u001b[34m",
  magenta: "\u001b[35m",
  yellow: "\u001b[33m",
  green: "\u001b[32m",
  gray: "\u001b[90m",
  bold: "\u001b[1m",
};

const ROLE_STYLES: Record<string, string[]> = {
  button: ["cyan"],
  link: ["blue"],
  heading: ["bold", "magenta"],
  textbox: ["yellow"],
  combobox: ["yellow"],
  checkbox: ["green"],
  radio: ["green"],
  switch: ["green"],
  img: ["gray"],
};

export function colorizeByRole(role: string, text: string): string {
  const styles = ROLE_STYLES[role];
  if (!styles) return text;
  const prefix = styles.map((s) => ANSI_CODES[s]).join("");
  return `${prefix}${text}${ANSI_RESET}`;
}
