import styled from "styled-components";
import { useI18n } from "../i18n";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function SearchBar({
  value,
  onChange,
}: SearchBarProps) {
  const { t, locale } = useI18n();
  return (
    <SearchContainer>
      <Input
        type="text"
        aria-label={locale === "ja" ? "メニューを検索" : "Search menu"}
        placeholder={t("searchPlaceholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </SearchContainer>
  );
}

const SearchContainer = styled.div`
  width: 100%;
`;

const Input = styled.input`
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
  min-height: 44px;
  font-size: 16px; /* Prevent iOS Safari zoom while filtering drinks. */
  scroll-margin-top: 84px;
`;
