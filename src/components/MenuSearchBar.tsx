import styled from "styled-components";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function SearchBar({
  value,
  onChange,
}: SearchBarProps) {
  return (
    <SearchContainer>
      <Input
        type="text"
        placeholder="Search menu..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </SearchContainer>
  );
}

const SearchContainer = styled.div`
  width: 100%;
  margin-bottom: 20px;
`;

const Input = styled.input`
  width: 100%;
`;