/**
 * Preserve the existing backend policy (managers can provision managers),
 * but add an explicit, localized acknowledgement of elevated permissions.
 * Do not ask for confirmation when creating an ordinary staff account.
 */
export function confirmAccountRole(
    role: "staff" | "manager",
    locale: string,
    confirm: (message: string) => boolean,
): boolean {
    if (role !== "manager") return true;
    return confirm(locale === "ja"
        ? "このアカウントに管理者権限を付与しますか？この人は管理画面とアカウント管理機能にアクセスできるようになります。"
        : "Create a manager account? This grants access to Admin and the ability to manage other accounts.");
}
