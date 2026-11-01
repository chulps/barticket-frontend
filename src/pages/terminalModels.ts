/** Identification notes only: these options are not compatibility approval. */
export const terminalModels = [
    { id: "unknown", label: "Not sure", ja: "わからない", url: "" },
    { id: "vega3000_mx", label: "VEGA3000 MX", ja: "VEGA3000 MX", url: "https://www.japanmerchantservices.com/lp/004/terminal/" },
    { id: "vega3000_countertop", label: "VEGA3000 Countertop", ja: "VEGA3000 Countertop", url: "https://www.japanmerchantservices.com/lp/004/terminal/" },
    { id: "vega3000_mobile2", label: "VEGA3000 Mobile2", ja: "VEGA3000 Mobile2", url: "https://www.japanmerchantservices.com/faq/index2.html" },
    { id: "saturn1000f2", label: "SATURN1000F2", ja: "SATURN1000F2", url: "https://www.japanmerchantservices.com/saturn/saturn_sousa.pdf" },
    { id: "other", label: "Other model", ja: "その他の機種", url: "" },
] as const;
export const terminalConnections = [
    { id: "unknown", label: "Not sure", ja: "わからない" },
    { id: "wifi", label: "Wi-Fi", ja: "Wi-Fi" },
    { id: "lte", label: "LTE / mobile data", ja: "LTE・モバイル通信" },
    { id: "wired", label: "Wired LAN", ja: "有線LAN" },
    { id: "other", label: "Other", ja: "その他" },
] as const;
export type TerminalModel = typeof terminalModels[number]["id"];
export type TerminalConnection = typeof terminalConnections[number]["id"];
export const knownTerminalModel = (value: unknown): TerminalModel => terminalModels.find(option => option.id === value)?.id ?? "unknown";
export const knownTerminalConnection = (value: unknown): TerminalConnection => terminalConnections.find(option => option.id === value)?.id ?? "unknown";
