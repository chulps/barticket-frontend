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
  const { t } = useI18n();
  return (
    <SearchContainer>
      <Input
        type="text"
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
`;