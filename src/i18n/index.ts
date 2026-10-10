import { useCallback, useEffect, useState } from "react";

import { translations, type Locale, type MessageKey } from "./translations";

const LOCALE_KEY = "barticket_locale";

export type { Locale, MessageKey };

function localeFromLanguage(language: string): Locale | null {
    const base = language.toLowerCase().split("-")[0];
    if (base === "ja") return "ja";
    if (base === "en") return "en";
    return null;
}

export function detectLocale(): Locale {
    const language = typeof navigator === "undefined" ? "" : navigator.language;
    return localeFromLanguage(language) ?? "en";
}

export function readLocale(): Locale {
    const saved = localStorage.getItem(LOCALE_KEY);
    if (saved === "en" || saved === "ja") return saved;
    return detectLocale();
}

export function writeLocale(locale: Locale) {
    localStorage.setItem(LOCALE_KEY, locale);
    window.dispatchEvent(new Event("barticket-locale"));
}

export function translate(
    locale: Locale,
    key: string,
    vars?: Record<string, string | number>,
) {
    const catalog = translations[locale] as Record<string, string>;
    const english = translations.en as Record<string, string>;
    let text = catalog[key] || english[key] || key;
    if (vars) {
        for (const [name, value] of Object.entries(vars)) {
            text = text.replaceAll(`{${name}}`, String(value));
        }
    }
    return text;
}

export function localeTag(locale: Locale) {
    return locale === "ja" ? "ja-JP" : "en-US";
}

export function formatDuration(locale: Locale, seconds: number) {
    const whole = Math.round(seconds / 60);
    const hours = Math.floor(whole / 60);
    const minutes = whole % 60;
    return locale === "ja" ? `${hours}時間${minutes}分` : `${hours}h ${minutes}m`;
}

export function useI18n() {
    const [locale, setLocaleState] = useState<Locale>(readLocale);

    useEffect(() => {
        const sync = () => setLocaleState(readLocale());
        window.addEventListener("barticket-locale", sync);
        return () => window.removeEventListener("barticket-locale", sync);
    }, []);

    useEffect(() => {
        document.documentElement.lang = locale;
    }, [locale]);

    const t = useCallback(
        (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
        [locale],
    );

    return {
        locale,
        t,
        setLocale: writeLocale,
    };
}
