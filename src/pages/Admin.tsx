import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Navigate, useLocation, useMatch, useNavigate, useParams } from "react-router-dom";
import styled from "styled-components";
import RequestState from "../components/RequestState";

import { accountApi, type Account, type ShiftReport } from "../api/account";
import { ApiError, getToken } from "../api/client";
import { useI18n } from "../i18n";
import { confirmAccountRole } from "./adminAccountRole";
import AdminTeam from "./AdminTeam";
import DataDownload from "../components/DataDownload";
import AdminAuditHistory from "./AdminAuditHistory";
import Reconciliation from "./Reconciliation";
import ScheduleImport from "./ScheduleImport";
import AdminPayDeductions from "./AdminPayDeductions";
import AdminPayments from "./AdminPayments";
import { paymentSetupAccess } from "../api/paymentSetupAccess";

type AdminSection = "accounts" | "team" | "historicalHours" | "schedules" | "adjustments" | "payments";

const adminSectionTabs: { id: AdminSection; label: { en: string; ja: string } }[] = [
    { id: "accounts", label: { en: "Accounts", ja: "アカウント" } },
    { id: "team", label: { en: "Team", ja: "チーム" } },
    { id: "historicalHours", label: { en: "Historical hours", ja: "履歴勤務時間" } },
    { id: "schedules", label: { en: "Schedules", ja: "シフト予定" } },
    { id: "adjustments", label: { en: "Pay deductions", ja: "報酬控除" } },
    { id: "payments", label: { en: "Payment setup", ja: "決済設定" } },
];

/**
 * Manager-only account, work-record and pay administration.
 * Role access is checked via /auth/me before rendering any team view.
 * All privileged account writes are additionally enforced by backend /users APIs.
 * Team edits use audited, authorized backend endpoints.
 */
