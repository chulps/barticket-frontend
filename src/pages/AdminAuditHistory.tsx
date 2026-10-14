import styled from "styled-components";
import type { Account } from "../api/account";
import type { Locale } from "../i18n";

/** Manager-only route, guarded by Admin before this component renders. */
export default function AdminAuditHistory({ person, locale, onBack }: {
    person: Account;
    locale: Locale;
    onBack: () => void;
}) {
    const ja = locale === "ja";
    return (
        <Page aria-label={ja ? "変更履歴" : "Audit history"}>
            <button className="small hollow secondary" type="button" onClick={onBack}>
                {ja ? "← チームプロフィールへ戻る" : "← Back to team profile"}
            </button>
            <h1>{ja ? "変更履歴" : "Audit history"}</h1>
            <p>{ja ? person.name + " の管理変更履歴" : "Administrative change history for " + person.name}</p>
            <Card>
                <h2>{ja ? "変更記録" : "Recorded changes"}</h2>
                <p>{ja
                    ? "修正者、日時、変更前後の値、理由を記録する監査APIの実装待ちです。まだ操作履歴を取得できません。"
                    : "An audit API is still needed to provide actor, timestamp, before/after values and reason. No history can be retrieved yet."}</p>
                <Muted role="status">{ja ? "現在は利用できません" : "Not available yet"}</Muted>
            </Card>
        </Page>
    );
}

const Page = styled.main`
    display: flex; flex-direction: column; gap: var(--space-2); width: 100%;
    padding: var(--space-2) 0;
    h1 { font-size: var(--font-size-h3); }
    > button { width: auto; align-self: flex-start; }
`;
const Card = styled.section`
    display: flex; flex-direction: column; gap: var(--space-1);
    padding: var(--space-2); border-radius: 12px; background: var(--neutral-900);
    h2 { font-size: var(--font-size-h4); font-weight: 500; }
`;
const Muted = styled.p`color: var(--neutral-300);`;