export default function Admin() {
    const { t, locale } = useI18n();
    const navigate = useNavigate();
    const location = useLocation();
    const { staffId } = useParams<{ staffId: string }>();
    const auditRoute = useMatch("/admin/staff/:staffId/audit");
    const [me, setMe] = useState<Account | null>(null);
    const [team, setTeam] = useState<Account[]>([]);
    const [paymentAccess, setPaymentAccess] = useState<{token: string; allowed: boolean | null} | null>(null);
    const [historicalShifts, setHistoricalShifts] = useState<ShiftReport[]>([]);
    const [historicalLoading, setHistoricalLoading] = useState(false);
    const [historicalError, setHistoricalError] = useState("");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [accountsError, setAccountsError] = useState("");
    const [accountsLoading, setAccountsLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const sectionParams = new URLSearchParams(location.search);
    const requestedSection = sectionParams.get("section");
    const activeSection: AdminSection = staffId !== undefined || sectionParams.has("teamView")
        ? "team" : adminSectionTabs.find(tab => tab.id === requestedSection)?.id ?? "accounts";
    const canConfigurePayments = me?.role === "manager" && paymentAccess?.token === getToken() && paymentAccess?.allowed === true;
    const updatePaymentAccess = useCallback((allowed: boolean | null) => {
        const token = getToken();
        if (token) setPaymentAccess({token, allowed});
    }, []);
    const visibleSectionTabs = useMemo(() => adminSectionTabs.filter(tab => tab.id !== "payments" || canConfigurePayments), [canConfigurePayments]);
    const sectionNavRef = useRef<HTMLElement>(null);
    const sectionButtons = useRef<(HTMLButtonElement | null)[]>([]);
    const [tabIndicator, setTabIndicator] = useState({ left: 0, top: 0, width: 0, height: 0 });

    useLayoutEffect(() => {
        const nav = sectionNavRef.current;
        const activeIndex = visibleSectionTabs.findIndex(tab => tab.id === activeSection);
        const activeButton = sectionButtons.current[activeIndex];
        if (!nav || !activeButton) return;

        const measure = () => {
            const navRect = nav.getBoundingClientRect();
            const buttonRect = activeButton.getBoundingClientRect();
            setTabIndicator({
                left: buttonRect.left - navRect.left - nav.clientLeft,
                top: buttonRect.top - navRect.top - nav.clientTop,
                width: buttonRect.width,
                height: buttonRect.height,
            });
        };

        measure();
        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", measure);
            return () => window.removeEventListener("resize", measure);
        }

        const observer = new ResizeObserver(measure);
        observer.observe(nav);
        sectionButtons.current.forEach(button => { if (button) observer.observe(button); });
        return () => observer.disconnect();
    }, [activeSection, visibleSectionTabs]);
    const selectedId = staffId === undefined ? null
        : /^[1-9][0-9]*$/.test(staffId) && Number.isSafeInteger(Number(staffId))
            ? Number(staffId) : -1;

    function chooseSection(next: AdminSection) {
        navigate(next === "accounts" ? "/admin" : `/admin?section=${next}`);
    }

    useEffect(() => {
        if (activeSection !== "historicalHours" || me?.role !== "manager") return;
        const token = getToken();
        if (!token) return;
        let cancelled = false;
        const load = () => {
            setHistoricalLoading(true);
            setHistoricalError("");
            return accountApi.closedShifts().then(shifts => {
                if (!cancelled && getToken() === token) setHistoricalShifts(shifts);
            }).catch(err => {
                if (!cancelled && getToken() === token) {
                    setHistoricalShifts([]);
                    setHistoricalError(err instanceof ApiError ? err.message : String(err));
                }
            }).finally(() => {
                if (!cancelled && getToken() === token) setHistoricalLoading(false);
            });
        };
        void load();
        return () => { cancelled = true; };
    }, [activeSection, me]);

    function chooseMember(id: number | null) {
        const params = new URLSearchParams(location.search);
        params.set("section", "team");
        navigate((id === null ? "/admin" : `/admin/staff/${id}`) + "?" + params.toString());
    }
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState<"staff" | "manager">("staff");

    useEffect(() => {
        let cancelled = false;
        let generation = 0;
        let verifiedToken: string | null = null;
        let inFlight = false;
        async function load(reset = false) {
            const token = getToken();
            if (inFlight && !reset && verifiedToken === token) return;
            const request = ++generation;
            inFlight = true;
            const preserve = !reset && token !== null && verifiedToken === token;
            if (!preserve) {
                setLoading(true);
                setMe(null);
                setTeam([]);
                setPaymentAccess(null);
            }
            setRefreshing(preserve);
            setAccountsError("");
            setError("");
            if (!token) { setLoading(false); setRefreshing(false); inFlight = false; return; }
            try {
                const account = await accountApi.me();
                if (cancelled || request !== generation || getToken() !== token) return;
                if (account.role !== "manager") {
                    verifiedToken = null;
                    setTeam([]);
                    setMe(account);
                    return;
                }
                // Resolve optional navigation without blocking the main Admin data.
                void paymentSetupAccess.read().then(allowed => {
                    if (!cancelled && request === generation && getToken() === token) setPaymentAccess({token, allowed});
                }).catch(() => {
                    if (!cancelled && request === generation && getToken() === token) setPaymentAccess({token, allowed:null});
                });
                const members = await accountApi.listUsers();
                if (cancelled || request !== generation || getToken() !== token) return;
                verifiedToken = token;
                setTeam(members);
                setMe(account);
            } catch (err) {
                if (cancelled || request !== generation || getToken() !== token) return;
                const denied = err instanceof ApiError && (err.status === 401 || err.status === 403);
                if (!preserve || denied) {
                    verifiedToken = null;
                    setTeam([]);
                    setMe(null);
                }
                setError(err instanceof ApiError ? err.message : String(err));
            } finally {
                if (!cancelled && request === generation && getToken() === token) {
                    inFlight = false;
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        }
        const reload = () => { void load(true); };
        const revalidate = () => { void load(); };
        void load();
        window.addEventListener("barticket-auth", reload);
        window.addEventListener("focus", revalidate);
        window.addEventListener("barticket-users-updated", revalidate);
        return () => {
            cancelled = true;
            generation++;
            window.removeEventListener("barticket-auth", reload);
            window.removeEventListener("focus", revalidate);
        window.removeEventListener("barticket-users-updated", revalidate);
        };
    }, []);

    async function refreshAccounts() {
        if (accountsLoading || me?.role !== "manager") return;
        const token = getToken();
        if (!token) return;
        setAccountsLoading(true);
        setAccountsError("");
        try {
            const members = await accountApi.listUsers();
            if (getToken() === token) setTeam(members);
        } catch (err) {
            if (getToken() === token) {
                setTeam([]);
                setAccountsError(err instanceof ApiError ? err.message : String(err));
            }
        } finally {
            if (getToken() === token) setAccountsLoading(false);
        }
    }

    async function perform(action: () => Promise<void>) {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            await action();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    }

    function createAccount(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy) return;
        // Existing backend policy allows managers to create more managers.
        // Require an explicit acknowledgement before granting Admin privileges.
        if (!confirmAccountRole(role, locale, (message) => window.confirm(message))) return;
        void perform(async () => {
            await accountApi.createUser({ name: name.trim(), email: email.trim(), password, role });
            setName("");
            setEmail("");
            setPassword("");
            setRole("staff");
            setTeam(await accountApi.listUsers());
        });
    }

    if (loading) return <Page><h1>{locale === "ja" ? "管理" : "Admin"}</h1><RequestState kind="loading" detail={t("loading")} /></Page>;
    if (!me && error) return (
        <Page>
            <h1>{locale === "ja" ? "管理" : "Admin"}</h1>
            <RequestState kind="error" detail={error} onRetry={() => window.location.reload()} />
        </Page>
    );
    if (me?.role !== "manager") return <Navigate to="/profile" replace />;

    if (requestedSection === "overview") {
        const params = new URLSearchParams(location.search);
        params.delete("section");
        const search = params.toString();
        return <Navigate to={location.pathname + (search ? "?" + search : "") + location.hash} replace />;
    }

    if (auditRoute) {
        const person = team.find(member => member.id === selectedId);
        if (!person) return (
            <Page>
                <h1>{locale === "ja" ? "変更履歴" : "Audit history"}</h1>
                <ErrorText role="alert">{accountsError || (locale === "ja" ? "メンバーが見つかりません" : "Team member not found")}</ErrorText>
                <button type="button" className="small secondary" onClick={() => navigate("/admin")}>
                    {locale === "ja" ? "チームに戻る" : "Back to Admin"}
                </button>
            </Page>
        );
        return <AdminAuditHistory person={person} locale={locale}
            onBack={() => navigate("/admin/staff/" + person.id + location.search)} />;
    }

    return (
        <Page>
            <header>
                <h1>{locale === "ja" ? "管理" : "Admin"}</h1>
                <p>{locale === "ja" ? "管理者向けのアカウント管理画面です。" : "Manager-only account management."}</p>
            </header>
            {refreshing ? <p role="status">{locale === "ja" ? "最新情報を確認中…" : "Checking for updates…"}</p> : null}
            {error ? <ErrorText role="alert">{error}</ErrorText> : null}
            <MobileSectionPicker>
                <span>{locale === "ja" ? "管理メニュー" : "Admin section"}</span>
                <select value={activeSection} onChange={event => chooseSection(event.target.value as AdminSection)}>
                    {activeSection === "payments" && !canConfigurePayments ? <option value="payments" disabled>{locale === "ja" ? "決済設定（利用不可）" : "Payment setup (unavailable)"}</option> : null}
                    {visibleSectionTabs.map(tab => <option key={tab.id} value={tab.id}>
                        {locale === "ja" ? tab.label.ja : tab.label.en}
                    </option>)}
                </select>
            </MobileSectionPicker>
            <SectionNav ref={sectionNavRef} aria-label={locale === "ja" ? "管理セクション" : "Admin sections"}>
                <SectionIndicator
                    aria-hidden="true"
                    $left={tabIndicator.left}
                    $top={tabIndicator.top}
                    $width={visibleSectionTabs.some(tab => tab.id === activeSection) ? tabIndicator.width : 0}
                    $height={tabIndicator.height}
                />
                {visibleSectionTabs.map((tab, index) => <SectionButton
                    key={tab.id}
                    ref={node => { sectionButtons.current[index] = node; }}
                    type="button"
                    aria-pressed={activeSection === tab.id}
                    $active={activeSection === tab.id}
                    onClick={() => chooseSection(tab.id)}
                >
                    {locale === "ja" ? tab.label.ja : tab.label.en}
                </SectionButton>)}
            </SectionNav>
            {activeSection === "accounts" ? (
                <Grid>
                    <Section>
                        <h2>{t("team")} ({accountsError ? "—" : team.length})</h2>
                        <p>{locale === "ja"
                            ? "現在の登録アカウントを表示します。過去のスタッフ記録や無効化されたアカウントは含まれません。"
                            : "Only accounts currently returned by the API are shown. Historical and deactivated accounts are not included."}</p>
                        <DataDownload locale={locale} scope="admin" />
                        {accountsError ? <ErrorText role="alert">{accountsError}</ErrorText> : null}
                        <button type="button" className="small hollow secondary" disabled={accountsLoading || busy} onClick={() => void refreshAccounts()}>
                            {accountsLoading ? (locale === "ja" ? "更新中…" : "Refreshing…") : (locale === "ja" ? "一覧を更新" : "Refresh accounts")}
                        </button>
                        {!team.length && !accountsError ? <p>{locale === "ja" ? "登録アカウントがありません。" : "No accounts were returned."}</p> : null}
                        {team.map(person => (
                            <Person key={person.id}>
                                <Who>
                                    <strong>{person.name}</strong>
                                    <span>{person.email}</span>
                                    <span>{t(person.role)}</span>
                                </Who>
                                {person.id !== me.id ? (
                                    <button
                                        type="button"
                                        className="small hollow danger"
                                        disabled={busy}
                                        onClick={() => {
                                            if (!window.confirm(t("removePersonConfirm", { name: person.name }))) return;
                                            void perform(async () => setTeam(await accountApi.removeUser(person.id)));
                                        }}
                                    >
                                        {t("removePerson")}
                                    </button>
                                ) : null}
                            </Person>
                        ))}
                    </Section>
                    <Section>
                        <h2>{t("addPerson")}</h2>
                        <form onSubmit={createAccount}>
                            <label>{t("name")}<input required maxLength={255} value={name} onChange={event => setName(event.target.value)} /></label>
                            <label>{t("email")}<input required maxLength={255} type="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
                            <label>{t("password")}<input type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>
                            <label>{t("role")}
                                <select value={role} onChange={event => setRole(event.target.value as "staff" | "manager")}>
                                    <option value="staff">{t("staff")}</option>
                                    <option value="manager">{t("manager")}</option>
                                </select>
                            </label>
                            {role === "manager" ? (
                                <Warning role="status">
                                    {locale === "ja"
                                        ? "マネージャーにはアカウント管理を含むすべての管理者権限が付与されます。信頼できる人にのみ付与してください。"
                                        : "Managers can access Admin and manage other accounts. Assign this role only to trusted people."}
                                </Warning>
                            ) : null}
                            <button type="submit" disabled={busy}>{t("addAccount")}</button>
                        </form>
                    </Section>
                </Grid>
            ) : activeSection === "historicalHours" ? (
                <>
                    <Section>
                        <h2>{locale === "ja" ? "履歴勤務時間" : "Historical staff hours"}</h2>
                        <p>{locale === "ja" ? "月ごとの勤務合計を既存の打刻と照合します。履歴データは打刻時刻として保存されません。" : "Reconcile monthly staff-hour totals against recorded punches. Historical totals are never stored as clock times."}</p>
                    </Section>
                    {historicalLoading ? <RequestState kind="loading" detail={t("loading")} /> : (
                        <Reconciliation shifts={historicalShifts} users={team} locale={locale} error={historicalError} />
                    )}
                </>
            ) : activeSection === "schedules" ? (
                <>
                    <Section>
                        <h2>{locale === "ja" ? "勤務表のシフト予定" : "Spreadsheet shift schedules"}</h2>
                        <p>{locale === "ja"
                            ? "未来の勤務割当と元の出典を確認して取り込みます。実際のシフトや勤務時間は作成されません。"
                            : "Review and import assigned dates with their spreadsheet source. This records planned assignments without creating shifts or worked hours."}</p>
                    </Section>
                    <ScheduleImport users={team} locale={locale} />
                </>
            ) : activeSection === "payments" ? (
                <AdminPayments locale={locale}
                    accessDenied={paymentAccess?.token === getToken() && paymentAccess?.allowed === false}
                    accessUnavailable={paymentAccess?.token === getToken() && paymentAccess?.allowed === null}
                    onAccessChecked={updatePaymentAccess} />
            ) : activeSection === "adjustments" ? (
                <AdminPayDeductions managers={team.filter(person => person.role === "manager")} locale={locale} />
            ) : (
                <AdminTeam
                    viewer={me}
                    people={team}
                    accountsError={accountsError}
                    locale={locale}
                    selectedId={selectedId}
                    onSelect={chooseMember}
                    onAudit={(id) => navigate("/admin/staff/" + id + "/audit" + location.search)}
                />
            )}
        </Page>
    );
}

const Page = styled.main`
    width: 100%;
    padding: var(--space-2) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    h1 { font-size: var(--font-size-h3); }
    h2 { font-size: var(--font-size-h4); font-weight: 500; }
    header p { color: var(--neutral-300); }
`;
const MobileSectionPicker = styled.label`
    display: grid;
    gap: var(--space-1);
    min-width: 0;
    color: var(--neutral-200);
    text-transform: none;
    letter-spacing: normal;
    select { width: 100%; min-width: 0; box-sizing: border-box; font-size: 16px; min-height: 48px; }
    @media (min-width: 570px) { display: none; }
`;
const SectionNav = styled.nav`
    position: relative;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-0);
    padding: var(--space-0);
    border: 1px solid var(--neutral-700);
    border-radius: var(--space-1);
    @media (max-width: 569px) { display: none; }
    @media (min-width: 640px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    @media (min-width: 1000px) { grid-template-columns: repeat(6, minmax(0, 1fr)); }
`;
const SectionIndicator = styled.div<{
    $left: number;
    $top: number;
    $width: number;
    $height: number;
}>`
    position: absolute;
    z-index: 0;
    pointer-events: none;
    left: 0;
    top: 0;
    width: ${({ $width }) => `${$width}px`};
    height: ${({ $height }) => `${$height}px`};
    opacity: ${({ $width, $height }) => $width && $height ? 1 : 0};
    border-radius: calc(var(--space-1) - 2px);
    background: var(--royal-500, #577ff5);
    box-shadow: 0 0 0 1px var(--royal-400, #7899ff);
    transform: translate(${({ $left, $top }) => `${$left}px, ${$top}px`});
    transition:
        transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1),
        width 180ms ease,
        height 180ms ease,
        opacity 100ms ease;

    @media (prefers-reduced-motion: reduce) {
        transition: none;
    }
`;
const SectionButton = styled.button<{ $active: boolean }>`
    position: relative;
    z-index: 1;
    min-width: 0;
    min-height: 48px;
    padding: var(--space-1);
    border: 1px solid transparent;
    border-radius: calc(var(--space-1) - 2px);
    background: transparent;
    color: ${({ $active }) => $active ? "white" : "var(--neutral-300)"};
    overflow-wrap: anywhere;
    text-align: center;
    &:hover { color: white; }
    &:focus-visible { outline: 2px solid var(--royal-400); outline-offset: 1px; }
`;
const Grid = styled.div`
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-2);
    align-items: start;
    @media (min-width: 850px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;
const Section = styled.section`
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2);
    background: var(--surface-card);
    color: var(--on-surface-card);
    --label-color: var(--on-surface-card-muted);
    border-radius: 12px;
    form { display: flex; flex-direction: column; gap: var(--space-1); }
    label { display: flex; flex-direction: column; gap: var(--space-0); }
    input, select { width: 100%; box-sizing: border-box; color: var(--font-color); }
    input:focus, select:focus { transform: none; }
    select { background: var(--dark); }
    strong { font-family: var(--font-family-data); }
`;
const Person = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    button { flex-shrink: 0; width: auto; }
`;
const Who = styled.div`
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
    strong { font-size: var(--font-size-h4); font-weight: 500; }
    span { color: var(--neutral-300); overflow-wrap: anywhere; }
`;
const ErrorText = styled.p`color: var(--danger, #e06c75);`;
const Warning = styled.p`color: var(--danger-400); font-size: var(--font-size-small);`;
